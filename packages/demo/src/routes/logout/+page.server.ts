import type { Actions } from "@sveltejs/kit";
import { cookie_options_from_env } from "../../util";
import { database_config } from "../../util";
import { SessionKit } from "cookied/lib/kit/session";

const sk = new SessionKit(database_config, cookie_options_from_env());

export const actions = {
	default: sk.make_logout_action()
} satisfies Actions;
