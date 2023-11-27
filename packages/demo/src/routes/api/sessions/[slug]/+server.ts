import type { RequestHandler } from './$types';
import { Session } from 'cookied/lib/db/session';
import { json } from '@sveltejs/kit';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const session_id = Number(params.slug);
	if (!locals.session) {
		return json({"error": "not logged in"});
	}
	await Session.delete_by_ids_and_user_id([session_id], locals.session.user_id);
	return json({"success": true});
};
