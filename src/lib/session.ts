import { A } from "ayy";
import { createHash } from "node:crypto";

export class BadSessionCookieError extends Error {
	constructor(message: string) {
		super(message);
	}
}

const MAX_SESSION_ID = 2n ** 63n - 1n;

export class SessionCookie {
	id: bigint;
	secret: Buffer;

	constructor(id: bigint, secret: Buffer) {
		A.gte(id, 1n, "id must be >= 1");
		A.lte(id, MAX_SESSION_ID, `id must be <= ${MAX_SESSION_ID}`);
		A.eq(secret.length, 16, "secret must be a 16-byte Buffer");
		this.id = id;
		this.secret = secret;
	}

	// Parse a cookie value with "session_id unpadded_base64_secret"
	static parse(s_cookie: string): SessionCookie {
		const [session_id_string, unpadded_base64_secret] = s_cookie.split(" ", 2);
		// len(str(2 ** 63 - 1)) = 19
		// len("9223372036854775807") = 19
		if (!/^[1-9][0-9]{0,18}$/.test(session_id_string)) {
			throw new BadSessionCookieError("session_id was invalid");
		}
		// >>> ("\x00" * 16).encode("base64")
		// 'AAAAAAAAAAAAAAAAAAAAAA==\n'
		// but we put base64 without the == padding in the cookie.
		if (!/^[+/A-Za-z0-9]{22}$/.test(unpadded_base64_secret)) {
			throw new BadSessionCookieError("unpadded_base64_secret had wrong length or invalid characters");
		}
		const session_id = BigInt(session_id_string);
		// Check before the constructor does, because we want BadSessionCookieError
		if (session_id > MAX_SESSION_ID) {
			throw new BadSessionCookieError("session_id was invalid");
		}
		const secret = Buffer.from(unpadded_base64_secret, "base64");
		const cookie = new SessionCookie(session_id, secret);
		if (cookie.toString() != s_cookie) {
			throw new BadSessionCookieError("non-canonical base64 representation or extraneous data");
		}
		return cookie;
	}

	toString(): string {
		const base64_secret = this.secret.toString("base64");
		A.eq(base64_secret.length, 24);
		A(base64_secret.endsWith("=="));
		const unpadded_base64_secret = base64_secret.substring(0, 22);
		return `${this.id} ${unpadded_base64_secret}`;
	}

	hashedSecret(): Buffer {
		const hash = createHash("sha384");
		hash.update(this.secret);
		const digest = hash.digest();
		// We need just 128 of the 384 bits
		const hashed_secret = digest.subarray(0, 16);
		return hashed_secret;
	}
}
