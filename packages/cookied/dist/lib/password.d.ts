/**
 * @param password as typed; must not be empty (hash-wasm throws on an empty password)
 * @returns the PHC string of `password`, hashed with a fresh salt
 */
export declare function hash_password(password: string): Promise<string>;
/**
 * A hash with hash_password's parameters, of 32 random bytes that nobody kept: what
 * verify_password checks a password against when there is no user to check it against
 */
export declare const DECOY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ";
/**
 * @param password        as typed; must not be empty (hash-wasm throws on an empty password)
 * @param hashed_password the user's users.hashed_password, an argon2 PHC string; or null if
 *                        there is no such user
 * @returns whether `password` is the user's password. With no user, the answer is false,
 *          but only after `password` is checked against DECOY_HASH, so that it takes as long
 *          as it does for a user whose hash hash_password made.
 * @throws AssertionError if `password` is empty, or hash-wasm's Error if `hashed_password`
 *         is not an argon2 PHC string
 */
export declare function verify_password(password: string, hashed_password: string | null): Promise<boolean>;
