import type { Actions } from "./$types";
import { PrismaClient } from "@prisma/client";
import { inspect } from "util";

function throw_if_gt1<T>(rows: Array<T>): Array<T> {
	if (rows.length > 1) {
		throw Error(`expected 0 or 1 rows, got ${rows.length} rows: ${inspect(rows)}`);
	}
	return rows;
}

export const actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const username = formData.get("username") as string;

		const prisma = new PrismaClient();
		// We have an index on LOWER(username) but not username
		const users = throw_if_gt1(
			await prisma.$queryRaw`SELECT * FROM cards.users WHERE LOWER(username) = ${username.toLowerCase()}` satisfies Array<{ username: string }>,
		);
		if (users.length && users[0].username === username) {
			console.log(`Found user! ${inspect(users[0])}`);
		} else {
			console.log(`No such user (${username})!`);
		}
	},
} satisfies Actions;
