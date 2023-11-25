import { make_login_action } from "cookied/lib/kit/session";
import type { Actions } from "@sveltejs/kit";
import { cookie_options_from_env } from "../../util";
import type { RequestEvent } from "@sveltejs/kit";

function already_logged_in(event: RequestEvent) {
	return !!event.locals.session;
}

export const actions = {
	default: make_login_action(cookie_options_from_env(), already_logged_in)
} satisfies Actions;
