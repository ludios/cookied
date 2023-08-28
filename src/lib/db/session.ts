import crypto from "node:crypto";
import type { SessionCookie } from "$lib/session";
import { PrismaClient } from "@prisma/client";
import { getOneRow } from "../util";

const prisma = new PrismaClient();

type MinimizedDatabaseSession = {
	id: number;
	user_id: number;
	birth_time: Date;
	user_agent_seen_first: string;
};

export class Session {
	static async byId(session_id: bigint) {
		return prisma.sessions.findUnique({ where: { id: session_id } });
	}

	static async create(userId: bigint, userAgent: string): Promise<{ id: bigint; secret: Buffer }> {
		// Prisma is unable to get a record ("Failed to deserialize column of type 'record'"),
		// so convert the record to some columns.
		return getOneRow(
			(await prisma.$queryRaw`
			SELECT id, secret
			FROM cards.new_session(${userId}, ${userAgent})
			AS (id bigint, secret bytea);
		`) satisfies Array<{ id: bigint; secret: Buffer }>,
		);
	}

	static async validate(session: SessionCookie): Promise<MinimizedDatabaseSession | null> {
		const dbSession = await Session.byId(session.id);
		if (!dbSession) {
			return null;
		}
		if (!crypto.timingSafeEqual(session.hashedSecret(), dbSession.hashed_secret)) {
			return null;
		}
		return {
			id: Number(dbSession.id),
			user_id: Number(dbSession.user_id),
			birth_time: dbSession.birth_time,
			user_agent_seen_first: dbSession.user_agent_seen_first,
		};
	}
}
