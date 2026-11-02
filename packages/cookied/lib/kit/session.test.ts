// Model-output: Claude Opus 5.5

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { configure, getConsoleSink, type LogRecord, reset } from "@logtape/logtape";
import type { Cookies, RequestEvent } from "@sveltejs/kit";
import { argon2id } from "hash-wasm";
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../db/config.js";
import { type MinimizedDatabaseSession, SessionsQuery } from "../db/session.js";
import { verify_password } from "../password.js";
import { SessionCookie } from "../session.js";
import { default_sql, int8_to_number } from "../util.js";
import { SessionKit } from "./session.js";

const schema_dir = fileURLToPath(new URL("../../../../schema/", import.meta.url));
const cookie_name = "s";

/** A stand-in for SvelteKit's `Cookies`: the cookies that one client holds */
class FakeCookies {
	#jar = new Map<string, string>();

	get(name: string): string | undefined {
		return this.#jar.get(name);
	}

	getAll(): Array<{ name: string; value: string }> {
		return [...this.#jar].map(([name, value]) => ({ name, value }));
	}

	set(name: string, value: string): void {
		this.#jar.set(name, value);
	}

	delete(name: string): void {
		this.#jar.delete(name);
	}
}

/**
 * Start a pg_tmp database and apply cookied's schema to it.
 *
 * @returns the URI of the database
 */
function start_database(): string {
	const database_uri = execFileSync("pg_tmp", { encoding: "utf8" }).trim();
	execFileSync(
		"psql",
		["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database_uri, "-f", `${schema_dir}extensions.sql`, "-f", `${schema_dir}schema.sql`],
		{ stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" } },
	);
	return database_uri;
}

/**
 * @param cookies the cookies of the client that submits the form
 * @param username what the client typed as the username, or a file that it put in its place
 * @param password what the client typed as the password
 * @returns a request event with the login form that the client submits
 */
function login_event(cookies: FakeCookies, username: string | File, password: string): RequestEvent {
	const body = new FormData();
	body.set("username", username);
	body.set("password", password);
	const request = new Request("http://localhost/login", { method: "POST", body, headers: { "User-Agent": "UA/1" } });
	return { request, cookies } as unknown as RequestEvent;
}

/**
 * Run the session hook of `kit` on a request from the client that holds `cookies`.
 *
 * @returns the session that the hook found, or null if it found none
 */
async function session_from_hook(kit: SessionKit, cookies: FakeCookies): Promise<MinimizedDatabaseSession | null> {
	let found: MinimizedDatabaseSession | null = null;
	const hook = kit.make_parse_session_cookie_hook(({ session }) => {
		found = session;
	});
	await hook({ event: { cookies } as unknown as RequestEvent, resolve: () => new Response() });
	return found;
}

describe("SessionKit against PostgreSQL", () => {
	let sql: Sql;
	let config: Config;
	let kit: SessionKit;
	let user_id: number;

	beforeAll(async () => {
		vi.stubEnv("DATABASE_URI", start_database());
		sql = default_sql();
		config = {
			identifiers: {
				users:         "cookied.users",
				sessions:      "cookied.sessions",
				sessions_view: "cookied.sessions_view",
				new_session:   "cookied.new_session",
			},
			sql,
		};
		kit = new SessionKit(config, { name: cookie_name, path: "/", secure: true });
		// Cheap parameters, as this hash protects nothing
		const salt = new Uint8Array(16);
		const hashed_password = await argon2id({ password: "pw", salt, parallelism: 1, iterations: 1, memorySize: 8, hashLength: 32, outputType: "encoded" });
		const [user] = await sql`
			INSERT INTO cookied.users (username, hashed_password) VALUES ('Alice', ${hashed_password}) RETURNING id
		`;
		user_id = int8_to_number(user.id);
	}, 30_000);

	// So that no test depends on the sessions that another test left behind
	beforeEach(async () => {
		await sql`DELETE FROM cookied.sessions WHERE user_id = ${user_id}`;
	});

	afterAll(async () => {
		await sql?.end();
		vi.unstubAllEnvs();
	});

	it("logs in, finds the session by its cookie, and logs out", async () => {
		const cookies = new FakeCookies();
		const login = kit.make_login_action(() => false);
		expect(await login(login_event(cookies, "aLiCe", "pw"))).toEqual({ success: true });
		const cookie = cookies.get(cookie_name);
		expect(cookie).toBeDefined();

		const session = await session_from_hook(kit, cookies);
		expect(session).toMatchObject({ id: SessionCookie.parse(cookie!).id, user_id, username: "Alice", user_agent_seen_first: "UA/1" });
		expect(session!.birth_time).toBeInstanceOf(Date);
		const sessions = new SessionsQuery(config);
		expect(await sessions.find_minimized_by_user_id(user_id)).toMatchObject([{ id: session!.id, user_id }]);

		await kit.make_logout_action()({ cookies: cookies as unknown as Cookies, locals: { session } });
		expect(cookies.get(cookie_name)).toBeUndefined();
		expect(await sessions.find_minimized_by_user_id(user_id)).toEqual([]);

		// The cookie of the deleted session finds nothing, and the hook clears it
		cookies.set(cookie_name, cookie!);
		expect(await session_from_hook(kit, cookies)).toBeNull();
		expect(cookies.get(cookie_name)).toBeUndefined();
	});

	it("returns the ids of sessions and users as numbers", async () => {
		const sessions = new SessionsQuery(config);
		const { id } = await sessions.create(user_id, "UA/2");
		expect(id).toBeTypeOf("number");
		expect(await sessions.find_by_ids([id])).toMatchObject([{ id, user_id }]);
		expect(await sessions.find_minimized_by_user_id(user_id)).toMatchObject([{ id, user_id }]);
	});

	it("logs no secret of a session cookie, also from cookies that it rejects", async () => {
		const cookies = new FakeCookies();
		expect(await kit.make_login_action(() => false)(login_event(cookies, "alice", "pw"))).toEqual({ success: true });
		const cookie = cookies.get(cookie_name)!;
		const secret = cookie.split(" ")[1];
		const records: LogRecord[] = [];
		await configure({
			sinks:   { memory: (record) => records.push(record), console: getConsoleSink() },
			loggers: [
				{ category: ["cookied"], lowestLevel: "debug", sinks: ["memory"] },
				{ category: ["logtape", "meta"], lowestLevel: "warning", sinks: ["console"] },
			],
		});
		try {
			// A valid cookie, one that fails to parse, and one that names no session
			for (const value of [cookie, `${cookie} `, `999999 ${secret}`]) {
				cookies.set(cookie_name, value);
				await session_from_hook(kit, cookies);
			}
		} finally {
			await reset();
		}
		expect(records.length).toBeGreaterThanOrEqual(5);
		expect(JSON.stringify(records.map((r) => [r.message, r.properties]))).not.toContain(secret);
	});

	it("refuses a wrong password and an unknown user", async () => {
		const cookies = new FakeCookies();
		const login = kit.make_login_action(() => false);
		expect(await login(login_event(cookies, "alice", "wrong"))).toEqual({ error: "incorrect password" });
		expect(await login(login_event(cookies, "bob", "pw"))).toEqual({ error: "no such user" });
		expect(cookies.getAll()).toEqual([]);
	});

	it("takes a username field that holds a file as empty", async () => {
		const file = new File(["alice"], "username.txt");
		expect(await kit.make_login_action(() => false)(login_event(new FakeCookies(), file, "pw"))).toEqual({ error: "empty username" });
	});

	it("spends as long on an unknown user as on checking a password against the decoy hash", async () => {
		let start = performance.now();
		await verify_password("pw", null);
		const check_ms = performance.now() - start;

		start = performance.now();
		expect(await kit.make_login_action(() => false)(login_event(new FakeCookies(), "bob", "pw"))).toEqual({ error: "no such user" });
		// Half, to allow for noise: without the check, the answer takes about a millisecond
		expect(performance.now() - start).toBeGreaterThan(check_ms / 2);
	});

	it("finds no session for a cookie with the wrong secret, and clears the cookie", async () => {
		const cookies = new FakeCookies();
		expect(await kit.make_login_action(() => false)(login_event(cookies, "alice", "pw"))).toEqual({ success: true });
		const { id } = SessionCookie.parse(cookies.get(cookie_name)!);
		cookies.set(cookie_name, new SessionCookie(id, Buffer.alloc(16)).toString());
		expect(await session_from_hook(kit, cookies)).toBeNull();
		expect(cookies.get(cookie_name)).toBeUndefined();
	});
});
