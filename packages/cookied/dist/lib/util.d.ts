import postgres from "postgres";
export declare function env(name: string): string;
export declare function throw_if_gt1<T>(rows: ReadonlyArray<T>): ReadonlyArray<T>;
export declare function get_one_row<T>(rows: ReadonlyArray<T>): T;
export declare function get_connection_parameters(database_uri: string): {
    host: string;
    database: string;
    max_lifetime: number;
    max: number;
} | {
    username: string;
    password: string;
    host: string;
    port: number | undefined;
    database: string;
    max: number;
};
export declare function dbg<T>(obj: T): T;
export declare const sql: postgres.Sql<{}>;
