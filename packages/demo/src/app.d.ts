// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types

// https://stackoverflow.com/questions/73738077/how-to-extend-locals-interface-in-sveltekit
declare namespace App {
	interface Locals {
		session: MinimizedDatabaseSession | null;
	}

	interface PageData {}

	interface Platform {}
}
