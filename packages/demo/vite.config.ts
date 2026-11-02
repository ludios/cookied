// Model-output: Claude Opus 5.5

import adapter from "@sveltejs/adapter-auto";
import { sveltekit } from "@sveltejs/kit/vite";
import type { UserConfig } from "vite";

const config: UserConfig = {
	plugins: [sveltekit({ adapter: adapter() })],
	// Vite bundles a linked workspace package into the server build by default, but cookied must
	// be loaded from its dist/, where its password checks find their worker's file
	ssr: { external: ["cookied"] },
};

export default config;
