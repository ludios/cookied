// Model-output: Claude Opus 5.5

// Users' passwords, for users.hashed_password. hash_password writes argon2id in PHC string
// format, with RFC 9106 §4's second recommended parameters (m = 64 MiB, t = 3, p = 4), a
// 16-byte salt, and a 32-byte tag. verify_password also checks a hash with other parameters,
// as a PHC string carries its own, but such a check takes longer or shorter than the check
// against DECOY_HASH for no user, and so tells that the user exists.

import { randomBytes } from "node:crypto";
import { A } from "ayy";
import { argon2id, argon2Verify } from "hash-wasm";

/**
 * @param password as typed; must not be empty (hash-wasm throws on an empty password)
 * @returns the PHC string of `password`, hashed with a fresh salt
 */
export async function hash_password(password: string): Promise<string> {
	A.gte(password.length, 1);
	return await argon2id({
		password,
		salt:        randomBytes(16),
		parallelism: 4,
		iterations:  3,
		memorySize:  64 * 1024,
		hashLength:  32,
		outputType:  "encoded",
	});
}

/**
 * A hash with hash_password's parameters, of 32 random bytes that nobody kept: what
 * verify_password checks a password against when there is no user to check it against
 */
export const DECOY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ";

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
export async function verify_password(password: string, hashed_password: string | null): Promise<boolean> {
	A.gte(password.length, 1);
	const matches = await argon2Verify({ password, hash: hashed_password ?? DECOY_HASH });
	return hashed_password !== null && matches;
}
