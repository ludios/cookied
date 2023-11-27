import crypto from "node:crypto";
import type { SessionCookie } from "../session.js";
import { get_one_row, sql, throw_if_gt1 } from "../util.js";

export type MinimizedDatabaseSession = {
	id: number;
	user_id: number;
	birth_time: Date;
	user_agent_seen_first: string;
	username: string;
};

export class Session {
	static async find_by_ids(session_ids: [number]) {
		return await sql`
			SELECT id, user_id, username, birth_time, hashed_secret, user_agent_seen_first
			FROM cookied.sessions_view WHERE id = ANY(${session_ids})
		`;
	}

	static async find_minimized_by_user_id(user_id: number): Promise<Array<MinimizedDatabaseSession>> {
		return await sql`
			SELECT id, user_id, username, birth_time, user_agent_seen_first
			FROM cookied.sessions_view WHERE user_id = ${user_id}
		`;
	}

	static async create(user_id: number, user_agent: string): Promise<{ id: number; secret: Buffer }> {
		return get_one_row(
			(await sql`
				SELECT id, secret
				FROM cookied.new_session(${user_id}, ${user_agent})
				AS (id bigint, secret bytea);
			`) satisfies Array<{ id: number; secret: Buffer }>,
		);
	}

	static async delete_by_ids_and_user_id(session_ids: [number], user_id: number): Promise<void> {
		await sql`
			DELETE FROM cookied.sessions
			WHERE id = ANY(${session_ids})
			AND user_id = ${user_id}
		`;
	}

	static async validate(session: SessionCookie): Promise<MinimizedDatabaseSession | null> {
		const db_session = throw_if_gt1(await Session.find_by_ids([session.id]))[0];
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
