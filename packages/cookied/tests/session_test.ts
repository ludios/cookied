import test from "ava";
import { AssertionError } from "ayy";
import { BadSessionCookieError, SessionCookie } from "../lib/session.js";

test("new SessionCookie", (t) => {
	new SessionCookie(1, Buffer.alloc(16));
	t.throws(() => new SessionCookie(0, Buffer.alloc(15)), { instanceOf: AssertionError }); // id < 1
	t.throws(() => new SessionCookie(2 ** 53, Buffer.alloc(16)), { instanceOf: AssertionError }); // id > 2 ** 53 - 1
	t.throws(() => new SessionCookie(1, Buffer.alloc(15)), { instanceOf: AssertionError }); // wrong secret length
	t.throws(() => new SessionCookie(1, Buffer.alloc(17)), { instanceOf: AssertionError }); // wrong secret length
});

test("SessionCookie.parse", (t) => {
	t.deepEqual(
		SessionCookie.parse("1 AAAAAAAAAAAAAAAAAAAAAA"),
		new SessionCookie(1, Buffer.from("00000000000000000000000000000000", "hex")),
	);
	t.deepEqual(
		SessionCookie.parse("1 /+AAAAAAAAAAAAAAAAAAAA"),
		new SessionCookie(1, Buffer.from("ffe00000000000000000000000000000", "hex")),
	);
	t.deepEqual(
		SessionCookie.parse("9007199254740991 /+AAAAAAAAAAAAAAAAAAAA"),
		new SessionCookie(9007199254740991, Buffer.from("ffe00000000000000000000000000000", "hex")),
	);
	t.throws(() => SessionCookie.parse("92233720368547758070 AAAAAAAAAAAAAAAAAAAAAA"), {
		instanceOf: BadSessionCookieError,
		message: "session_id was invalid",
	});
	t.throws(() => SessionCookie.parse("9223372036854775808 AAAAAAAAAAAAAAAAAAAAAA"), {
		instanceOf: BadSessionCookieError,
		message: "session_id was invalid",
	});
	t.throws(() => SessionCookie.parse("0 AAAAAAAAAAAAAAAAAAAAAA"), {
		instanceOf: BadSessionCookieError,
		message: "session_id was invalid",
	});
	t.throws(() => SessionCookie.parse("1 AAAAAAAAAAAAAAAAAAAAAAA"), {
		instanceOf: BadSessionCookieError,
		message: "unpadded_base64_secret had wrong length or invalid characters",
	});
	t.throws(() => SessionCookie.parse("1 AAAAAAAAAAAAAAAAAAAAA"), {
		instanceOf: BadSessionCookieError,
		message: "unpadded_base64_secret had wrong length or invalid characters",
	});
	t.throws(() => SessionCookie.parse("1 AAAAAAAAAA_AAAAAAAAAAA"), {
		instanceOf: BadSessionCookieError,
		message: "unpadded_base64_secret had wrong length or invalid characters",
	});
	t.throws(() => SessionCookie.parse("1 AAAAAAAAAAAAAAAAAAAA=="), {
		instanceOf: BadSessionCookieError,
		message: "unpadded_base64_secret had wrong length or invalid characters",
	});
	t.throws(() => SessionCookie.parse("1 /+ABCDEFGHIJKLMNO12345"), {
		instanceOf: BadSessionCookieError,
		message: "non-canonical base64 representation or extraneous data",
	});
	t.throws(() => SessionCookie.parse("1 AAAAAAAAAAAAAAAAAAAAAA "), {
		instanceOf: BadSessionCookieError,
		message: "non-canonical base64 representation or extraneous data",
	});
});

test("SessionCookie.toString", (t) => {
	const valid_cookies = [
		"1 AAAAAAAAAAAAAAAAAAAAAA",
		"1 /+AAAAAAAAAAAAAAAAAAAA",
		"12341234 /+ABCDEFGHIJKLMNO1234w",
		"9007199254740991 /+AAAAAAAAAAAAAAAAAAAA",
	];
	for (const original of valid_cookies) {
		const encoded = SessionCookie.parse(original).toString();
		t.is(encoded, original);
	}
});

test("SessionCookie.hashedSecret", (t) => {
	const cookie = new SessionCookie(1, Buffer.from("00000000000000000000000000000000", "hex"));
	t.deepEqual(cookie.hashedSecret(), Buffer.from("ae40659da1193cdec8df474b5e36416a", "hex"));
});
