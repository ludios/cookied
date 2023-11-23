import { env } from "cookied/lib/util";
import { make_logout_action } from "cookied/lib/kit/user";
import type { CookieOptions } from "cookied/lib/kit/session";
import type { Actions } from "./$types";

const cookie_options: CookieOptions = {
	name: env("SESSION_COOKIE_NAME"),
	path: env("SESSION_COOKIE_PATH"),
	secure: Boolean(Number(env("SESSION_COOKIE_SECURE"))),
};

export const actions = {
	default: make_logout_action(cookie_options)
} satisfies Actions;
