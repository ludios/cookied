import crypto from "node:crypto";
import type { SessionCookie } from "../session.js";
import { PrismaClient } from "@prisma/client";
import { get_one_row } from "../util.js";

const prisma = new PrismaClient();

export type MinimizedDatabaseSession = {
	id: number;
	user_id: number;
	birth_time: Date;
	user_agent_seen_first: string;
	username: string;
};

export class Session {
	static async byId(session_id: bigint) {
		return prisma.sessions_view.findUnique({ where: { id: session_id } });
	}

	static async create(user_id: bigint, user_agent: string): Promise<{ id: bigint; secret: Buffer }> {
		// Prisma is unable to get a record ("Failed to deserialize column of type 'record'"),
		// so convert the record to some columns.
		return get_one_row(
			(await prisma.$queryRaw`
				SELECT id, secret
				FROM new_session(${user_id}, ${user_agent})
				AS (id bigint, secret bytea);
			`) satisfies Array<{ id: bigint; secret: Buffer }>,
		);
	}

	static async delete(session_id: number): Promise<null> {
		await prisma.$queryRaw`
			DELETE FROM sessions
			WHERE id = ${session_id};
		`;
		return null;
	}

	static async validate(session: SessionCookie): Promise<MinimizedDatabaseSession | null> {
		const db_session = await Session.byId(session.id);
		if (!db_session) {
			return null;
		}
		if (!crypto.timingSafeEqual(session.hashedSecret(), db_session.hashed_secret)) {
			return null;
		}
		return {
			id: Number(db_session.id),
			user_id: Number(db_session.user_id),
			birth_time: db_session.birth_time,
			user_agent_seen_first: db_session.user_agent_seen_first,
			username: db_session.username,
		};
	}
}
