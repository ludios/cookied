// Model-output: Claude Opus 5.5

// Users' passwords, for users.hashed_password. hash_password writes argon2id in PHC string
// format, with RFC 9106 §4's second recommended parameters (m = 64 MiB, t = 3, p = 4), a
// 16-byte salt, and a 32-byte tag. verify_password also checks a hash with other parameters,
// as a PHC string carries its own, but such a check takes longer or shorter than the check
// against DECOY_HASH for no user, and so tells that the user exists.
//
// Both compute argon2 with node:crypto, on libuv's threadpool rather than on the calling thread.

import * as crypto from "node:crypto";
import { promisify } from "node:util";
import { getLogger } from "@logtape/logtape";
import { A } from "ayy";

const logger = getLogger(["cookied"]);

// node:crypto has argon2 from Node.js 24.7.0, and computes it only in a Node.js built with
// OpenSSL 3.2 or later. Without it, every login would fail, so better that the application fails
// to start, with this message (which is why node:crypto is imported as a namespace: a named
// import of an export that is missing fails before any code runs)
try {
	crypto.argon2Sync("argon2id", { message: "password", nonce: Buffer.alloc(8), parallelism: 1, tagLength: 4, memory: 8, passes: 1 });
} catch (e) {
	throw new Error("node:crypto could not compute argon2, which cookied needs; Node.js 24.7.0 or later can, when built with OpenSSL 3.2 or later (see the cause)", { cause: e });
}

const argon2_async = promisify(crypto.argon2);

/** What argon2 computes a tag from, besides the password and the tag's length */
type Argon2Inputs = {
	algorithm: crypto.Argon2Algorithm;
	/** The memory cost, in KiB */
	m:    number;
	/** The passes over the memory */
	t:    number;
	/** The lanes, which OpenSSL computes in threads of their own when it can start threads */
	p:    number;
	salt: Buffer;
};

/** What an argon2 PHC string holds: a tag, and what argon2 computed it from besides the password */
type Argon2Hash = Argon2Inputs & { tag: Buffer };

/**
 * @param password   as typed
 * @param inputs     what to compute the tag from, besides `password`
 * @param tag_length the tag's length in bytes
 * @returns argon2's tag, computed on libuv's threadpool
 */
async function argon2_tag(password: string, inputs: Argon2Inputs, tag_length: number): Promise<Buffer> {
	return await argon2_async(inputs.algorithm, {
		message:     password,
		nonce:       inputs.salt,
		parallelism: inputs.p,
		tagLength:   tag_length,
		memory:      inputs.m,
		passes:      inputs.t,
	});
}

/** @returns `bytes` in base64 without padding, as a PHC string holds bytes */
function unpadded_base64(bytes: Buffer): string {
	return bytes.toString("base64").replace(/=+$/, "");
}

/**
 * @returns `hash` as a PHC string, written as hash-wasm and the argon2 reference implementation
 *          write one: version 19 (0x13), the one version that node:crypto computes, and the
 *          parameters in the order m, t, p
 */
function format_phc(hash: Argon2Hash): string {
	return `$${hash.algorithm}$v=19$m=${hash.m},t=${hash.t},p=${hash.p}$${unpadded_base64(hash.salt)}$${unpadded_base64(hash.tag)}`;
}

const PHC_PATTERN = /^\$(argon2d|argon2i|argon2id)\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/**
 * @param phc a PHC string, such as a user's users.hashed_password
 * @returns the hash that `phc` holds
 * @throws Error if format_phc would not write `phc` for any hash
 */
function parse_phc(phc: string): Argon2Hash {
	const match = PHC_PATTERN.exec(phc);
	const hash = match && {
		algorithm: match[1] as crypto.Argon2Algorithm,
		m:         Number(match[2]),
		t:         Number(match[3]),
		p:         Number(match[4]),
		salt:      Buffer.from(match[5], "base64"),
		tag:       Buffer.from(match[6], "base64"),
	};
	// The hash, written back, differs from `phc` also when `phc` has a number with a leading zero
	// or one too large for a double, or base64 whose last character has bits that make no byte
	if (!hash || format_phc(hash) !== phc) {
		// Without the string itself, which shouldn't go into logs
		throw new Error("the hash is not an argon2 PHC string in the form that cookied writes: v=19, the parameters in the order m, t, p, and base64 without padding");
	}
	return hash;
}

/**
 * The parameters that hash_password hashes with. A hash or check with them takes ~30–60 ms on
 * a recent x86-64 CPU, and holds 64 MiB until it ends.
 */
const HASH_PARAMETERS = { algorithm: "argon2id", m: 64 * 1024, t: 3, p: 4 } as const;

/**
 * The hash that hash_password started last, settled or not. Each hash waits for the one before
 * it, so that hashing holds at most one threadpool thread and 64 MiB at once.
 */
let last_hash: Promise<unknown> = Promise.resolve();

/**
 * @param password as typed; must not be empty, as verify_password refuses an empty password
 * @returns the PHC string of `password`, hashed with a fresh salt on libuv's threadpool, after
 *          the hashes that hash_password started before it
 */
export async function hash_password(password: string): Promise<string> {
	A.gte(password.length, 1);
	const inputs: Argon2Inputs = { ...HASH_PARAMETERS, salt: crypto.randomBytes(16) };
	const hashing = last_hash.then(() => argon2_tag(password, inputs, 32));
	last_hash = hashing.catch(() => undefined);
	const tag = await hashing;
	return format_phc({ ...inputs, tag });
}

/**
 * A hash with hash_password's parameters, of 32 random bytes that nobody kept: what
 * verify_password checks a password against when there is no user to check it against
 */
export const DECOY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ";

/** What a PasswordChecker rejects a check with when it already has as many checks as it allows */
export class TooManyPasswordChecksError extends Error {
	/**
	 * @param running the checks that were running
	 * @param waiting the checks that were waiting to run
	 */
	constructor(running: number, waiting: number) {
		super(`${running} password checks were running and ${waiting} were waiting, the most allowed`);
		this.name = "TooManyPasswordChecksError";
	}
}

/**
 * Checks passwords against argon2 PHC strings on libuv's threadpool, so that a check doesn't
 * stall the calling thread. A running check holds one of the threadpool's threads, which file
 * system calls and dns.lookup also need (libuv has 4 unless UV_THREADPOOL_SIZE says otherwise);
 * the hash's memory cost; and, when OpenSSL can start threads, a CPU core for each lane. A check
 * waits only while `max_running` checks are running, and starts in its turn as one ends.
 */
export class PasswordChecker {
	readonly #max_running: number;
	readonly #max_waiting: number;
	/** The checks that are running */
	#running = 0;
	/** For each waiting check, in the order they came: the function that lets it run */
	readonly #waiting: Array<() => void> = [];
	/** The checks refused since the waiting checks last ran out, for the log */
	#refused = 0;

	/**
	 * @param max_running the most checks that run at once
	 * @param max_waiting the most checks that wait to run; a check beyond these is refused
	 */
	constructor(max_running: number, max_waiting: number) {
		A.gte(max_running, 1);
		A.gte(max_waiting, 0);
		this.#max_running = max_running;
		this.#max_waiting = max_waiting;
	}

	/**
	 * @param password as typed
	 * @param hash     an argon2 PHC string
	 * @returns whether `password` matches `hash`. Rejects at once with TooManyPasswordChecksError
	 *          if `max_running` checks are running and `max_waiting` more are waiting; or with an
	 *          Error if `hash` is not an argon2 PHC string in the form that hash_password writes,
	 *          or if node:crypto refuses the parameters that `hash` holds.
	 */
	async check(password: string, hash: string): Promise<boolean> {
		const parsed = parse_phc(hash);
		await this.#turn();
		try {
			const tag = await argon2_tag(password, parsed, parsed.tag.length);
			return crypto.timingSafeEqual(tag, parsed.tag);
		} finally {
			this.#end();
		}
	}

	/**
	 * @returns once the caller may run a check, which must then call #end when it ends. Rejects at
	 *          once with TooManyPasswordChecksError if there is no room to run or wait.
	 */
	#turn(): Promise<void> {
		if (this.#running < this.#max_running) {
			A.is(this.#waiting.length, 0);
			this.#running += 1;
			return Promise.resolve();
		}
		if (this.#waiting.length >= this.#max_waiting) {
			if (this.#refused === 0) {
				logger.warn("refusing password checks: {running} are running and {waiting} are waiting, the most allowed", { running: this.#running, waiting: this.#waiting.length });
			}
			this.#refused += 1;
			return Promise.reject(new TooManyPasswordChecksError(this.#running, this.#waiting.length));
		}
		return new Promise((resolve) => this.#waiting.push(resolve));
	}

	/** Gives the ending check's place to the first waiting check, if there is one */
	#end() {
		const next = this.#waiting.shift();
		if (next) {
			next();
		} else {
			this.#running -= 1;
			A.gte(this.#running, 0);
		}
		if (this.#waiting.length === 0 && this.#refused > 0) {
			logger.info("{refused} password checks were refused before the waiting checks ran out", { refused: this.#refused });
			this.#refused = 0;
		}
	}
}

/**
 * verify_password's checks: at most 2 at once, which leaves 2 of libuv's 4 threadpool threads
 * free (1 while hash_password hashes), and at most 8 waiting, so that the last one waits for 4
 * checks' time
 */
const checker = new PasswordChecker(2, 8);

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
export async function verify_password(password: string, hashed_password: string | null): Promise<boolean> {
	A.gte(password.length, 1);
	const matches = await checker.check(password, hashed_password ?? DECOY_HASH);
	return hashed_password !== null && matches;
}
