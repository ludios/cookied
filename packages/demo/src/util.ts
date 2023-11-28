import { env } from "cookied/lib/util";
import type { Config } from "cookied/lib/db/config";
import type { CookieOptions } from "cookied/lib/kit/session";

export function cookie_options_from_env(): CookieOptions {
	return {
		name: env("SESSION_COOKIE_NAME"),
		path: env("SESSION_COOKIE_PATH"),
		secure: Boolean(Number(env("SESSION_COOKIE_SECURE"))),
	};
}

const schema = "cookied";
export const database_config: Config = {
	identifiers: {
		users: `${schema}.users`,
		sessions: `${schema}.sessions`,
		sessions_view: `${schema}.sessions_view`,
		new_session: `${schema}.new_session`,
	},
};
