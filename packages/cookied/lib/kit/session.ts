import { Session } from "../db/session.js";
import { BadSessionCookieError, SessionCookie } from "../session.js";
import type { MinimizedDatabaseSession } from "../db/session.js";
import type { Handle, Cookies, RequestEvent } from "@sveltejs/kit";

export type CookieOptions = {
    // Name for the session cookie, e.g. "s" or some other name unique for the domain
    name: string,
    // The path under which the cookie is valid. Should usually be "/".
    path: string,
    // Whether the cookie should be valid on HTTPS only.
    secure: boolean,
}

// On the `cookies` object for the response, clear our session cookie as per `cookie_options`.
export function clear_session_cookie(cookie_options: CookieOptions, cookies: Cookies) {
	cookies.delete(cookie_options.name, {
		path: cookie_options.path,
		secure: cookie_options.secure,
	});
}

// On the `cookies` object for the response, set our session cookie `s_cookie` as per `cookie_options`.
export function set_session_cookie(cookie_options: CookieOptions, cookies: Cookies, s_cookie: SessionCookie) {
    cookies.set(cookie_options.name, s_cookie.toString(), {
        path: cookie_options.path,
        secure: cookie_options.secure,
        priority: "high",
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
// This is indirected partly to deal with `event.locals.session = session;` requiring
// the `interface Locals { session: ... }` in the SvelteKit app's `app.d.ts`.
export function make_hook(cookie_options: CookieOptions, got_session: GotSessionCallback): Handle {
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
        return resolve(event);
    };
}
