import { PrismaClient } from "@prisma/client";
import type { SessionCookie } from "$lib/session";
import { getOneRow } from "../util";
import crypto from "node:crypto";

const prisma = new PrismaClient();

export class Session {
	static async byId(session_id: bigint) {
		return prisma.sessions.findUnique({where: { id: session_id }});
	}

	static async create(userId: bigint, userAgent: string): Promise<{ id: bigint, secret: Buffer }> {
		// Prisma is unable to get a record ("Failed to deserialize column of type 'record'"),
		// so convert the record to some columns.
		return getOneRow(await prisma.$queryRaw`
			SELECT id, secret
			FROM cards.new_session(${userId}, ${userAgent})
			AS (id bigint, secret bytea);
		` satisfies Array<{ id: bigint, secret: Buffer }>);
	}

	static async isValid(session: SessionCookie): Promise<boolean> {
		const dbSession = await Session.byId(session.id);
		if (!dbSession) {
			return false;
		}
		return crypto.timingSafeEqual(session.hashedSecret(), dbSession.hashed_secret);
	}
}
