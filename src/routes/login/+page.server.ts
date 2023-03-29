import type { Actions } from './$types';

export const actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const username = formData.get("username");
		console.log(username);
	}
} satisfies Actions;
