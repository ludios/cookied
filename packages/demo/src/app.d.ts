import type { MinimizedDatabaseSession } from "cookied/lib/db/session";

declare global {
	namespace App {
		interface Locals {
			session: MinimizedDatabaseSession | null;
		}
	}
}

//export {};
