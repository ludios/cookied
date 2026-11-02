// Model-output: Claude Opus 5.5

import crypto from "node:crypto";
import type { Sql } from "postgres";
import type { SessionCookie } from "../session.js";
import type { Config, Identifiers } from "./config.js";
import { get_one_row, type Int8, int8_to_number, throw_if_gt1 } from "../util.js";

export type MinimizedDatabaseSession = {
	id: number;
	user_id: number;
	birth_time: Date;
	user_agent_seen_first: string;
	username: string;
};

export type DatabaseSession = MinimizedDatabaseSession & {
	hashed_secret: Buffer;
};

// A row of type `T`, as a postgres.js pool returns it from a query on sessions_view
type SessionRow<T> = Omit<T, "id" | "user_id"> & { id: Int8; user_id: Int8 };

/**
 * @param row a row as a postgres.js pool returns it from a query on sessions_view
 * @returns the same row, with `id` and `user_id` as numbers
 */
function with_number_ids<T extends MinimizedDatabaseSession>(row: SessionRow<T>): T {
	return { ...row, id: int8_to_number(row.id), user_id: int8_to_number(row.user_id) } as T;
}

export class SessionsQuery {
	#ids: Identifiers;
	#sql: Sql;

	constructor(config: Config) {
		this.#ids = config.identifiers;
		this.#sql = config.sql;
	}

	async find_by_ids(session_ids: [number]): Promise<ReadonlyArray<DatabaseSession>> {
		const rows = await this.#sql<Array<SessionRow<DatabaseSession>>>`
			SELECT id, user_id, username, birth_time, hashed_secret, user_agent_seen_first
			FROM ${this.#sql(this.#ids.sessions_view)} WHERE id = ANY(${session_ids})
		`;
		return rows.map((row) => with_number_ids<DatabaseSession>(row));
	}

	async find_minimized_by_user_id(user_id: number): Promise<ReadonlyArray<MinimizedDatabaseSession>> {
		const rows = await this.#sql<Array<SessionRow<MinimizedDatabaseSession>>>`
			SELECT id, user_id, username, birth_time, user_agent_seen_first
			FROM ${this.#sql(this.#ids.sessions_view)} WHERE user_id = ${user_id}
		`;
		return rows.map((row) => with_number_ids<MinimizedDatabaseSession>(row));
	}

	async create(user_id: number, user_agent: string): Promise<{ id: number; secret: Buffer }> {
		const row = get_one_row(
			await this.#sql<Array<{ id: Int8; secret: Buffer }>>`
				SELECT id, secret
				FROM ${this.#sql(this.#ids.new_session)}(${user_id}, ${user_agent})
				AS (id bigint, secret bytea);
			`,
		);
		return { id: int8_to_number(row.id), secret: row.secret };
	}

	async delete_by_ids_and_user_id(session_ids: [number], user_id: number): Promise<void> {
		await this.#sql`
			DELETE FROM ${this.#sql(this.#ids.sessions)}
			WHERE id = ANY(${session_ids})
			AND user_id = ${user_id}
		`;
	}

	async validate(session: SessionCookie): Promise<MinimizedDatabaseSession | null> {
		const db_session = throw_if_gt1(await this.find_by_ids([session.id]))[0];
		if (!db_session) {
			return null;
		}
		if (!crypto.timingSafeEqual(session.hashedSecret(), db_session.hashed_secret)) {
			return null;
		}
		return {
			id: db_session.id,
			user_id: db_session.user_id,
			birth_time: db_session.birth_time,
			user_agent_seen_first: db_session.user_agent_seen_first,
			username: db_session.username,
		};
	}
}
