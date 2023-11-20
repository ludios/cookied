import { Session } from "cookied/lib/db/session";
import { BadSessionCookieError, SessionCookie } from "cookied/lib/session";
import { env } from "cookied/lib/util";
import { make_hook } from "cookied/lib/kit/session";
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

const cookie_options = {
	name: SESSION_COOKIE_NAME,
	path: SESSION_COOKIE_PATH,
	secure: SESSION_COOKIE_SECURE,
};

export const handle: Handle = make_hook(cookie_options, ({ session, event }) => {
	event.locals.session = session;
	console.log("setting session to", session);
});
