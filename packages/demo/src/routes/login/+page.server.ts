import { env } from "cookied/lib/util";
import type { CookieOptions } from "cookied/lib/kit/session";
import { make_login_action } from "cookied/lib/kit/user";
import type { Actions } from "@sveltejs/kit";

const cookie_options: CookieOptions = {
	name: env("SESSION_COOKIE_NAME"),
	path: env("SESSION_COOKIE_PATH"),
	secure: Boolean(Number(env("SESSION_COOKIE_SECURE"))),
};

export const actions = {
	default: make_login_action(cookie_options, "cookied")
} satisfies Actions;
