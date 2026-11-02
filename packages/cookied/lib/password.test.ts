// Model-output: Claude Opus 5.5

import { describe, expect, it } from "vitest";
import { DECOY_HASH, hash_password, PasswordChecker, TooManyPasswordChecksError, verify_password } from "./password.js";

/** @returns a PHC string's algorithm, version, and parameters, without its salt and hash */
function parameters(phc: string): string {
	return phc.split("$").slice(0, 4).join("$");
}

describe("hash_password", () => {
	it("makes a hash that verify_password accepts only the password of", async () => {
		const hash = await hash_password("correct horse");
		expect(await verify_password("correct horse", hash)).toBe(true);
		expect(await verify_password("wrong horse", hash)).toBe(false);
	});

	it("salts each hash afresh", async () => {
		expect(await hash_password("pw")).not.toBe(await hash_password("pw"));
	});
});

describe("DECOY_HASH", () => {
	it("has hash_password's parameters, so that checking a password against it takes as long", async () => {
		expect(parameters(DECOY_HASH)).toBe(parameters(await hash_password("pw")));
	});
});

describe("verify_password", () => {
	it("answers false when there is no user", async () => {
		expect(await verify_password("pw", null)).toBe(false);
	});
});

describe("PasswordChecker", () => {
	it("checks off the calling thread, whose timers keep running meanwhile", async () => {
		const checker = new PasswordChecker(1, 0);
		// The first check in a worker takes longer, as it sets up hash-wasm
		await checker.check("pw", DECOY_HASH);
		let ticks = 0;
		const timer = setInterval(() => {
			ticks += 1;
		}, 5);
		try {
			await checker.check("pw", DECOY_HASH);
		} finally {
			clearInterval(timer);
		}
		// A check takes ~100 ms, so a free thread ticks ~20 times, and a stalled one at most once
		expect(ticks).toBeGreaterThanOrEqual(5);
	});

	it("refuses a check beyond max_running and max_waiting, runs the others, and then accepts again", async () => {
		const checker = new PasswordChecker(1, 1);
		const hash = await hash_password("pw");
		const results = await Promise.allSettled([checker.check("pw", hash), checker.check("wrong", hash), checker.check("pw", hash)]);
		expect(results.slice(0, 2)).toEqual([{ status: "fulfilled", value: true }, { status: "fulfilled", value: false }]);
		expect(results[2]).toMatchObject({ status: "rejected", reason: expect.any(TooManyPasswordChecksError) });
		expect(await checker.check("pw", hash)).toBe(true);
	});

	it("rejects a hash that is not an argon2 PHC string, and goes on checking", async () => {
		const checker = new PasswordChecker(1, 0);
		await expect(checker.check("pw", "not a hash")).rejects.toThrow("Invalid hash");
		expect(await checker.check("pw", DECOY_HASH)).toBe(false);
	});
});
