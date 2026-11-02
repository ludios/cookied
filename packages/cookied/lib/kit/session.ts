// Model-output: Claude Opus 5.5

import type { Cookies, RequestEvent } from "@sveltejs/kit";
import { A } from "ayy";
import { type MinimizedDatabaseSession, SessionsQuery } from "../db/session.js";
import type { Config } from "../db/config.js";
import { verify_password } from "../password.js";
import { BadSessionCookieError, SessionCookie } from "../session.js";
import { type Int8, int8_to_number, throw_if_gt1 } from "../util.js";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["cookied"]);

export type CookieOptions = {
	// Name for the session cookie, e.g. "s" or some other name unique for the domain
	name: string;
	// The path under which the cookie is valid. Should usually be "/".
	path: string;
	// Whether the cookie should be valid on HTTPS only.
	secure: boolean;
};

type GotSessionCallback = ({
	session,
	event,
}: {
	session: MinimizedDatabaseSession;
	event: RequestEvent;
}) => void;

// A SvelteKit `handle` hook. SvelteKit 2 exports its type as `Handle` from
// "@sveltejs/kit", and SvelteKit 3 exports it as `Handle` from "@sveltejs/kit/hooks";
// a function of this type can be assigned to either of them.
type Handle = (input: {
	event: RequestEvent;
	resolve: (event: RequestEvent) => Response | Promise<Response>;
}) => Promise<Response>;

/**
 * @param form_data a submitted form
 * @param name      the name of one of its fields
 * @returns the text in the field, or "" if the form has no such field or the field holds a file
 */
function text_field(form_data: FormData, name: string): string {
	const value = form_data.get(name);
	return typeof value === "string" ? value : "";
}

export class SessionKit {
	#database_config: Config;
	#cookie_options: CookieOptions;
	#sessions_query: SessionsQuery;

	constructor(database_config: Config, cookie_options: CookieOptions) {
		this.#database_config = database_config;
		this.#cookie_options = cookie_options;
		this.#sessions_query = new SessionsQuery(this.#database_config);
	}

	// Clear our session cookie as per `cookie_options`.
	#clear_session_cookie(kit_cookies: Cookies) {
		kit_cookies.delete(this.#cookie_options.name, {
			path: this.#cookie_options.path,
			secure: this.#cookie_options.secure,
		});
	}

	// Set our session cookie `session_cookie` as per `cookie_options`.
	#set_session_cookie(kit_cookies: Cookies, session_cookie: SessionCookie) {
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
	make_parse_session_cookie_hook(got_session: GotSessionCallback): Handle {
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
			} catch (e) {
				if (e instanceof BadSessionCookieError) {
					logger.warn("session cookie failed to parse ({reason}), clearing it", { reason: e.message });
					this.#clear_session_cookie(cookies);
				} else {
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

	make_login_action(already_logged_in: (event: RequestEvent) => boolean) {
		return async (event: RequestEvent) => {
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

			const sql = this.#database_config.sql;
			const users = throw_if_gt1(
				await sql<Array<{ id: Int8; username: string; hashed_password: string }>>`
					SELECT id, username, hashed_password
					FROM ${sql(this.#database_config.identifiers.users)}
					WHERE LOWER(username) = ${form_username.toLowerCase()}
				`,
			);
			// Sanity-check the row from the database: ensure username match
			const user = users.length === 1 && users[0].username.toLowerCase() === form_username.toLowerCase() ? users[0] : null;

			// Even with no such user, so that the time taken doesn't tell whether the user exists
			const password_is_correct = await verify_password(form_password, user?.hashed_password ?? null);
			if (!user) {
				logger.info("no such user {form_username}", { form_username });
				return { error: "no such user" };
			}
			if (!password_is_correct) {
				logger.info("incorrect password provided by {form_username}", { form_username });
				return { error: "incorrect password" };
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
		return async ({ cookies, locals }: { cookies: Cookies; locals: unknown }) => {
			const { session } = locals as { session: MinimizedDatabaseSession };

			if (session) {
				// Remove the session from the database
				await this.#sessions_query.delete_by_ids_and_user_id([session.id], session.user_id);
			} else {
				logger.info("no session to log out");
			}

			this.#clear_session_cookie(cookies);
		};
	}
}
