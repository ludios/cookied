// Model-output: Claude Opus 5.5
// Users' passwords, as users.hashed_password keeps them: argon2id in PHC string format, with
// RFC 9106 §4's second recommended parameters (m = 64 MiB, t = 3, p = 4), a 16-byte salt,
// and a 32-byte tag.
import { randomBytes } from "node:crypto";
import { A } from "ayy";
import { argon2id, argon2Verify } from "hash-wasm";
/**
 * @param password as typed; not empty, which hash-wasm refuses
 * @returns the PHC string of `password`, hashed with a fresh salt
 */
export async function hash_password(password) {
    A.gte(password.length, 1);
    return await argon2id({
        password,
        salt: randomBytes(16),
        parallelism: 4,
        iterations: 3,
        memorySize: 64 * 1024,
        hashLength: 32,
        outputType: "encoded",
    });
}
/**
 * A hash with hash_password's parameters, of 32 random bytes that nobody kept: what
 * verify_password checks a password against when there is no user to check it against
 */
export const DECOY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ";
/**
 * @param password        as typed; not empty, which hash-wasm refuses
 * @param hashed_password the user's users.hashed_password, or null if there is no such user
 * @returns whether `password` is the user's password. With no user, the answer is false,
 *          but only after `password` is checked against DECOY_HASH, so that it takes as long
 *          as it does for a user whose hash hash_password made.
 */
export async function verify_password(password, hashed_password) {
    A.gte(password.length, 1);
    const matches = await argon2Verify({ password, hash: hashed_password ?? DECOY_HASH });
    return hashed_password !== null && matches;
}
//# sourceMappingURL=password.js.map