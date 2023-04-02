import test from "ava";
import { SessionCookie } from "../src/lib/session.js";
import { AssertionError } from "ayy";

const fn = () => 'foo';

test("SessionCookie constructor", t => {
	new SessionCookie(1n, Buffer.alloc(16));
	t.throws(() => new SessionCookie(0n, Buffer.alloc(15)), {instanceOf: AssertionError}); // id < 1
	t.throws(() => new SessionCookie(2n ** 64n, Buffer.alloc(16)), {instanceOf: AssertionError}); // id > 2 ** 63 - 1
	t.throws(() => new SessionCookie(1n, Buffer.alloc(15)), {instanceOf: AssertionError}); // wrong secret length
	t.throws(() => new SessionCookie(1n, Buffer.alloc(17)), {instanceOf: AssertionError}); // wrong secret length
});
