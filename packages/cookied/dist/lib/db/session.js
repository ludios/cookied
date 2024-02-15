import crypto from "node:crypto";
import { get_one_row, sql, throw_if_gt1 } from "../util.js";
export class SessionsQuery {
    #ids;
    constructor(config) {
        this.#ids = config.identifiers;
    }
    async find_by_ids(session_ids) {
        return await sql `
			SELECT id, user_id, username, birth_time, hashed_secret, user_agent_seen_first
			FROM ${sql(this.#ids.sessions_view)} WHERE id = ANY(${session_ids})
		`;
    }
    async find_minimized_by_user_id(user_id) {
        return await sql `
			SELECT id, user_id, username, birth_time, user_agent_seen_first
			FROM ${sql(this.#ids.sessions_view)} WHERE user_id = ${user_id}
		`;
    }
    async create(user_id, user_agent) {
        return get_one_row((await sql `
				SELECT id, secret
				FROM ${sql(this.#ids.new_session)}(${user_id}, ${user_agent})
				AS (id bigint, secret bytea);
			`));
    }
    async delete_by_ids_and_user_id(session_ids, user_id) {
        await sql `
			DELETE FROM ${sql(this.#ids.sessions)}
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
            id: Number(db_session.id),
            user_id: Number(db_session.user_id),
            birth_time: db_session.birth_time,
            user_agent_seen_first: db_session.user_agent_seen_first,
            username: db_session.username,
        };
    }
}
//# sourceMappingURL=session.js.map