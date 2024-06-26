import type { Cookies, Handle, RequestEvent } from "@sveltejs/kit";
import { A } from "ayy";
import { argon2Verify } from "hash-wasm";
import { type MinimizedDatabaseSession, SessionsQuery } from "../db/session.js";
import type { Config } from "../db/config.js";
import { BadSessionCookieError, SessionCookie } from "../session.js";
import { sql, throw_if_gt1 } from "../util.js";

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
			//console.debug("cookies from client", cookies.getAll());
			const s_cookie = cookies.get(this.#cookie_options.name);
			if (!s_cookie) {
				return resolve(event);
			}
			let cookie;
			try {
				cookie = SessionCookie.parse(s_cookie);
			} catch (e) {
				if (e instanceof BadSessionCookieError) {
					console.debug("session cookie failed to parse, clearing it", { s_cookie });
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
				console.debug("session cookie references session not in database, clearing cookie", { cookie });
				cookie = null;
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
			const form_username = form_data.get("username") as string;
			const form_password = form_data.get("password") as string;

			// Bail out early if possible, since users.sql doesn't allow empty usernames
			if (!form_username) {
				console.log("empty username", { form_username });
				return { error: "empty username" };
			}

			if (!form_password) {
				console.log("empty password", { form_username });
				return { error: "empty password" };
			}

			const users = throw_if_gt1(
				(await sql`
					SELECT id, username, hashed_password
					FROM ${sql(this.#database_config.identifiers.users)}
					WHERE LOWER(username) = ${form_username.toLowerCase()}
				`) satisfies ReadonlyArray<{ id: number; username: string; hashed_password: string }>,
			);
			// Sanity-check the row from the database: ensure username match
			if (!(users.length && users[0].username.toLowerCase() === form_username.toLowerCase())) {
				console.log("no such user", { form_username });
				return { error: "no such user" };
			}
			const user = users[0];

			const password_is_correct = await argon2Verify({
				password: form_password,
				hash: user.hashed_password,
			});
			if (!password_is_correct) {
				console.log("incorrect password", { form_username });
				return { error: "incorrect password" };
			}

			// Create a new session in the database
			A(password_is_correct); // Sanity check
			const user_agent = event.request.headers.get("User-Agent");
			const { id, secret } = await this.#sessions_query.create(user.id, user_agent || "");

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
				console.log("no session to log out");
			}

			this.#clear_session_cookie(cookies);
		};
	}
}
