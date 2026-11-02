// Model-output: Claude Opus 5.5

// Users' passwords, for users.hashed_password. hash_password writes argon2id in PHC string
// format, with RFC 9106 §4's second recommended parameters (m = 64 MiB, t = 3, p = 4), a
// 16-byte salt, and a 32-byte tag. verify_password also checks a hash with other parameters,
// as a PHC string carries its own, but such a check takes longer or shorter than the check
// against DECOY_HASH for no user, and so tells that the user exists.
//
// verify_password checks passwords in worker threads (see PasswordChecker), started from
// password_worker.js next to this file, so an application must load this file from cookied's
// dist/ rather than bundle it.

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { getLogger } from "@logtape/logtape";
import { A } from "ayy";
import { argon2id } from "hash-wasm";
import type { CheckReply, CheckRequest } from "./password_worker.js";

const logger = getLogger(["cookied"]);

/**
 * The file that a PasswordChecker's workers run: password_worker.js in dist/, or
 * password_worker.ts when this file runs from lib/ in cookied's tests (Node strips its types)
 */
const WORKER_URL = new URL(import.meta.url.endsWith(".ts") ? "./password_worker.ts" : "./password_worker.js", import.meta.url);
// A bundler that copies this file elsewhere leaves the worker's file behind, and then every
// check would fail; better that the application fails to start
A(existsSync(WORKER_URL), () => `${WORKER_URL.href} is missing; load cookied from its dist/ rather than bundling it`);

/**
 * @param password as typed; must not be empty (hash-wasm throws on an empty password)
 * @returns the PHC string of `password`, hashed with a fresh salt, on the calling thread
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

/** A check that PasswordChecker.check was asked for, with the functions that settle its promise */
type Job = {
	request: CheckRequest;
	resolve: (matches: boolean) => void;
	reject:  (error: Error) => void;
};

/** A worker thread, and the check that it is running, or null if it is idle */
type Slot = { worker: Worker; job: Job | null };

/**
 * Checks passwords against argon2 PHC strings in worker threads, so that a check doesn't stall
 * the calling thread for its ~100 ms of synchronous WebAssembly. Each worker runs one check at a
 * time and keeps about 64 MiB once it has run one. Workers start when checks need them, and an
 * idle worker doesn't keep the process alive.
 */
export class PasswordChecker {
	readonly #max_running: number;
	readonly #max_waiting: number;
	readonly #slots   = new Set<Slot>();
	readonly #waiting: Job[] = [];
	/** The checks refused since the last check that was accepted */
	#refused = 0;

	/**
	 * @param max_running the most checks that run at once, each in its own worker thread
	 * @param max_waiting the most checks that wait for a worker; a check beyond these is refused
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
	 *          Error if `hash` is not an argon2 PHC string, or if the worker running the check
	 *          failed.
	 */
	check(password: string, hash: string): Promise<boolean> {
		return new Promise((resolve, reject) => {
			const job: Job = { request: { password, hash }, resolve, reject };
			const slot = this.#idle_slot();
			if (!slot && this.#waiting.length >= this.#max_waiting) {
				this.#refuse(job);
				return;
			}
			if (this.#refused > 0) {
				logger.info("accepting password checks again, after refusing {refused}", { refused: this.#refused });
				this.#refused = 0;
			}
			if (slot) {
				this.#start(slot, job);
			} else {
				this.#waiting.push(job);
			}
		});
	}

	/** @returns an idle worker, a new one if there is room for it, or null if every worker is busy */
	#idle_slot(): Slot | null {
		for (const slot of this.#slots) {
			if (!slot.job) {
				return slot;
			}
		}
		return this.#slots.size < this.#max_running ? this.#spawn() : null;
	}

	#spawn(): Slot {
		const slot: Slot = { worker: new Worker(WORKER_URL), job: null };
		slot.worker.on("message", (reply: CheckReply) => this.#finish(slot, reply));
		slot.worker.on("error", (error) => this.#lose(slot, error instanceof Error ? error : new Error(String(error))));
		slot.worker.on("exit", (code) => this.#lose(slot, new Error(`password worker exited with code ${code}`)));
		this.#slots.add(slot);
		return slot;
	}

	#start(slot: Slot, job: Job) {
		A.is(slot.job, null);
		slot.job = job;
		// Keep the process alive until the check answers
		slot.worker.ref();
		// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker's postMessage takes no origin
		slot.worker.postMessage(job.request);
	}

	#finish(slot: Slot, reply: CheckReply) {
		const job = slot.job;
		A(job, "a password worker answered with no check running");
		slot.job = null;
		if ("error" in reply) {
			job.reject(new Error(reply.error));
		} else {
			job.resolve(reply.matches);
		}
		const next = this.#waiting.shift();
		if (next) {
			this.#start(slot, next);
		} else {
			slot.worker.unref();
		}
	}

	/** Drops a worker that failed or exited, failing its check */
	#lose(slot: Slot, error: Error) {
		// A worker that fails emits "error" and then "exit"
		if (!this.#slots.delete(slot)) {
			return;
		}
		logger.error("a password worker failed, failing its check: {error}", { error });
		slot.job?.reject(error);
		void slot.worker.terminate();
		// Replace the worker if a check is waiting, so that checks still run `max_running` at a
		// time, and run at all if it was the only worker
		const next = this.#waiting.shift();
		if (next) {
			this.#start(this.#spawn(), next);
		}
	}

	#refuse(job: Job) {
		if (this.#refused === 0) {
			logger.warn("{running} password checks are running and {waiting} are waiting, the most allowed; refusing more until one can wait", { running: this.#slots.size, waiting: this.#waiting.length });
		}
		this.#refused += 1;
		job.reject(new TooManyPasswordChecksError(this.#slots.size, this.#waiting.length));
	}
}

/**
 * verify_password's checks: at most 2 at once, as each holds a CPU core for ~100 ms, and at
 * most 8 waiting, so that the last one waits ~0.5 s
 */
const checker = new PasswordChecker(2, 8);

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
export async function verify_password(password: string, hashed_password: string | null): Promise<boolean> {
	A.gte(password.length, 1);
	const matches = await checker.check(password, hashed_password ?? DECOY_HASH);
	return hashed_password !== null && matches;
}
