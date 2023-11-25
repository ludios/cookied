import { env } from "cookied/lib/util";
import type { CookieOptions } from "cookied/lib/kit/session";

export function cookie_options_from_env(): CookieOptions {
	return {
		name: env("SESSION_COOKIE_NAME"),
		path: env("SESSION_COOKIE_PATH"),
		secure: Boolean(Number(env("SESSION_COOKIE_SECURE"))),
	};
}
