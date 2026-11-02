import { type Sql } from "postgres";
export declare function env(name: string): string;
export declare function throw_if_gt1<T>(rows: ReadonlyArray<T>): ReadonlyArray<T>;
export declare function get_one_row<T>(rows: ReadonlyArray<T>): T;
export type Int8 = string | number | bigint;
/**
 * @param int8 the value of a bigint column
 * @returns the same integer as a number
 */
export declare function int8_to_number(int8: Int8): number;
export declare function dbg<T>(obj: T): T;
export declare function default_sql(): Sql;
