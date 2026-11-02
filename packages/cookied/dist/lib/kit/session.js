// Model-output: Claude Opus 5.5
import { A } from "ayy";
import { SessionsQuery } from "../db/session.js";
import { verify_password } from "../password.js";
import { BadSessionCookieError, SessionCookie } from "../session.js";
import { int8_to_number, throw_if_gt1 } from "../util.js";
import { getLogger } from "@logtape/logtape";
const logger = getLogger(["cookied"]);
/**
 * The usernames that users.sql's `username` domain could allow: 1 to 31 ASCII letters, digits,
 * and dashes. The domain forbids some of these too, such as one that is only digits.
 */
const POSSIBLE_USERNAME = /^[-a-zA-Z0-9]{1,31}$/;
/**
 * @param form_data a submitted form
 * @param name      the name of one of its fields
 * @returns the text in the field, or "" if the form has no such field or the field holds a file
 */
function text_field(form_data, name) {
    const value = form_data.get(name);
    return typeof value === "string" ? value : "";
}
export class SessionKit {
    #database_config;
    #cookie_options;
    #sessions_query;
    constructor(database_config, cookie_options) {
        this.#database_config = database_config;
        this.#cookie_options = cookie_options;
        this.#sessions_query = new SessionsQuery(this.#database_config);
    }
    // Clear our session cookie as per `cookie_options`.
    #clear_session_cookie(kit_cookies) {
        kit_cookies.delete(this.#cookie_options.name, {
            path: this.#cookie_options.path,
            secure: this.#cookie_options.secure,
        });
    }
    // Set our session cookie `session_cookie` as per `cookie_options`.
    #set_session_cookie(kit_cookies, session_cookie) {
        const expires = new Date();
        expires.setDate(expires.getDate() + 400);
        kit_cookies.set(this.#cookie_options.name, session_cookie.toString(), {
            path: this.#cookie_options.path,
            secure: this.#cookie_options.secure,
            priority: "high",
            // Might need to be set for Bromite to keep the cookie
            expires,
            // https://developer.chrome.com/blog/cookie-max-age-expires/
            maxAge: 400 * 24 * 3600,
        });
    }
    // Return a server hook function which parses and validates the session info on the session
    // cookie in the request, suitable for use in `export const handle: Handle = ...` in
    // `hooks.server.ts` in a SvelteKit application.
    //
    // Also, if the session is valid, always set the session cookie again on the response,
    // to avoid expiry.
    //
    // This is indirected partly to deal with `event.locals.session = session;` requiring
    // the `interface Locals { session: ... }` in the SvelteKit app's `app.d.ts`.
    make_parse_session_cookie_hook(got_session) {
        return async ({ event, resolve }) => {
            const cookies = event.cookies;
            // Only the names: a value may be a secret, such as that of our session cookie
            logger.debug("names of cookies from client {names}", () => ({ names: cookies.getAll().map((c) => c.name) }));
            const s_cookie = cookies.get(this.#cookie_options.name);
            if (!s_cookie) {
                return resolve(event);
            }
            let cookie;
            try {
                cookie = SessionCookie.parse(s_cookie);
            }
            catch (e) {
                if (e instanceof BadSessionCookieError) {
                    logger.warn("session cookie failed to parse ({reason}), clearing it", { reason: e.message });
                    this.#clear_session_cookie(cookies);
                }
                else {
                    throw e;
                }
            }
            if (!cookie) {
                return resolve(event);
            }
            const session = await this.#sessions_query.validate(cookie);
            if (!session) {
                logger.warn("session cookie names session {id}, which is not in the database or has another secret; clearing the cookie", { id: cookie.id });
                this.#clear_session_cookie(cookies);
                return resolve(event);
            }
            got_session({ session, event });
            // Set the session cookie again, to avoid expiry
            this.#set_session_cookie(event.cookies, cookie);
            return await resolve(event);
        };
    }
    make_login_action(already_logged_in) {
        return async (event) => {
            if (already_logged_in(event)) {
                return { error: "already logged in" };
            }
            const form_data = await event.request.formData();
            const form_username = text_field(form_data, "username");
            const form_password = text_field(form_data, "password");
            // Bail out early if possible, since users.sql doesn't allow empty usernames
            if (!form_username) {
                logger.info("empty username {form_username}", { form_username });
                return { error: "empty username" };
            }
            if (!form_password) {
                logger.info("empty password provided by {form_username}", { form_username });
                return { error: "empty password" };
            }
            // No user has such a username, so the answer can come at once without telling anything.
            // It also keeps out what PostgreSQL would reject, such as a NUL character.
            if (!POSSIBLE_USERNAME.test(form_username)) {
                logger.info("impossible username {form_username}", { form_username });
                return { error: "incorrect username or password" };
            }
            const sql = this.#database_config.sql;
            const row = throw_if_gt1(await sql `
					SELECT id, username, hashed_password
					FROM ${sql(this.#database_config.identifiers.users)}
					WHERE LOWER(username) = ${form_username.toLowerCase()}
				`).at(0);
            // Sanity-check the row from the database: ensure username match
            const user = row?.username.toLowerCase() === form_username.toLowerCase() ? row : null;
            if (row && !user) {
                logger.warn("the database matched {form_username} to user {username}, whose username differs in more than case", { form_username, username: row.username });
            }
            // Even with no such user, so that the time taken doesn't tell whether the user exists
            const password_is_correct = await verify_password(form_password, user?.hashed_password ?? null);
            // One answer for both, so that it doesn't tell whether the user exists
            if (!user) {
                logger.info("no such user {form_username}", { form_username });
                return { error: "incorrect username or password" };
            }
            if (!password_is_correct) {
                logger.info("incorrect password provided by {form_username}", { form_username });
                return { error: "incorrect username or password" };
            }
            // Create a new session in the database
            A(password_is_correct); // Sanity check
            const user_agent = event.request.headers.get("User-Agent");
            const { id, secret } = await this.#sessions_query.create(int8_to_number(user.id), user_agent || "");
            // Set a session cookie in the HTTP response
            const s_cookie = new SessionCookie(id, secret);
            this.#set_session_cookie(event.cookies, s_cookie);
            return { success: true };
        };
    }
    make_logout_action() {
        return async ({ cookies, locals }) => {
            const { session } = locals;
            if (session) {
                // Remove the session from the database
                await this.#sessions_query.delete_by_ids_and_user_id([session.id], session.user_id);
            }
            else {
                logger.info("no session to log out");
            }
            this.#clear_session_cookie(cookies);
        };
    }
}
//# sourceMappingURL=session.js.map