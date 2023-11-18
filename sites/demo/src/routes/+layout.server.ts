import type { LayoutServerLoad } from "./$types";

// Make the session data (created by our hook) available in `data`
//
// As per https://joyofcode.xyz/sveltekit-hooks
export const load = (async ({ locals }) => {
	console.log("locals", locals);
	return { session: locals.session };
}) satisfies LayoutServerLoad;
