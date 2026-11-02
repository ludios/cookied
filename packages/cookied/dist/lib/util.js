// Model-output: Claude Opus 5.5
import { inspect } from "node:util";
import { A } from "ayy";
import postgres from "postgres";
import { getLogger } from "@logtape/logtape";
const logger = getLogger(["cookied"]);
export function env(name) {
    if (Object.hasOwn(process.env, name)) {
        return process.env[name];
    }
    throw Error(`${name} must be set`);
}
export function throw_if_gt1(rows) {
    if (rows.length > 1) {
        throw Error(`expected 0 or 1 rows, got ${rows.length} rows: ${inspect(rows)}`);
    }
    return rows;
}
export function get_one_row(rows) {
    if (rows.length !== 1) {
        throw Error(`expected 1 row, got ${rows.length} rows: ${inspect(rows)}`);
    }
    return rows[0];
}
/**
 * @param int8 the value of a bigint column
 * @returns the same integer as a number
 */
export function int8_to_number(int8) {
    const n = Number(int8);
    A(Number.isSafeInteger(n), () => `expected a bigint value that is a safe integer, got ${inspect(int8)}`);
    return n;
}
export function dbg(obj) {
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
export function default_sql() {
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
        max: 20,
        max_lifetime: via_socket ? null : undefined,
    });
}
//# sourceMappingURL=util.js.map