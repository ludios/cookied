import type { Cookies, RequestEvent } from "@sveltejs/kit";
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
type Handle = (input: {
    event: RequestEvent;
    resolve: (event: RequestEvent) => Response | Promise<Response>;
}) => Promise<Response>;
/**
 * What a login action answers: that the client is now logged in, or why not. One error says
 * both that no user has the username and that the password is wrong, so that the answer
 * doesn't tell whether the user exists. "too many login attempts at once" says that the
 * password went unchecked, because too many other passwords were being checked.
 */
export type LoginResult = {
    success: true;
} | {
    error: "already logged in" | "empty username" | "empty password" | "incorrect username or password" | "too many login attempts at once";
};
export declare class SessionKit {
    #private;
    constructor(database_config: Config, cookie_options: CookieOptions);
    make_parse_session_cookie_hook(got_session: GotSessionCallback): Handle;
    make_login_action(already_logged_in: (event: RequestEvent) => boolean): (event: RequestEvent) => Promise<LoginResult>;
    make_logout_action(): ({ cookies, locals }: {
        cookies: Cookies;
        locals: unknown;
    }) => Promise<void>;
}
export {};
