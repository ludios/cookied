import type { Actions } from "@sveltejs/kit";
import { cookie_options_from_env } from "../../util";
import type { RequestEvent } from "@sveltejs/kit";
import { database_config } from "../../util";
import { SessionKit } from "cookied/lib/kit/session";

const sk = new SessionKit(database_config, cookie_options_from_env());

function already_logged_in(event: RequestEvent) {
	return !!event.locals.session;
}

export const actions = {
	default: sk.make_login_action(already_logged_in)
} satisfies Actions;
