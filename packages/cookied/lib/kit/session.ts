import { BadSessionCookieError, SessionCookie } from "../session.js";
import { type MinimizedDatabaseSession, Session } from "../db/session.js";
import type { Handle, Cookies, RequestEvent } from "@sveltejs/kit";
import { throw_if_gt1, sql } from "../util.js";
import { argon2Verify } from "hash-wasm";
import { A } from "ayy";

export type CookieOptions = {
	// Name for the session cookie, e.g. "s" or some other name unique for the domain
	name: string,
	// The path under which the cookie is valid. Should usually be "/".
	path: string,
	// Whether the cookie should be valid on HTTPS only.
	secure: boolean,
}

// Clear our session cookie as per `cookie_options`.
export function clear_session_cookie(cookie_options: CookieOptions, kit_cookies: Cookies) {
	kit_cookies.delete(cookie_options.name, {
		path: cookie_options.path,
		secure: cookie_options.secure,
	});
}

// Set our session cookie `session_cookie` as per `cookie_options`.
export function set_session_cookie(cookie_options: CookieOptions, kit_cookies: Cookies, session_cookie: SessionCookie) {
	kit_cookies.set(cookie_options.name, session_cookie.toString(), {
		path: cookie_options.path,
		secure: cookie_options.secure,
		priority: "high",
		// https://developer.chrome.com/blog/cookie-max-age-expires/
		maxAge: 400 * 24 * 3600,
	});
}

type GotSessionCallback = (
	{ session, event }: {
		session: MinimizedDatabaseSession,
		event: RequestEvent
	}
) => void;

// Return a server hook function which parses and validates the session info on the session
// cookie in the request, suitable for use in `export const handle: Handle = ...` in
// `hooks.server.ts` in a SvelteKit application.
//
// Also, if the session is valid, always set the session cookie again on the response,
// to avoid expiry.
//
// This is indirected partly to deal with `event.locals.session = session;` requiring
// the `interface Locals { session: ... }` in the SvelteKit app's `app.d.ts`.
export function make_parse_session_cookie_hook(cookie_options: CookieOptions, got_session: GotSessionCallback): Handle {
	return async ({ event, resolve }) => {
		const cookies = event.cookies;
		console.debug("cookies from client", cookies.getAll());
		const s_cookie = cookies.get(cookie_options.name);
		if (!s_cookie) {
			return resolve(event);
		}
		let cookie;
		try {
			cookie = SessionCookie.parse(s_cookie);
		} catch (e) {
			if (e instanceof BadSessionCookieError) {
				console.debug("session cookie failed to parse, clearing it", { s_cookie });
				clear_session_cookie(cookie_options, cookies);
			} else {
				throw e;
			}
		}
		if (!cookie) {
			return resolve(event);
		}
		const session = await Session.validate(cookie);
		if (!session) {
			console.debug("session cookie references session not in database, clearing cookie", { cookie });
			cookie = null;
			clear_session_cookie(cookie_options, cookies);
			return resolve(event);
		}
		got_session({ session, event });
		// Set the session cookie again, to avoid expiry
		set_session_cookie(cookie_options, event.cookies, cookie);
		return await resolve(event);
	};
}

export function make_login_action(cookie_options: CookieOptions, already_logged_in: (event: RequestEvent) => boolean) {
	return async (event: RequestEvent) => {
		if (already_logged_in(event)) {
			return {"error": "already logged in"};
		}

		const form_data = await event.request.formData();
		const form_username = form_data.get("username") as string;
		const form_password = form_data.get("password") as string;

		// Bail out early if possible, since users.sql doesn't allow empty usernames
		if (!form_username) {
			console.log("empty username", { form_username });
			return {"error": "empty username"};
		}

		if (!form_password) {
			console.log("empty password", { form_username });
			return {"error": "empty password"};
		}

		const users = throw_if_gt1(
			(await sql`
				SELECT id, username, hashed_password
				FROM cookied.users
				WHERE LOWER(username) = ${form_username.toLowerCase()}
			`) satisfies Array<{ id: number; username: string, hashed_password: string }>,
		);
		// Sanity-check the row from the database: ensure username match
		if (!(users.length && users[0].username.toLowerCase() === form_username.toLowerCase())) {
			console.log("no such user", { form_username });
			return {"error": "no such user"};
		}
		const user = users[0];

		const password_is_correct = await argon2Verify({
			password: form_password,
			hash: user.hashed_password,
		});
		if (!password_is_correct) {
			console.log("incorrect password", { form_username });
			return {"error": "incorrect password"};
		}

		// Create a new session in the database
		A(password_is_correct); // Sanity check
		const user_agent = event.request.headers.get("User-Agent");
		const { id, secret } = await Session.create(user.id, user_agent || "");

		// Set a session cookie in the HTTP response
		const s_cookie = new SessionCookie(id, secret);
		set_session_cookie(cookie_options, event.cookies, s_cookie);
		return {"success": true}
	}
}

export function make_logout_action(cookie_options: CookieOptions) {
	return async ({ cookies, locals }: { cookies: Cookies, locals: unknown }) => {
		const { session } = locals as { session: MinimizedDatabaseSession };

		if (session?.id) {
			// Remove the session from the database
			Session.delete_by_ids([session.id]);
		} else {
			console.log("no session to log out");
		}

		clear_session_cookie(cookie_options, cookies);
	}
}
