import { type Sql } from "postgres";
export declare function env(name: string): string;
export declare function throw_if_gt1<T>(rows: ReadonlyArray<T>): ReadonlyArray<T>;
export declare function get_one_row<T>(rows: ReadonlyArray<T>): T;
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
export declare function int8_to_number(int8: Int8): number;
export declare function dbg<T>(obj: T): T;
export declare function default_sql(): Sql;
