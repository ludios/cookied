/**
 * @param password as typed; must not be empty (hash-wasm throws on an empty password)
 * @returns the PHC string of `password`, hashed with a fresh salt, on the calling thread
 */
export declare function hash_password(password: string): Promise<string>;
/**
 * A hash with hash_password's parameters, of 32 random bytes that nobody kept: what
 * verify_password checks a password against when there is no user to check it against
 */
export declare const DECOY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ";
/** What a PasswordChecker rejects a check with when it already has as many checks as it allows */
export declare class TooManyPasswordChecksError extends Error {
    /**
     * @param running the checks that were running
     * @param waiting the checks that were waiting to run
     */
    constructor(running: number, waiting: number);
}
/**
 * Checks passwords against argon2 PHC strings in worker threads, so that a check doesn't stall
 * the calling thread for its ~100 ms of synchronous WebAssembly. Each worker runs one check at a
 * time and keeps about 64 MiB once it has run one. Workers start when checks need them, and an
 * idle worker doesn't keep the process alive. Between calls, a check waits only while every
 * worker is busy and there is no room for another worker.
 */
export declare class PasswordChecker {
    #private;
    /**
     * @param max_running the most checks that run at once, each in its own worker thread
     * @param max_waiting the most checks that wait for a worker; a check beyond these is refused
     */
    constructor(max_running: number, max_waiting: number);
    /**
     * @param password as typed
     * @param hash     an argon2 PHC string
     * @returns whether `password` matches `hash`. Rejects at once with TooManyPasswordChecksError
     *          if `max_running` checks are running and `max_waiting` more are waiting; or with an
     *          Error if `hash` is not an argon2 PHC string, or if the worker running the check
     *          failed.
     */
    check(password: string, hash: string): Promise<boolean>;
}
/**
 * @param password        as typed; must not be empty (hash-wasm throws on an empty password)
 * @param hashed_password the user's users.hashed_password, an argon2 PHC string; or null if
 *                        there is no such user
 * @returns whether `password` is the user's password. With no user, the answer is false,
 *          but only after `password` is checked against DECOY_HASH, so that it takes as long
 *          as it does for a user whose hash hash_password made.
 * @throws AssertionError if `password` is empty; TooManyPasswordChecksError if 2 checks are
 *         running and 8 more are waiting; or an Error if `hashed_password` is not an argon2
 *         PHC string
 */
export declare function verify_password(password: string, hashed_password: string | null): Promise<boolean>;
