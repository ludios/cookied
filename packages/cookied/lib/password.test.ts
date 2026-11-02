// Model-output: Claude Opus 5.5

import { describe, expect, it } from "vitest";
import { DECOY_HASH, hash_password, verify_password } from "./password.js";

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
