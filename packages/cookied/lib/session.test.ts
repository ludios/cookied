import { describe, it, assert, expect } from "vitest";
import { AssertionError } from "ayy";
import { BadSessionCookieError, SessionCookie } from "../lib/session.js";

describe("new SessionCookie", () => {
	it("doesn't throw when given a valid ID and Buffer", () => {
		// oxlint-disable-next-line no-new
		new SessionCookie(1, Buffer.alloc(16));
		expect.assertions(0);
	});

	it("throws when given an invalid ID or Buffer", () => {
		assert.throws(() => new SessionCookie(0,       Buffer.alloc(15)), AssertionError); // id < 1
		assert.throws(() => new SessionCookie(2 ** 53, Buffer.alloc(16)), AssertionError); // id > 2 ** 53 - 1
		assert.throws(() => new SessionCookie(1,       Buffer.alloc(15)), AssertionError); // wrong secret length
		assert.throws(() => new SessionCookie(1,       Buffer.alloc(17)), AssertionError); // wrong secret length
	});
});

describe("SessionCookie.parse", () => {
	it("parses valid cookies", () => {
		assert.deepEqual(
			SessionCookie.parse("1 AAAAAAAAAAAAAAAAAAAAAA"),
			new SessionCookie(1, Buffer.from("00000000000000000000000000000000", "hex")),
		);
		assert.deepEqual(
			SessionCookie.parse("1 /+AAAAAAAAAAAAAAAAAAAA"),
			new SessionCookie(1, Buffer.from("ffe00000000000000000000000000000", "hex")),
		);
		assert.deepEqual(
			SessionCookie.parse("9007199254740991 /+AAAAAAAAAAAAAAAAAAAA"),
			new SessionCookie(9007199254740991, Buffer.from("ffe00000000000000000000000000000", "hex")),
		);
	});

	it("throws BadSessionCookieError on invalid session_id", () => {
		assert.throws(() => SessionCookie.parse("92233720368547758070 AAAAAAAAAAAAAAAAAAAAAA"), BadSessionCookieError, "session_id was invalid");
		assert.throws(() => SessionCookie.parse("9223372036854775808 AAAAAAAAAAAAAAAAAAAAAA"),  BadSessionCookieError, "session_id was invalid");
		assert.throws(() => SessionCookie.parse("0 AAAAAAAAAAAAAAAAAAAAAA"),                    BadSessionCookieError, "session_id was invalid");
	});

	it("throws BadSessionCookieError on base64 with wrong length or invalid characters", () => {
		assert.throws(() => SessionCookie.parse("1 AAAAAAAAAAAAAAAAAAAAAAA"),                   BadSessionCookieError, "unpadded_base64_secret had wrong length or invalid characters");
		assert.throws(() => SessionCookie.parse("1 AAAAAAAAAAAAAAAAAAAAA"),                     BadSessionCookieError, "unpadded_base64_secret had wrong length or invalid characters");
		assert.throws(() => SessionCookie.parse("1 AAAAAAAAAA_AAAAAAAAAAA"),                    BadSessionCookieError, "unpadded_base64_secret had wrong length or invalid characters");
		assert.throws(() => SessionCookie.parse("1 AAAAAAAAAAAAAAAAAAAA=="),                    BadSessionCookieError, "unpadded_base64_secret had wrong length or invalid characters");
	});

	it("throws BadSessionCookieError on base64 with non-canonical representation or extraneous data", () => {
		assert.throws(() => SessionCookie.parse("1 /+ABCDEFGHIJKLMNO12345"),                    BadSessionCookieError, "non-canonical base64 representation or extraneous data");
		assert.throws(() => SessionCookie.parse("1 AAAAAAAAAAAAAAAAAAAAAA "),                   BadSessionCookieError, "non-canonical base64 representation or extraneous data");
	});
});

describe("SessionCookie.toString", () => {
	it("parses valid cookies", () => {
		const valid_cookies = [
			"1 AAAAAAAAAAAAAAAAAAAAAA",
			"1 /+AAAAAAAAAAAAAAAAAAAA",
			"12341234 /+ABCDEFGHIJKLMNO1234w",
			"9007199254740991 /+AAAAAAAAAAAAAAAAAAAA",
		];
		for (const original of valid_cookies) {
			const encoded = SessionCookie.parse(original).toString();
			expect(encoded).toBe(original);
		}
		expect.assertions(valid_cookies.length);
	});
});

describe("SessionCookie.hashedSecret", () => {
	it("returns the correct hashed secret", () => {
		const cookie = new SessionCookie(1, Buffer.from("00000000000000000000000000000000", "hex"));
		expect(cookie.hashedSecret()).toEqual(Buffer.from("ae40659da1193cdec8df474b5e36416a", "hex"));
	});
});
