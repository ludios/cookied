import { type Sql } from "postgres";
export declare function env(name: string): string;
export declare function throw_if_gt1<T>(rows: ReadonlyArray<T>): ReadonlyArray<T>;
export declare function get_one_row<T>(rows: ReadonlyArray<T>): T;
export declare function dbg<T>(obj: T): T;
export declare function default_sql(): Sql;
