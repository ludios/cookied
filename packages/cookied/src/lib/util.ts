import { inspect } from "util";

export function env(name: string): string {
	if (Object.hasOwn(process.env, name)) {
		return process.env[name]!;
	}
	throw Error(`${name} must be set`);
}

export function throw_if_gt1<T>(rows: Array<T>): Array<T> {
	if (rows.length > 1) {
		throw Error(`expected 0 or 1 rows, got ${rows.length} rows: ${inspect(rows)}`);
	}
	return rows;
}

export function get_one_row<T>(rows: Array<T>): T {
	if (rows.length !== 1) {
		throw Error(`expected 1 row, got ${rows.length} rows: ${inspect(rows)}`);
	}
	return rows[0];
}
