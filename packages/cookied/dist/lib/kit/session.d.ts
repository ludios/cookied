import type { Cookies, Handle, RequestEvent } from "@sveltejs/kit";
import { type MinimizedDatabaseSession } from "../db/session.js";
import type { Config } from "../db/config.js";
export type CookieOptions = {
    name: string;
    path: string;
    secure: boolean;
};
type GotSessionCallback = ({ session, event, }: {
    session: MinimizedDatabaseSession;
    event: RequestEvent;
}) => void;
export declare class SessionKit {
    #private;
    constructor(database_config: Config, cookie_options: CookieOptions);
    make_parse_session_cookie_hook(got_session: GotSessionCallback): Handle;
    make_login_action(already_logged_in: (event: RequestEvent) => boolean): (event: RequestEvent) => Promise<{
        error: string;
        success?: undefined;
    } | {
        success: boolean;
        error?: undefined;
    }>;
    make_logout_action(): ({ cookies, locals }: {
        cookies: Cookies;
        locals: unknown;
    }) => Promise<void>;
}
export {};
