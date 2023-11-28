import { SessionKit } from "cookied/lib/kit/session";
import { database_config } from "./util";
import type { Handle } from '@sveltejs/kit';
import { cookie_options_from_env } from "./util";

const sk = new SessionKit(database_config, cookie_options_from_env());

export const handle: Handle = sk.make_parse_session_cookie_hook(
	({ session, event }) => {
		event.locals.session = session;
		//console.log("setting session to", session);
	}
);
