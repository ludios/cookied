/**
 * @param password as typed; must not be empty, as verify_password refuses an empty password
 * @returns the PHC string of `password`, hashed with a fresh salt on libuv's threadpool, after
 *          the hashes that hash_password started before it
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
 * Checks passwords against argon2 PHC strings on libuv's threadpool, so that a check doesn't
 * stall the calling thread. A running check holds one of the threadpool's threads, which file
 * system calls and dns.lookup also need (libuv has 4 unless UV_THREADPOOL_SIZE says otherwise);
 * the hash's memory cost; and, when OpenSSL can start threads, a CPU core for each lane. A check
 * waits only while `max_running` checks are running, and starts in its turn as one ends.
 */
export declare class PasswordChecker {
    #private;
    /**
     * @param max_running the most checks that run at once
     * @param max_waiting the most checks that wait to run; a check beyond these is refused
     */
    constructor(max_running: number, max_waiting: number);
    /**
     * @param password as typed
     * @param hash     an argon2 PHC string
     * @returns whether `password` matches `hash`. Rejects at once with TooManyPasswordChecksError
     *          if `max_running` checks are running and `max_waiting` more are waiting; or with an
     *          Error if `hash` is not an argon2 PHC string in the form that hash_password writes,
     *          or if node:crypto refuses the parameters that `hash` holds.
     */
    check(password: string, hash: string): Promise<boolean>;
}
/**
 * @param password        as typed; must not be empty
 * @param hashed_password the user's users.hashed_password, an argon2 PHC string; or null if
 *                        there is no such user
 * @returns whether `password` is the user's password. With no user, the answer is false,
 *          but only after `password` is checked against DECOY_HASH, so that it takes as long
 *          as it does for a user whose hash hash_password made.
 * @throws AssertionError if `password` is empty; TooManyPasswordChecksError if 2 checks are
 *         running and 8 more are waiting; or an Error if `hashed_password` is not an argon2
 *         PHC string in the form that hash_password writes, or if node:crypto refuses the
 *         parameters that it holds
 */
export declare function verify_password(password: string, hashed_password: string | null): Promise<boolean>;
