import { SessionKit } from "cookied/lib/kit/session.js";
import { database_config } from "./util";
import type { Handle } from '@sveltejs/kit';
import { cookie_options_from_env } from "./util";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["demo"]);

const sk = new SessionKit(database_config, cookie_options_from_env());

export const handle: Handle = sk.make_parse_session_cookie_hook(
	({ session, event }) => {
		event.locals.session = session;
		logger.debug("setting session to {session}", { session });
	}
);
