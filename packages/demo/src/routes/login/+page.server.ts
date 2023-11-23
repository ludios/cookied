import { inspect } from "util";
import { Session } from "cookied/lib/db/session";
import { SessionCookie } from "cookied/lib/session";
import { env, throw_if_gt1 } from "cookied/lib/util";
import { PrismaClient } from "@prisma/client";
import type { Actions } from "./$types";
import { set_session_cookie, type CookieOptions } from "cookied/lib/kit/session";
import { argon2Verify } from "hash-wasm";
import { A } from "ayy";

const cookie_options: CookieOptions = {
	name: env("SESSION_COOKIE_NAME"),
	path: env("SESSION_COOKIE_PATH"),
	secure: Boolean(Number(env("SESSION_COOKIE_SECURE"))),
};

export const actions = {
	default: async ({ cookies, request }) => {
		const form_data = await request.formData();
		const username = form_data.get("username") as string;

		const prisma = new PrismaClient();
		// We have an index on LOWER(username) but not username
		const users = throw_if_gt1(
			(await prisma.$queryRaw`
				SELECT id, username, hashed_password
				FROM cookied.users
				WHERE LOWER(username) = ${username.toLowerCase()}
			`) satisfies Array<{ id: bigint; username: string, hashed_password: string }>,
		);
		// Sanity-check the row from the database: ensure username match
		if (!(users.length && users[0].username.toLowerCase() === username.toLowerCase())) {
			console.log("no such user", { username });
			return {"error": "no such user"};
		}
		const user = users[0];

		const password_is_correct = await argon2Verify({
			password: form_data.get("password") as string,
			hash: user.hashed_password,
		});
		if (!password_is_correct) {
			console.log("incorrect password", { username });
			return {"error": "incorrect password"};
		}
		// Sanity check because this is pretty important
		A(password_is_correct);

		// Create a new session in the database
		const { id, secret } = await Session.create(user.id, request.headers.get("User-Agent") || "");

		// Set a session cookie in the HTTP response
		const s_cookie = new SessionCookie(id, secret);
		set_session_cookie(cookie_options, cookies, s_cookie);
		return {"success": true}
	},
} satisfies Actions;
