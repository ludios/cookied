// Model-output: Claude Opus 5.5

import adapter from "@sveltejs/adapter-auto";
import { sveltekit } from "@sveltejs/kit/vite";
import type { UserConfig } from "vite";

const config: UserConfig = {
	plugins: [sveltekit({ adapter: adapter() })],
};

export default config;
