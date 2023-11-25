import { make_login_action } from "cookied/lib/kit/session";
import type { Actions } from "@sveltejs/kit";
import { cookie_options_from_env } from "../../util";

export const actions = {
	default: make_login_action(cookie_options_from_env())
} satisfies Actions;
