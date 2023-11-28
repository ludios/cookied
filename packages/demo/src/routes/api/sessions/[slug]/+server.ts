import type { RequestHandler } from './$types';
import { SessionsQuery } from 'cookied/lib/db/session';
import { json } from '@sveltejs/kit';
import { database_config } from '../../../../util';

const sq = new SessionsQuery(database_config);

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const session_id = Number(params.slug);
	if (!locals.session) {
		return json({"error": "not logged in"});
	}
	await sq.delete_by_ids_and_user_id([session_id], locals.session.user_id);
	return json({"success": true});
};
