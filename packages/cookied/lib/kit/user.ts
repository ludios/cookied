import { Prisma } from '@prisma/client';
import { MinimizedDatabaseSession, Session } from "../db/session.js";
import { SessionCookie } from "../session.js";
import { throw_if_gt1 } from "../util.js";
import { PrismaClient } from "@prisma/client";
import { set_session_cookie, clear_session_cookie, type CookieOptions } from "./session.js";
import { argon2Verify } from "hash-wasm";
import { A } from "ayy";
import { Cookies } from "@sveltejs/kit";

export function make_login_action(cookie_options: CookieOptions, pg_schema: string) {
	return async ({ cookies, request }: { cookies: Cookies, request: Request }) => {
		const form_data = await request.formData();
		const form_username = form_data.get("username") as string;
		const form_password = form_data.get("password") as string;

		if (!form_password) {
			console.log("empty password", { form_username });
			return {"error": "empty password"};
		}

		const prisma = new PrismaClient();
		// https://github.com/prisma/prisma/issues/9765#issuecomment-1528729000
		const table = Prisma.sql([`${pg_schema}.users`]);
		// We have an index on LOWER(username) but not username
		const users = throw_if_gt1(
			(await prisma.$queryRaw`
				SELECT id, username, hashed_password
				FROM ${table}
				WHERE LOWER(username) = ${form_username.toLowerCase()}
			`) satisfies Array<{ id: bigint; username: string, hashed_password: string }>,
		);
		// Sanity-check the row from the database: ensure username match
		if (!(users.length && users[0].username.toLowerCase() === form_username.toLowerCase())) {
			console.log("no such user", { form_username });
			return {"error": "no such user"};
		}
		const user = users[0];

		const password_is_correct = await argon2Verify({
			password: form_password,
			hash: user.hashed_password,
		});
		if (!password_is_correct) {
			console.log("incorrect password", { form_username });
			return {"error": "incorrect password"};
		}
		// Sanity check because the above is security-critical
		A(password_is_correct);

		// Create a new session in the database
		const { id, secret } = await Session.create(user.id, request.headers.get("User-Agent") || "");

		// Set a session cookie in the HTTP response
		const s_cookie = new SessionCookie(id, secret);
		set_session_cookie(cookie_options, cookies, s_cookie);
		return {"success": true}
	}
}

export function make_logout_action(cookie_options: CookieOptions) {
	return async ({ cookies, locals }: { cookies: Cookies, locals: unknown }) => {
		const { session } = locals as { session: MinimizedDatabaseSession };

		if (session?.id) {
			// Remove the session from the database
			Session.delete(session.id);
		} else {
			console.log("no session to log out");
		}

		clear_session_cookie(cookie_options, cookies);
	}
}
