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
	default: async ({ cookies, request }) => {
		const formData = await request.formData();
		const username = formData.get("username") as string;

		const prisma = new PrismaClient();
		// We have an index on LOWER(username) but not username
		const users = throw_if_gt1(
			(await prisma.$queryRaw`
				SELECT id, username
				FROM cards.users
				WHERE LOWER(username) = ${username.toLowerCase()}
			`) satisfies Array<{ id: bigint; username: string }>,
		);
		if (!(users.length && users[0].username === username)) {
			console.log("no such user", { username });
			return;
		}
		const user = users[0];
		console.log(`Found user! ${inspect(user)}`);

		// Create a new session in the database
		const { id, secret } = await Session.create(user.id, request.headers.get("User-Agent") || "");

		// Set a session cookie in the HTTP response
		const s_cookie = new SessionCookie(id, secret);
		cookies.set(SESSION_COOKIE_NAME, s_cookie.toString(), {
			path: SESSION_COOKIE_PATH,
			secure: SESSION_COOKIE_SECURE,
			priority: "high",
		});
	},
} satisfies Actions;
