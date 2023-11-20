import { Session } from "cookied/lib/db/session";
import { BadSessionCookieError, SessionCookie } from "cookied/lib/session";
import { env } from "cookied/lib/util";
import type { Handle, Cookies } from '@sveltejs/kit';

const SESSION_COOKIE_NAME: string = env("SESSION_COOKIE_NAME");
const SESSION_COOKIE_PATH: string = env("SESSION_COOKIE_PATH");
const SESSION_COOKIE_SECURE: boolean = Boolean(Number(env("SESSION_COOKIE_SECURE")));

function clear_session_cookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE_NAME, {
		path: SESSION_COOKIE_PATH,
		secure: SESSION_COOKIE_SECURE,
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	const cookies = event.cookies;
	console.log("cookies", cookies.getAll());
	const s_cookie = cookies.get(SESSION_COOKIE_NAME);
	if (!s_cookie) {
		return resolve(event);
	}
	let cookie;
	try {
		cookie = SessionCookie.parse(s_cookie);
	} catch (e) {
		if (e instanceof BadSessionCookieError) {
			console.debug("session cookie failed to parse, clearing it", { s_cookie });
			clear_session_cookie(cookies);
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
		clear_session_cookie(cookies);
		return resolve(event);
	}
	event.locals.session = session;
	console.log("setting session to", session);

	return resolve(event);
};
