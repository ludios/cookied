

import { SessionsQuery, type MinimizedDatabaseSession } from "cookied/lib/db/session";
import { database_config } from "../../util";
import type { PageServerLoad } from './$types';

const sq = new SessionsQuery(database_config);

export const load: PageServerLoad = async ({ locals }) => {
	const user_id = locals.session?.user_id;
	let my_sessions: ReadonlyArray<MinimizedDatabaseSession> = [];
	if (user_id != null) {
		my_sessions = await sq.find_minimized_by_user_id(user_id);
	}
	return { my_sessions };
};
