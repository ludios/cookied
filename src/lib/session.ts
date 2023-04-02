import { A } from "ayy";

export class BadSessionCookieError extends Error {
	constructor(message: string) {
		super(message);
	}
}

export class SessionCookie {
	id: bigint;
	secret: Buffer;

	constructor(id: bigint, secret: Buffer) {
		A.gte(id, 1n);
		A.lte(id, 2n ** 63n - 1n);
		A.eq(secret.length, 16);
		this.id = id;
		this.secret = secret;
	}

	// Parse a cookie value with "session_id unpadded_base64_secret"
	static parse(s_cookie: string): SessionCookie {
		const [session_id_string, unpadded_base64_secret] = s_cookie.split(" ", 2);
		// len(str(2 ** 63 - 1)) = 19
		// len("9223372036854775807") = 19
		if (!/^[1-9][0-9]{0,18}$/.test(session_id_string)) {
			throw new BadSessionCookieError("session_id was non-numeric or too long");
		}
		// >>> ("\x00" * 16).encode("base64")
		// 'AAAAAAAAAAAAAAAAAAAAAA==\n'
		// but we put base64 without the == padding in the cookie.
		if (!/^[+/A-Za-z0-9]{22}$/.test(unpadded_base64_secret)) {
			throw new BadSessionCookieError("unpadded_base64_secret had wrong length or invalid characters");
		}
		const session_id = BigInt(session_id_string);
		const secret = Buffer.from(unpadded_base64_secret, "base64");
		return new SessionCookie(session_id, secret);
	}

	toString() {
		const base64_secret = this.secret.toString("base64");
		A.eq(base64_secret.length, 24);
		A(base64_secret.endsWith("=="));
		const unpadded_base64_secret = base64_secret.replace(/==$/, "");
		return `${this.id} ${unpadded_base64_secret}`;
	}
}
