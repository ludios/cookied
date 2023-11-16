import { inspect } from "util";
import { Session } from "$lib/db/session";
import { SessionCookie } from "$lib/session";
import { env, throw_if_gt1 } from "$lib/util";
import { PrismaClient } from "@prisma/client";
import type { Actions } from "./$types";

const SESSION_COOKIE_NAME: string = env("SESSION_COOKIE_NAME");
const SESSION_COOKIE_PATH: string = env("SESSION_COOKIE_PATH");
const SESSION_COOKIE_SECURE: boolean = Boolean(Number(env("SESSION_COOKIE_SECURE")));

export const actions = {
	default: async ({ cookies, request, locals }) => {
		if (!locals.session) {
			console.log("no session to log out");
		}

		// // Remove the session from the database
		// Session.delete();

		// Clear the cookie
		cookies.delete(SESSION_COOKIE_NAME, {
			path: SESSION_COOKIE_PATH,
			secure: SESSION_COOKIE_SECURE,
		});
	},
} satisfies Actions;
