// Model-output: Claude Opus 5.5

import { configure, getConsoleSink, type LogRecord, reset } from "@logtape/logtape";
import * as fc from "fast-check";
import { argon2Verify, argon2d, argon2i, argon2id } from "hash-wasm";
import { describe, expect, it } from "vitest";
import { DECOY_HASH, hash_password, PasswordChecker, TooManyPasswordChecksError, verify_password } from "./password.js";

/** @returns a PHC string's algorithm, version, and parameters, without its salt and hash */
function parameters(phc: string): string {
	return phc.split("$").slice(0, 4).join("$");
}

/** hash-wasm's hash function for each argon2 algorithm */
const HASH_WASM = { argon2d, argon2i, argon2id };

describe("hash_password", () => {
	it("makes a hash that verify_password accepts only the password of", async () => {
		const hash = await hash_password("correct horse");
		expect(await verify_password("correct horse", hash)).toBe(true);
		expect(await verify_password("wrong horse", hash)).toBe(false);
	});

	it("makes a hash that hash-wasm accepts only the password of, as cookied before 6.0.0 checked with hash-wasm", async () => {
		const hash = await hash_password("correct horse");
		expect(await argon2Verify({ password: "correct horse", hash })).toBe(true);
		expect(await argon2Verify({ password: "wrong horse", hash })).toBe(false);
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
	it("answers as hash-wasm does for a hash that hash-wasm made, which cookied before 6.0.0 wrote", async () => {
		const checker = new PasswordChecker(1, 0);
		// Code points, and surrogates without their pair, which both encode as U+FFFD in UTF-8
		const unit = fc.oneof(fc.string({ unit: "binary", minLength: 1, maxLength: 1 }), fc.integer({ min: 0xd800, max: 0xdfff }).map((c) => String.fromCharCode(c)));
		const inputs = fc.record({
			password:  fc.string({ unit, minLength: 1 }),
			other:     fc.string({ unit, minLength: 1 }),
			algorithm: fc.constantFrom("argon2d", "argon2i", "argon2id") as fc.Arbitrary<keyof typeof HASH_WASM>,
			p:         fc.integer({ min: 1, max: 4 }),
			extra_m:   fc.integer({ min: 0, max: 40 }),
			t:         fc.integer({ min: 1, max: 3 }),
			salt:      fc.uint8Array({ minLength: 8, maxLength: 32 }),
			tag_bytes: fc.integer({ min: 4, max: 64 }),
		});
		await fc.assert(fc.asyncProperty(inputs, async ({ password, other, algorithm, p, extra_m, t, salt, tag_bytes }) => {
			const hash = await HASH_WASM[algorithm]({
				password,
				salt,
				parallelism: p,
				iterations:  t,
				memorySize:  8 * p + extra_m,
				hashLength:  tag_bytes,
				outputType:  "encoded",
			});
			expect(await checker.check(password, hash)).toBe(true);
			expect(await checker.check(other, hash)).toBe(await argon2Verify({ password: other, hash }));
		}));
	});

	it("checks off the calling thread, whose timers keep running meanwhile", async () => {
		const checker = new PasswordChecker(1, 0);
		let ticks = 0;
		const timer = setInterval(() => {
			ticks += 1;
		}, 1);
		try {
			await checker.check("pw", DECOY_HASH);
		} finally {
			clearInterval(timer);
		}
		// A check on the calling thread would hold off the timer until it answered, however long
		// it took, and its answer would reach this test (in microtasks) before any timer could tick
		expect(ticks).toBeGreaterThan(0);
	});

	it("refuses a check beyond max_running and max_waiting, runs the others, and then accepts again", async () => {
		const checker = new PasswordChecker(1, 1);
		const hash = await hash_password("pw");
		const results = await Promise.allSettled([checker.check("pw", hash), checker.check("wrong", hash), checker.check("pw", hash)]);
		expect(results.slice(0, 2)).toEqual([{ status: "fulfilled", value: true }, { status: "fulfilled", value: false }]);
		expect(results[2]).toMatchObject({ status: "rejected", reason: expect.any(TooManyPasswordChecksError) });
		expect(await checker.check("pw", hash)).toBe(true);
	});

	it("logs a run of refusals once when it starts, and once when the waiting checks run out", async () => {
		const checker = new PasswordChecker(1, 0);
		const records: LogRecord[] = [];
		await configure({
			sinks:   { memory: (record) => records.push(record), console: getConsoleSink() },
			loggers: [
				{ category: ["cookied"], lowestLevel: "debug", sinks: ["memory"] },
				{ category: ["logtape", "meta"], lowestLevel: "warning", sinks: ["console"] },
			],
		});
		try {
			const results = await Promise.allSettled(Array.from({ length: 5 }, () => checker.check("pw", DECOY_HASH)));
			expect(results.filter((r) => r.status === "rejected")).toHaveLength(4);
		} finally {
			await reset();
		}
		expect(records.map((r) => [r.level, r.properties])).toEqual([
			["warning", { running: 1, waiting: 0 }],
			["info", { refused: 4 }],
		]);
	});

	it.each([
		["not a hash"],
		// Versions other than 19 (0x13), which node:crypto doesn't compute
		["$argon2id$v=16$m=65536,t=3,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ"],
		["$argon2id$m=65536,t=3,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ"],
		// Not the order m, t, p
		["$argon2id$v=19$t=3,m=65536,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ"],
		// A leading zero
		["$argon2id$v=19$m=065536,t=3,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ"],
		// Padding, and a last character with bits that make no byte
		["$argon2id$v=19$m=65536,t=3,p=4$nwxWlN36Fls//i7xooKrcw==$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ"],
		["$argon2id$v=19$m=65536,t=3,p=4$nwxWlN36Fls//i7xooKrcx$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ"],
		// A tag whose base64 has 1 more character than a multiple of 4, which makes no byte
		["$argon2id$v=19$m=65536,t=3,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQAA"],
		// A line break at the end
		["$argon2id$v=19$m=65536,t=3,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ\n"],
		["$argon2x$v=19$m=65536,t=3,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ"],
	])("rejects %j, which is not an argon2 PHC string in the form that hash_password writes, without taking a place", async (hash) => {
		const checker = new PasswordChecker(1, 0);
		const check = checker.check("pw", DECOY_HASH);
		await expect(checker.check("pw", hash)).rejects.toThrow("not an argon2 PHC string");
		expect(await check).toBe(false);
	});

	it("rejects a hash whose parameters node:crypto refuses, and goes on checking", async () => {
		const checker = new PasswordChecker(1, 0);
		// A memory cost below 8 KiB per lane
		await expect(checker.check("pw", "$argon2id$v=19$m=8,t=1,p=4$nwxWlN36Fls//i7xooKrcw$LB7uWYWc9ATnndANa5utzt/f98oukkQpnUNfJMmhJdQ")).rejects.toThrow("parameters.memory");
		expect(await checker.check("pw", DECOY_HASH)).toBe(false);
	});
});
