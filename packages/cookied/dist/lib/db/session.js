// Model-output: Claude Opus 5.5
import crypto from "node:crypto";
import { get_one_row, int8_to_number, throw_if_gt1 } from "../util.js";
/**
 * @param row a row as a postgres.js pool returns it from a query on sessions_view
 * @returns the same row, with `id` and `user_id` converted to numbers
 */
function with_number_ids(row) {
    return { ...row, id: int8_to_number(row.id), user_id: int8_to_number(row.user_id) };
}
export class SessionsQuery {
    #ids;
    #sql;
    constructor(config) {
        this.#ids = config.identifiers;
        this.#sql = config.sql;
    }
    async find_by_ids(session_ids) {
        const rows = await this.#sql `
			SELECT id, user_id, username, birth_time, hashed_secret, user_agent_seen_first
			FROM ${this.#sql(this.#ids.sessions_view)} WHERE id = ANY(${session_ids})
		`;
        return rows.map(with_number_ids);
    }
    async find_minimized_by_user_id(user_id) {
        const rows = await this.#sql `
			SELECT id, user_id, username, birth_time, user_agent_seen_first
			FROM ${this.#sql(this.#ids.sessions_view)} WHERE user_id = ${user_id}
		`;
        return rows.map(with_number_ids);
    }
    async create(user_id, user_agent) {
        const row = get_one_row(await this.#sql `
				SELECT id, secret
				FROM ${this.#sql(this.#ids.new_session)}(${user_id}, ${user_agent})
				AS (id bigint, secret bytea);
			`);
        return { id: int8_to_number(row.id), secret: row.secret };
    }
    async delete_by_ids_and_user_id(session_ids, user_id) {
        await this.#sql `
			DELETE FROM ${this.#sql(this.#ids.sessions)}
			WHERE id = ANY(${session_ids})
			AND user_id = ${user_id}
		`;
    }
    async validate(session) {
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
//# sourceMappingURL=session.js.map