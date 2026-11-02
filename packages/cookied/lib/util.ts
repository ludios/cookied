import { inspect } from "node:util";
import { A } from "ayy";
import postgres, { type Sql } from "postgres";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["cookied"]);

export function env(name: string): string {
	if (Object.hasOwn(process.env, name)) {
		return process.env[name]!;
	}
	throw Error(`${name} must be set`);
}

export function throw_if_gt1<T>(rows: ReadonlyArray<T>): ReadonlyArray<T> {
	if (rows.length > 1) {
		throw Error(`expected 0 or 1 rows, got ${rows.length} rows: ${inspect(rows)}`);
	}
	return rows;
}

export function get_one_row<T>(rows: ReadonlyArray<T>): T {
	if (rows.length !== 1) {
		throw Error(`expected 1 row, got ${rows.length} rows: ${inspect(rows)}`);
	}
	return rows[0];
}

/**
 * The value of a PostgreSQL int8 column (also called bigint; 8 bytes, not 8 bits), as a
 * postgres.js pool returns it: decimal text by default, or a number or a JavaScript
 * BigInt if the application has configured the pool to parse int8 columns that way.
 */
export type Int8 = string | number | bigint;

/**
 * @param int8 the value of a PostgreSQL int8 column
 * @returns the same integer as a number
 * @throws AssertionError if `int8` is not an integer within ±Number.MAX_SAFE_INTEGER;
 *   a string must consist of decimal digits with an optional leading "-"
 */
export function int8_to_number(int8: Int8): number {
	// Number() alone would also accept e.g. null, "", "0x1F", "1e3" and "1.000"
	const is_int8 = typeof int8 === "string" ? /^-?[0-9]+$/.test(int8) : typeof int8 === "number" || typeof int8 === "bigint";
	const n = Number(int8);
	A(is_int8 && Number.isSafeInteger(n), () => `expected the value of a PostgreSQL int8 column within ±Number.MAX_SAFE_INTEGER, got ${inspect(int8)}`);
	return n;
}

export function dbg<T>(obj: T): T {
	logger.debug("{obj}", { obj });
	return obj;
}

// Convenience factory for applications: create a postgres.js pool on the database
// that the DATABASE_URI environment variable names. Called explicitly so that merely
// importing this module does nothing when DATABASE_URI is unset.
//
// DATABASE_URI is a "postgres:" or "postgresql:" URI, which postgres.js parses as
// libpq does. Its `host` query parameter may name the directory containing a socket,
// as in pg_tmp's "postgresql:///test?host=%2Ftmp%2Fephemeralpg.Xha6ii".
export function default_sql(): Sql {
	const database_uri = env("DATABASE_URI");
	const url = new URL(database_uri);
	if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
		throw new Error(`DATABASE_URI: protocol must be "postgresql:" or "postgres:"`);
	}
	// Without this check, postgres.js would connect to the database named after the user
	if (url.pathname.length < 2) {
		throw new Error(`DATABASE_URI: missing database name; should be e.g. "postgres://user:pass@host/database"`);
	}
	// A pg_tmp database shuts down after nothing has been connected to it for a minute.
	// Over a socket, keep each connection open instead of replacing it after
	// postgres.js's default lifetime of 30 to 60 minutes.
	const via_socket = url.searchParams.get("host")?.startsWith("/") ?? false;
	return postgres(database_uri, {
		max:          20,
		max_lifetime: via_socket ? null : undefined,
	});
}
