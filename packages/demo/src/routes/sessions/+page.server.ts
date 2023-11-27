

import { Session, type MinimizedDatabaseSession } from "cookied/lib/db/session";
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user_id = locals.session?.user_id;
	let my_sessions: ReadonlyArray<MinimizedDatabaseSession> = [];
	if (user_id != null) {
		my_sessions = await Session.find_minimized_by_user_id(user_id);
	}
	return { my_sessions };
};
