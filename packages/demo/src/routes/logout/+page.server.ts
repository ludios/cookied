import { Session } from "cookied/lib/db/session";
import { env } from "cookied/lib/util";
import type { Actions } from "./$types";

const SESSION_COOKIE_NAME: string = env("SESSION_COOKIE_NAME");
const SESSION_COOKIE_PATH: string = env("SESSION_COOKIE_PATH");
const SESSION_COOKIE_SECURE: boolean = Boolean(Number(env("SESSION_COOKIE_SECURE")));

export const actions = {
	default: async ({ cookies, locals }) => {
		const { session } = locals;

		if (session?.id) {
			// Remove the session from the database
			Session.delete(session.id);
		} else {
			console.log("no session to log out");
		}

		// Clear the cookie
		cookies.delete(SESSION_COOKIE_NAME, {
			path: SESSION_COOKIE_PATH,
			secure: SESSION_COOKIE_SECURE,
		});
	},
} satisfies Actions;
