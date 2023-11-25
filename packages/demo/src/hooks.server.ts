import { env } from "cookied/lib/util";
import { make_parse_session_cookie_hook, type CookieOptions } from "cookied/lib/kit/session";
import type { Handle } from '@sveltejs/kit';
import { cookie_options_from_env } from "./util";

export const handle: Handle = make_parse_session_cookie_hook(
	cookie_options_from_env(),
	({ session, event }) => {
		event.locals.session = session;
		console.log("setting session to", session);
	}
);
