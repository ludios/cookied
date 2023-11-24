import { env } from "cookied/lib/util";
import { make_parse_session_cookie_hook, type CookieOptions } from "cookied/lib/kit/session";
import type { Handle } from '@sveltejs/kit';

const cookie_options: CookieOptions = {
	name: env("SESSION_COOKIE_NAME"),
	path: env("SESSION_COOKIE_PATH"),
	secure: Boolean(Number(env("SESSION_COOKIE_SECURE"))),
};

export const handle: Handle = make_parse_session_cookie_hook(cookie_options, ({ session, event }) => {
	event.locals.session = session;
	console.log("setting session to", session);
});
