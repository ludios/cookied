/// <reference types="node" resolution-mode="require"/>
export declare class BadSessionCookieError extends Error {
}
export declare class SessionCookie {
    id: number;
    secret: Buffer;
    constructor(id: number, secret: Buffer);
    static parse(s_cookie: string): SessionCookie;
    toString(): string;
    hashedSecret(): Buffer;
}
