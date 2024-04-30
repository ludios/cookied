import { inspect } from "node:util";
import postgres from "postgres";
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
const default_connection_parameters = {
    max: 20, // Max connections
};
// Parse a database URI and return connection parameters for use with
// postgres.js: https://github.com/porsager/postgres#all-postgres-options
export function get_connection_parameters(database_uri) {
    const url = new URL(database_uri);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
        throw new Error(`protocol must be "postgresql:" or "postgres:"`);
    }
    // the directory containing the UNIX socket in e.g.
    // "postgresql:///test?host=%2Ftmp%2Fephemeralpg.Xha6ii"
    const socket_path = url.searchParams.get("host");
    if (socket_path != null) {
        let database = url.pathname;
        if (!database.startsWith("/")) {
            throw new Error(`expected pathname to start with "/", i.e. 3 slashes before ` +
                `the database name "test" in "postgresql:///test?host=%2Ftmp%2Fephemeralpg.Xha6ii"`);
        }
        database = database.replace("/", "");
        // We must pass `socket_path` as the `host` (not the `path`) because
        // it's a directory containing a socket, not the socket itself.
        //
        // We use a high max_lifetime (~24 days) to keep the ephemeralpg alive
        // (it shuts down after not being connected-to for a minute).
        return {
            ...default_connection_parameters,
            host: socket_path,
            database,
            max_lifetime: (2 ** 31 - 1) / 1000,
        };
    }
    const username = url.username;
    const password = url.password;
    const host = url.hostname;
    const port = url.port ? Number(url.port) : undefined;
    let database = url.pathname;
    if (!database.startsWith("/")) {
        throw new Error(`missing database name; should be e.g. "postgres://user:pass@host/database"`);
    }
    database = database.replace("/", "");
    return {
        ...default_connection_parameters,
        username,
        password,
        host,
        port,
        database,
    };
}
export function dbg(obj) {
    console.log(obj);
    return obj;
}
export const sql = postgres(get_connection_parameters(env("DATABASE_URI")));
//# sourceMappingURL=util.js.map