/// <reference types="node" resolution-mode="require"/>
import type { SessionCookie } from "../session.js";
import type { Config } from "./config.js";
export type MinimizedDatabaseSession = {
    id: number;
    user_id: number;
    birth_time: Date;
    user_agent_seen_first: string;
    username: string;
};
export type DatabaseSession = MinimizedDatabaseSession & {
    hashed_secret: Buffer;
};
export declare class SessionsQuery {
    #private;
    constructor(config: Config);
    find_by_ids(session_ids: [number]): Promise<ReadonlyArray<DatabaseSession>>;
    find_minimized_by_user_id(user_id: number): Promise<ReadonlyArray<MinimizedDatabaseSession>>;
    create(user_id: number, user_agent: string): Promise<{
        id: number;
        secret: Buffer;
    }>;
    delete_by_ids_and_user_id(session_ids: [number], user_id: number): Promise<void>;
    validate(session: SessionCookie): Promise<MinimizedDatabaseSession | null>;
}
