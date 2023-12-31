import adapter from "@sveltejs/adapter-auto";
import sveltePeprocess from "svelte-preprocess";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://github.com/sveltejs/svelte-preprocess
	// for more information about preprocessors
	preprocess: [
		sveltePeprocess(),
	],
	kit: {
		adapter: adapter(),
	},
};

export default config;
