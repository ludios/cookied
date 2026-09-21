# cookied — full-repo code review

Reviewed at commit `55ad52d` (master), 2026-08-29.
Scope: `schema/`, `packages/cookied/lib/`, `packages/demo/src/`, and the dev/tooling scripts. `packages/cookied/dist/` was skipped by request.

Produced by Claude Fable 5 (orchestration) with Claude Opus 5 subagents doing the finding and adversarial verification, finished by Claude Opus 5. Every finding below was re-checked by a second agent that tried to refute it; most were reproduced live against throwaway `pg_tmp` databases with `schema/extensions.sql` + `schema/schema.sql` applied, or against the demo's built SvelteKit server. Two candidate findings were refuted and are recorded in [What I checked that turned out fine](#what-i-checked-that-turned-out-fine) — including one where the "obvious cleanup" would have introduced a bug.

Severity is about consequence, not effort: **high** = wrong behaviour a consumer will hit with no compiler signal; **medium** = wrong behaviour on a plausible configuration or input; **low** = narrow edge or hygiene with a real failure mode; **nit** = worth a line, no consequence.

## The five that matter most

1. **[A1] `bigint` columns arrive as JavaScript strings**, so `id: number` / `user_id: number` are false at runtime on two of the three read paths. This is the root cause of several other entries and the reason `==` in the demo is load-bearing.
2. **[B1]/[B2] `new_session()` hardcodes both `cookied.sessions` and `public.gen_random_bytes`**, so a schema installed under any other name — or a Postgres where pgcrypto lives outside `public` — applies with zero errors and then fails at the first login.
3. **[C1]/[C2] Neither the login nor the logout action updates `event.locals`**, so the response each one renders contradicts what actually happened; the library gives the app no hook to fix it.
4. **[D1] `SESSION_COOKIE_SECURE=true` yields `secure: false`** — the parse fails in the insecure direction, and because `secure` is passed explicitly it *overrides* SvelteKit's safe production default.
5. **[G1] The SQL-facing surface has no automated tests at all.** `dev/test-schema` exports `DATABASE_URI` in its own process, so vitest never sees it; `SessionsQuery`, `SessionKit`, and `new_session()` are never executed by any test, and there is no CI.

---

## A. Runtime types vs. declared types

This is the category TypeScript structurally cannot help with, and it has one root cause with several downstream surfaces.

### A1. `bigint` (int8) columns come back as JS strings — `id`/`user_id: number` is wrong at runtime
**High** · [packages/cookied/lib/db/session.ts:8](packages/cookied/lib/db/session.ts#L8)

postgres.js has no default parser for OID 20. Its built-in `number` handler declares `from: [21, 23, 26, 700, 701]` (int2/int4/oid/float4/float8) and deliberately omits int8, so `bigint` columns fall through to the default string parser. The opt-in `BigInt` type exists but is never enabled — nothing in the repo passes a `types` option.

`sessions.id`, `sessions.user_id` and `users.id` are all `bigint`, so `MinimizedDatabaseSession.id`, `.user_id`, `DatabaseSession`, and `create()`'s `{ id: number }` are all false at runtime. `validate()` (lines 69–70) is the only path that repairs it with `Number(...)`; `find_minimized_by_user_id()` and `create()` return the rows verbatim.

Confirmed live: `find_by_ids` → `id: 'string'`, `user_id: 'string'`, `birth_time: Date`, `hashed_secret: Buffer`; `create()` → `id: '1'` (string). `birth_time` and `hashed_secret` really are `Date` and `Buffer` — only the int8 declarations are wrong.

**Why it matters:** these types are exported public API. A consumer writing `if (session.user_id === owner_id)` against a row from `find_minimized_by_user_id` gets `false` for the legitimate owner, with no type error anywhere. Also see A2, which is the in-repo instance.

The cheapest fix is to convert at the boundary the way `validate()` already does; the more thorough one is to decide whether these should be `string` (honest about int8) or enable postgres.js's BigInt parsing, and then say so in the type.

### A2. The demo's `==` is load-bearing; changing it to `===` lets users delete their own live session
**Medium** · [packages/demo/src/routes/sessions/+page.svelte:46](packages/demo/src/routes/sessions/+page.svelte#L46)

`{#if id == data.session.id}` compares `id` from `data.my_sessions` (a **string**, from `find_minimized_by_user_id`, unconverted) against `data.session.id` (a real **number**, because it came through `validate()`). Confirmed that SvelteKit's devalue serialization preserves the mismatch across the load boundary — the client sees a string too.

Both are declared `number`, so TypeScript and `svelte-check` (0 errors) endorse tightening this to `===`, which an `eqeqeq` lint rule would also demand. Doing so makes the comparison false for every row: the user's current session gets a "Remove" button. Verified end-to-end that clicking it succeeds — the API has no self-deletion guard, the response still refreshes the cookie, and the *next* request finds the session gone, clears the cookie, and logs the user out with no explanation.

A comment on that line would help, but fixing A1 is the real answer.

### A3. `create()` returns a string id, so a freshly-minted `SessionCookie` has `id: string`
**Low** · [packages/cookied/lib/kit/session.ts:159](packages/cookied/lib/kit/session.ts#L159)

`create()` feeds its string `id` straight into `new SessionCookie(id, secret)`. The constructor's guards `A.gte(id, 1)` and `A.lte(id, MAX_SESSION_ID)` pass by numeric coercion — ayy's `gte<T>(a: T, b: T)` signature exists precisely to block mixed-type comparison, but TypeScript believes both sides are `number`, so it can't. The same class therefore has two runtime shapes: `id` is a string when built by login, a number when built by `parse()`. Verified: `cookie.id === validated.id` is `false`, `cookie.id + 1` is `'11'`.

Latent today because the only consumer is the template literal in `toString()`. It breaks on the first `A.eq`, `Map<number, …>`, or arithmetic anyone adds.

### A4. The `satisfies` clauses on postgres.js results check nothing
**Low** · [packages/cookied/lib/db/session.ts:48](packages/cookied/lib/db/session.ts#L48), [packages/cookied/lib/kit/session.ts:135](packages/cookied/lib/kit/session.ts#L135)

postgres.js types its default result as `RowList<Row[]>` where `interface Row { [column: string]: any }`, so every candidate shape is trivially satisfied. Compiled with the repo's own tsc under `--strict`: `satisfies Array<{ id: Date; secret: RegExp; nope: symbol }>` passes with exit 0, asserting a property that doesn't exist.

This is precisely why the wrong `id: number` declarations in A1 went unchallenged — the clause reads like verification and is worth nothing. Passing the row type as the generic argument (`sql<{ id: string; … }[]>`) gives the compiler something real to check.

### A5. `Locals.session` is declared as a required `| null` but is `undefined` when logged out
**Low** · [packages/demo/src/app.d.ts:6](packages/demo/src/app.d.ts#L6)

`hooks.server.ts` assigns `event.locals.session` only inside the `got_session` callback; every logged-out path in the hook returns `resolve(event)` without touching `locals`, so the property is never created. The built server's SSR payload confirms `{session: void 0}` — absent and `undefined`, not `null`.

Current consumers all use truthiness or `?.`, so nothing breaks. But the declared type makes `if (locals.session === null) return unauthorized();` typecheck while never firing. `session?: MinimizedDatabaseSession` would reject both wrong patterns.

### A6. `session_ids` is typed as a one-element tuple
**Nit** · [packages/cookied/lib/db/session.ts:28](packages/cookied/lib/db/session.ts#L28), [:52](packages/cookied/lib/db/session.ts#L52)

`find_by_ids(session_ids: [number])` and `delete_by_ids_and_user_id(session_ids: [number], …)` declare exactly-one-element tuples while the SQL is `id = ANY(…)`, which handles any length. Verified: `sq.find_by_ids([1, 2])` fails with `TS2345: Source has 2 element(s) but target allows only 1`. The plural name advertises a capability the signature forbids.

---

## B. SQL and schema

### B1. `new_session()` hardcodes the `cookied` schema, defeating the configurable schema name
**Medium** · [schema/sessions.sql:43](schema/sessions.sql#L43)

The function body does `INSERT INTO cookied.sessions (…)` with the schema name baked in, while every other layer treats it as configurable: `Identifiers` is a set of free-form strings, and [packages/demo/dev/serve:23](packages/demo/dev/serve#L23) goes out of its way to `grep` the schema name out of `schema.sql` rather than hardcode it.

Reproduced: `sed` the schema to `CREATE SCHEMA auth` / `SET search_path TO auth`, apply — **zero errors**, because plpgsql doesn't resolve table references at `CREATE FUNCTION` time. Insert a user, call `auth.new_session(1,'UA')` → `ERROR: relation "cookied.sessions" does not exist`. Silent at install time, fails only on the login path.

The qualification itself is necessary and the comment at lines 40–41 explains why; the problem is that it isn't parameterized. `format('INSERT INTO %I.sessions …', TG_…)`, or generating the schema name at install time, or simply documenting that the schema name is fixed, would all close it.

### B2. `new_session()` hardcodes `public.gen_random_bytes`, but `extensions.sql` doesn't pin pgcrypto's schema
**Medium** · [schema/sessions.sql:35](schema/sessions.sql#L35)

`secret_ bytea := public.gen_random_bytes(16);` assumes pgcrypto lands in `public`, while `extensions.sql` installs it with a bare `CREATE EXTENSION IF NOT EXISTS pgcrypto;` that follows the applying session's `search_path`. Putting extensions in a dedicated schema is standard on managed Postgres (Supabase ships an `extensions` schema for exactly this) and on any install that keeps `public` clean.

Reproduced: `CREATE SCHEMA ext; CREATE EXTENSION pgcrypto SCHEMA ext;` then apply `schema.sql` → no errors at all; first `new_session()` call → `ERROR: function public.gen_random_bytes(integer) does not exist`. Out-of-the-box deploys work, so this hides until someone deploys somewhere opinionated.

Note the asymmetry: `sha384` on the next line is correctly left unqualified (it's a `pg_catalog` builtin — verified visible). The fix is to make `extensions.sql` pin the schema it installs into, so the hardcoded `public.` is actually guaranteed.

### B3. No index on `sessions.user_id`
**Medium** · [schema/sessions.sql:5](schema/sessions.sql#L5)

`sessions` has exactly one index, `sessions_pkey`. `find_minimized_by_user_id` — the query behind the demo's `/sessions` page, run on every view and again after every Remove — filters on `user_id`. Verified plan: `Seq Scan on sessions / Filter: (user_id = '1'::bigint)`. The same gap makes the `sessions_user_id_fkey` referential check scan all of `sessions` on every user `DELETE` or key `UPDATE`.

`sessions` is the table that grows without bound (a row per login, removed only by explicit logout), so this is the one query guaranteed to degrade. `find_by_ids` and `delete_by_ids_and_user_id` correctly drive off the primary key.

### B4. No server-side session expiry, and no way to revoke everything
**Medium** · [schema/sessions.sql:7](schema/sessions.sql#L7), [packages/cookied/lib/db/session.ts:60](packages/cookied/lib/db/session.ts#L60)

`validate()` checks only that the row exists and the secret hash matches. `birth_time` is selected and copied into the result but never compared to anything, and there's no last-seen column, so there is no absolute lifetime and no idle timeout. Verified: a session row backdated three years authenticates fine. Meanwhile the hook re-issues a 400-day `Expires`/`Max-Age` on every request — a client-enforced hint, not a server-side bound.

There's also no "sessions valid after" column on `users`, so a password change (when you add one) won't invalidate live sessions. A consumer *can* revoke everything today by combining `find_minimized_by_user_id` with `delete_by_ids_and_user_id`, so this is a design gap rather than a missing capability — but a stolen cookie is otherwise good forever.

### B5. `find_minimized_by_user_id` has no `ORDER BY`
**Low** · [packages/cookied/lib/db/session.ts:37](packages/cookied/lib/db/session.ts#L37)

The `/sessions` table renders `data.my_sessions` in returned order and shows "ID" and "Creation time" columns that a user will read as sorted. They aren't: deleted tuple slots get reused, so new sessions interleave into the middle. Reproduced with the library's own create/delete/find: initial order `6,7,8,9,10`; after deleting two, `VACUUM`, and creating two more → `11,12,6,9,10`.

The keyed `{#each}` binds each button to its own row's id, so a reorder can't misdirect a delete — the harm is a jumpy list and a misclick hazard. `ORDER BY id` (or `birth_time DESC`) fixes it.

### B6. `extensions.sql` runs without `ON_ERROR_STOP`
**Low** · [schema/extensions.sql:1](schema/extensions.sql#L1)

`\set ON_ERROR_STOP on` lives at `schema.sql:1`, but both callers pass `extensions.sql` as an *earlier* `-f` in the same psql session, so it runs with the default "print and continue" behaviour and psql still exits 0 — which `set -eu -o pipefail` cannot catch.

Reproduced both halves: a failing `CREATE EXTENSION` prints an ERROR, continues into `schema.sql`, and exits 0; and with pgcrypto never installed, `schema.sql` applies with zero errors (plpgsql doesn't resolve the function body) while the first `new_session()` fails. `-v ON_ERROR_STOP=1` on the psql invocation, or `\set ON_ERROR_STOP on` at the top of `extensions.sql`, closes it. See also G2 — this is what makes `dev/test-schema` green-light a broken database.

### B7. Schema application isn't atomic
**Low** · [schema/schema.sql:3](schema/schema.sql#L3)

No `--single-transaction` and no `BEGIN`/`COMMIT`, even though all this DDL is transactional in Postgres. Reproduced: applying to a database without the `periods` extension dies at `users.sql:41` but leaves the schema, both domains, and the `users` table committed; the retry then fails instantly with `ERROR: schema "cookied" already exists`, requiring a manual `DROP SCHEMA cookied CASCADE` plus dropping the domains.

### B8. System versioning retains secrets forever, and users can't be erased
**Low** · [schema/sessions.sql:15](schema/sessions.sql#L15)

`periods.add_system_versioning` copies superseded rows into `*_history` (the extension itself emits `NOTICE: … be sure to index it properly`), and nothing indexes or prunes them. Verified: after `DELETE FROM cookied.sessions`, the row is still in `sessions_history` with its original `hashed_secret`; every `hashed_password` update leaves the prior argon2 hash in `users_history` permanently, so a database read yields every historical hash to crack, not just current ones. Both history tables have `relacl = {at=r/at}` — read-only even to the owner, so a non-superuser deployment must re-grant before pruning.

Combined with the FK being `NO ACTION`, "delete this user" is a two-step that erases nothing: `DELETE FROM users` fails until their sessions go, and both deletions merely move the rows to history. Worth deciding deliberately if you ever need account deletion.

### B9. `get_visual_username` is collation-dependent despite being `IMMUTABLE`
**Low** · [schema/users.sql:27](schema/users.sql#L27)

It calls `LOWER()`, which is collation-sensitive, and its result is constrained by an ASCII-only domain. Reproduced on a database created with `ICU_LOCALE 'tr-TR'`: the schema applies cleanly, then `INSERT … VALUES ('Ivan', …)` — a username the `username` domain accepts — fails with `ERROR: value for domain cookied.visual_username violates check constraint`, naming neither the column nor the real cause (`lower('I')` is `ı` under Turkish rules).

Separately, both unique indexes are expression indexes over a collation-sensitive function, so a glibc/ICU upgrade silently invalidates them until `REINDEX`. Adding `COLLATE "C"` inside the function would pin it.

### B10. `visual_username`'s character class is looser than the function's actual range
**Nit** · [schema/users.sql:18](schema/users.sql#L18)

The domain is `[-a-hj-z1-9]`: it excludes `i` and `0` but admits `1`, even though the REPLACE chain maps `1 → l` and can never emit a `1`. So the domain would catch a future edit dropping the `'0' → 'o'` step but not one dropping `'1' → 'l'` — at which point `1van` and `lvan` stop colliding and both become registrable, with no error anywhere. `[-a-hj-z2-9]` pins the range exactly.

(Verified the protection currently works: inserting `Ivan` then `1van` gives `duplicate key value violates unique constraint "users_visual_username_index"`.)

---

## C. Session lifecycle logic in `SessionKit`

### C1. The login action never publishes the new session, so its own response renders logged-out
**Medium** · [packages/cookied/lib/kit/session.ts:161](packages/cookied/lib/kit/session.ts#L161)

`make_login_action` sets the cookie and returns `{success: true}`, but never touches `event.locals` — and unlike `make_parse_session_cookie_hook(got_session)` and `make_login_action(already_logged_in)`, it offers the application no callback to do so. SvelteKit re-runs the load functions for the same `RequestEvent` after an action without re-entering `handle`, so `locals.session` is still unset when `+layout.server.ts` reads it.

Verified against the built server with a plain browser form POST: HTTP 200 whose `<main>` reads `Logged in as` (blank username) and whose `<header>` offers "Log in" — while that very response carries a valid `Set-Cookie`. The `onMount(() => invalidateAll())` in `login/+page.svelte`, commented "Prevent Header from showing stale session data", is the workaround for exactly this, and it needs JS plus a second round trip.

This is a library-level gap: a consumer cannot fix it from the app side.

### C2. The logout action never clears `locals.session`, so its response renders still-logged-in
**Medium** · [packages/cookied/lib/kit/session.ts:165](packages/cookied/lib/kit/session.ts#L165)

The exact mirror of C1, and found only by the completeness pass. `make_logout_action` deletes the row and clears the cookie but never un-publishes `locals.session`; it takes no callback, and its `locals` parameter is typed `unknown` and only read.

Reproduced against a running demo: the single logout POST response is HTTP 200 with `set-cookie: s=; Max-Age=0` **and** a body containing both `Logged in as bob (session id: 1)` with a live "Log out" button and `Logged out` — while `psql` confirms the row is already gone. So the header advertises a session that no longer exists. Without JS the contradiction persists for the life of that page, which is a poor property for a logout screen on a shared machine.

Giving both actions a `got_session`-style callback (or having them write `locals` directly) fixes C1 and C2 together.

### C3. `argon2Verify` throws rather than returning `false` on a malformed stored hash
**Medium** · [packages/cookied/lib/kit/session.ts:144](packages/cookied/lib/kit/session.ts#L144)

hash-wasm throws `Error: Invalid hash` for anything it can't parse. Verified against the installed 4.12.0: a valid hash with one trailing `\n`, one leading or trailing space, a bcrypt string, `''`, and `'xyz'` all **throw**; `null`/`undefined` throw `Hash should be specified`. There's no try/catch in `make_login_action`, so instead of `{error: "incorrect password"}` the request becomes a 500.

`schema/users.sql` puts no CHECK on `hashed_password`, so one bad row is enough — and the breakage is per-user, which makes it easy to ship and hard to notice. A migrated legacy row or a copy-paste with a trailing newline is all it takes. (It's also a user-enumeration signal for that account: 500 vs. the normal error page.)

### C4. `form_data.get(…) as string` crashes the login action on a multipart File part
**Medium** · [packages/cookied/lib/kit/session.ts:115](packages/cookied/lib/kit/session.ts#L115)

`FormData.get` returns `string | File | null`; the cast is erased. A `File` is truthy — including a zero-byte one — so both the empty-username and empty-password guards pass it through. Verified with real `Request`/`FormData`: `form_username.toLowerCase()` throws `TypeError: … is not a function`, and a File password reaches `argon2Verify`, which throws `Invalid data type!`. Neither is caught, so malformed input becomes an uncaught 500 with a stack trace.

One correction worth knowing: SvelteKit's CSRF check does reject a bare `curl -F` in production (a missing `Origin` header is forbidden too), so this isn't anonymously reachable quite that easily — but `-H 'Origin: https://site'` reaches it, the check is off in `vite dev`, and a same-origin form with `enctype="multipart/form-data"` and a file input named `username` does it from a browser. `typeof x !== "string"` guards are the fix.

---

## D. Security

### D1. `SESSION_COOKIE_SECURE` parsing fails open
**Medium** · [packages/demo/src/util.ts:9](packages/demo/src/util.ts#L9)

`Boolean(Number(env("SESSION_COOKIE_SECURE")))` is `true` only for a non-zero *numeric* string. Verified: `"true"`, `"TRUE"`, `"yes"`, `"on"`, `""` all → `false`. No error, no warning, and it fails in the insecure direction — the spelling almost everyone reaches for is the one that silently disables `Secure`.

This is worse than a normal config typo because `CookieOptions.secure` is passed *explicitly* to `cookies.set`/`cookies.delete`, overriding SvelteKit's own default (`secure: url.hostname === 'localhost' && url.protocol === 'http:' ? false : true`). Without the explicit option the framework would have set `Secure` automatically in production; with it, the app opts out. And `util.ts` is the file consumers copy.

Parsing that accepts the usual spellings and *throws* on anything unrecognized would be strictly better than a silent `false`.

### D2. Live session credentials are written to logs
**Medium** · [packages/cookied/lib/kit/session.ts:75](packages/cookied/lib/kit/session.ts#L75), [:85](packages/cookied/lib/kit/session.ts#L85)

Session secrets are the whole authenticator — `validate()` does nothing but look up the id and compare the hash, so `id + secret` from a log line is a complete login. Verified by running logtape with a console sink against the built library, and separately that a parsed cookie authenticates with no other input.

- **Line 75** dumps the entire cookie jar of every request at debug level, including the live `s` bearer token. The lazy callback means it costs nothing until someone raises the level to debug to diagnose a login problem — a routine step — at which point every request leaks a working credential.
- **Line 85** logs the raw cookie string on parse failure. A live cookie with extraneous trailing data contains a *complete valid secret*: `parse()` rejects it at the canonicalization check on line 41, after the secret regex has already passed.

Line 96 is less bad than it looks — `validate()` returned null there, so that cookie is by construction not usable for that id. Redacting the secret (log the id only) would keep all the diagnostic value.

### D3. Unauthenticated login DoS: argon2 blocks the event loop, with no rate limiting
**Medium** · [packages/cookied/lib/kit/session.ts:144](packages/cookied/lib/kit/session.ts#L144)

hash-wasm's argon2 is a **synchronous** WASM call, and `argon2Internal` instantiates its own module per call rather than going through the shared locked path. Measured with the installed 4.12.0 at the parameters `hash-password.mjs` mints (m=64MiB, t=3, p=4): a single verify blocked the event loop for the entire 316 ms with a 5 ms `setInterval` running — **zero** timers fired. Eight concurrent verifies: 2.56 s wall (fully serialized), RSS 278 → 817 MB (~67 MB each).

Nothing anywhere rate-limits, throttles, delays, or locks out login attempts. So one unauthenticated POST costs ~300 ms of *total server unavailability* plus 64 MiB, and the attacker's cost is one HTTP request. The same absence makes online password guessing unbounded.

Argon2-on-the-request-thread is a common tradeoff and the attacker must first know a valid username (see D4) — but a worker thread and some rate limiting are the standard answers, and neither exists.

### D4. Login discloses whether a username exists
**Low** · [packages/cookied/lib/kit/session.ts:140](packages/cookied/lib/kit/session.ts#L140)

Two independent oracles: distinct messages (`no such user` vs `incorrect password`, rendered verbatim by the demo), and the control flow itself — the not-found branch returns after one indexed lookup while a found user always pays a full argon2 verification. Measured on this machine: sub-millisecond vs. 316 ms.

Because both the strings and the control flow live in the library, a consumer can't fully fix the timing half. A single generic error plus a dummy verify against a fixed hash for missing users is the usual remedy.

### D5. `hash-password.mjs` hashes the trailing newline
**Low** · [packages/cookied/dev/hash-password.mjs:10](packages/cookied/dev/hash-password.mjs#L10)

`stdin_buffer.toString()` with no trim. Verified: `echo 'hunter2' | dev/hash-password.mjs` mints a hash where `argon2Verify({password: "hunter2"})` is `false` and `"hunter2\n"` is `true`. The one in-repo caller compensates externally with `echo -n`, but the natural manual invocation doesn't, and the failure surfaces much later as an unexplained "incorrect password" with nothing pointing at the stored hash.

The argon2id parameters themselves are correct — exactly RFC 9106 §4's second recommended configuration.

### D6. `dev/serve` publishes a trivially-loginable app to the whole LAN
**Low** · [packages/demo/dev/serve:43](packages/demo/dev/serve#L43)

Three reasonable dev choices that compose badly: users `one`/`1` and `two`/`2`, `SESSION_COOKIE_SECURE=0`, and `vite dev --host` — which (confirmed in the installed vite 8.1.3) binds all interfaces, not localhost. On any shared Wi-Fi, anyone can reach the demo, log in, and watch the session cookie go by in cleartext. Dropping `--host` or gating it behind a flag removes the exposure.

---

## E. Connection-string parsing (`lib/util.ts`)

`get_connection_parameters` deliberately deviates from postgres.js's own URI handling (socket path, pool size), which is fine — but it also diverges in ways that look unintentional. All six were reproduced.

### E1. Username and password are never percent-decoded
**Medium** · [packages/cookied/lib/util.ts:63](packages/cookied/lib/util.ts#L63)

WHATWG `URL` leaves `username`/`password` percent-encoded; this function passes them through verbatim, while postgres.js's own parser does `decodeURIComponent` on both. So a URI that authenticates when handed to `postgres(uri)` directly fails through `default_sql()`.

Verified: `postgres("postgres://alice:p%40ss%2Fw%25rd@…").options.pass === "p@ss/w%rd"` but via this helper it's the literal `"p%40ss%2Fw%25rd"`. Also confirmed libpq decodes userinfo (created a role named `a b` and connected as it via `a%20b`). Any password containing `@ : / ? # % [ ]` or non-ASCII — i.e. most generated passwords — fails at startup with a misleading `password authentication failed` against a URI that looks correct.

(The database-name half is *not* a divergence: postgres.js uses the raw pathname too. Only user/password are a regression.)

### E2. The socket branch discards username, password, and port
**Medium** · [packages/cookied/lib/util.ts:56](packages/cookied/lib/util.ts#L56)

That branch returns only `{host, database, max_lifetime}`. postgres.js then falls back to `env.PGUSERNAME || env.PGUSER || osUsername()` and `env.PGPASSWORD || ''`. Verified against a fresh cluster with a real `appuser` role: psql with the URI reports `current_user = appuser`, while the pool built from this function reports `current_user = at` (the OS user). Under `peer`/`trust` auth on a local socket that's typically the cluster owner — so a URI asking for a least-privilege role silently connects as a more privileged one, with everything appearing to work.

Invisible in dev, because pg_tmp uses peer auth as the OS user — the only configuration the dev scripts exercise. The dropped `port` is a separate loud failure: `ENOENT … /.s.PGSQL.5432` for any cluster not on 5432.

### E3. `sslmode` is silently discarded
**Medium** · [packages/cookied/lib/util.ts:72](packages/cookied/lib/util.ts#L72)

Only the `host` query parameter survives; every other one is dropped. postgres.js honours `sslmode` only when it parses the URL string itself, and its default is `ssl: false`; its env fallback is `PGSSL`, not the libpq-standard `PGSSLMODE`, so there's no accidental rescue. Verified: `?sslmode=require` produces an options object with no `ssl` key and no warning.

Against a server that also accepts non-SSL, an operator who wrote `sslmode=require` gets a cleartext connection carrying the password, the argon2 hashes read by the login query, and every freshly-minted session secret. (Against a TLS-requiring server it fails loudly instead, which is the more common outcome — hence medium rather than high.)

### E4. An empty database name passes the "missing database name" check
**Low** · [packages/cookied/lib/util.ts:68](packages/cookied/lib/util.ts#L68)

The guard only tests `startsWith("/")`. A URI ending in a bare slash has pathname exactly `"/"`, which passes, and the replace yields `""` — falsy, so postgres.js falls through to `… || env.PGDATABASE || user` and uses the **connection username** as the database name. Verified: `postgres(get_connection_parameters("postgres://alice:pw@db.example.com/")).options.database === "alice"`. The socket branch has the identical hole.

The defect isn't a divergence from postgres.js (it behaves the same) — it's that the explicit guard whose message is "missing database name" fails to catch the most common way to actually omit it.

### E5. `env()` treats an empty-string variable as set
**Low** · [packages/cookied/lib/util.ts:8](packages/cookied/lib/util.ts#L8)

`Object.hasOwn` is true for `FOO=`, and since `export FOO=$(cmd)` produces exactly that whenever `cmd` outputs nothing, an empty variable is the *normal* shape of a misconfiguration — so the guard is bypassed exactly when it's most needed. Verified consequences: `SESSION_COOKIE_SECURE=` silently drops `Secure`; `DATABASE_URI=` dies with `TypeError: Invalid URL` instead of `DATABASE_URI must be set`; `SESSION_COOKIE_NAME=` makes `cookie`'s serializer throw whenever the cookie is *set*, turning a successful login into a 500.

### E6. An IPv6 `DATABASE_URI` connects to the host `[`
**Low** · [packages/cookied/lib/util.ts:65](packages/cookied/lib/util.ts#L65)

`url.hostname` keeps the brackets for an IPv6 authority (`"[::1]"`), and postgres.js's multihost support then does `host.split(',').map(x => x.split(':')[0])`, reducing it to `"["`. Verified: `getaddrinfo ENOTFOUND [` — an error naming a hostname the operator never wrote. Control experiment confirms stripping the brackets here is sufficient (`host: '::1'` resolves fine). postgres.js's own string parser has the same bug, so passing the raw URI isn't a workaround; this function is the natural place to fix it.

---

## F. Demo application

### F1. `DELETE /api/sessions/<non-integer>` returns a 500
**Medium** · [packages/demo/src/routes/api/sessions/[slug]/+server.ts:9](packages/demo/src/routes/api/sessions/[slug]/+server.ts#L9)

`Number(params.slug)` is never validated, and postgres.js sends numbers as unspecified-type text, so Postgres does the cast. Verified end-to-end against the built server: `DELETE /api/sessions/abc` → HTTP 500 `{"message":"Internal Error"}` with `PostgresError: invalid input syntax for type bigint: "NaN"` and a full stack in the log. Same for `/1.5`, `/1e30`, `/Infinity`. There's no `+error.svelte`, so browsers get the default error page.

The coercion is loose in the other direction too: `0x10` → 16, `%203%20` → 3, `-1`, and `9007199254740993` → `…992` are all silently accepted. During verification, `DELETE /api/sessions/%203%20` deleted the caller's own current session. Only reachable while logged in (the `!locals.session` branch returns first), and a `Number.isSafeInteger` guard returning 400 fixes it.

### F2. `GET /logout` says "Logged out" while you're still logged in
**Medium** · [packages/demo/src/routes/logout/+page.svelte:11](packages/demo/src/routes/logout/+page.svelte#L11)

`logout/+page.server.ts` exports only `actions` — no `load`, no guard — so `/logout` is reachable by an ordinary GET from the URL bar, a bookmark, history, or `data-sveltekit-preload-data="hover"` if a link is ever added. The page body unconditionally renders "Logged out".

Verified: HTTP 200 whose `<main>` says `Logged out` while the `<header>` above it says `Logged in as one (session id: 1)` with a live Log out button and the full session JSON — and the response carries a *freshly refreshed* 400-day session cookie from the hook. The row is untouched. `invalidateAll()` can't help; the server state genuinely still says logged in. (The POST path is correct: `s=; Max-Age=0` and the row deleted.)

### F3. The DELETE endpoint's response semantics carry no information
**Low** · [packages/demo/src/routes/api/sessions/[slug]/+server.ts:11](packages/demo/src/routes/api/sessions/[slug]/+server.ts#L11), [packages/cookied/lib/db/session.ts:52](packages/cookied/lib/db/session.ts#L52)

Verified against the built server: not-logged-in returns **HTTP 200** with `{"error": "not logged in"}` — a status code that says the delete worked — and deleting a nonexistent or another user's id returns **200 `{"success":true}`**. The cause is in the library: `delete_by_ids_and_user_id` is `Promise<void>` and discards the postgres.js result, whose `count` is right there (verified `count: 0` for a no-op DELETE). So `remove_session`'s `logger.warn` branch is unreachable and a no-op re-renders as success.

No security consequence — the `AND user_id = …` scoping is correct — but returning the count and a 401 would make the API mean something.

### F4. Failed login lands on a dead-end page with no form
**Low** · [packages/demo/src/routes/login/+page.svelte:17](packages/demo/src/routes/login/+page.svelte#L17)

`make_login_action` returns plain `{error}` objects rather than `fail(400, …)`, and `LoginForm` has no `use:enhance`, so a wrong password produces a full-page navigation to `/login` with **HTTP 200**. Verified: the page shows "Login error: incorrect password" and contains no `name="password"` field anywhere — `LoginForm` lives on `/`. The only escape is the header's "Log in" link. A bare `GET /login` renders "Login error: no form data" to a user who has done nothing wrong.

### F5. LogTape is never configured, so every diagnostic is discarded
**Low** · [packages/demo/src/routes/sessions/+page.svelte:13](packages/demo/src/routes/sessions/+page.svelte#L13)

Verified by running the demo's own logtape 2.2.3: an unconfigured logger is a silent no-op that doesn't even warn. No module in the repo calls `configure()`. So the Remove button's only failure path emits nothing, and cookied's own security-relevant lines ("failed to parse, clearing it", "no such user", "incorrect password provided by") are all discarded too. One `configure()` call in the demo would make the rest of this review's logging findings observable.

### F6. `vite build` crashes without `DATABASE_URI`
**Low** · [packages/demo/src/util.ts:21](packages/demo/src/util.ts#L21)

`database_config` calls `default_sql()` in a module-level initializer, and SvelteKit's build *imports* every server node during its analyse pass. Reproduced in a scratch copy: the build dies after "rendering chunks…" with a bare uncaught `Error: DATABASE_URI must be set` surfaced through `process.nextTick` — not a SvelteKit build error. Setting any throwaway URI makes the identical build succeed, proving the pool is only needed at import time. So the demo can't be built in CI or a container image without a live database URI.

### F7. `dev/serve` falls back to the developer's own database if `pg_tmp` fails
**Low** · [packages/demo/dev/serve:12](packages/demo/dev/serve#L12)

`export DATABASE_URI=$(pg_tmp)` doesn't trip `set -e`: the exit status reported is `export`'s, not the substitution's. Verified — the same line *without* `export` exits 1 immediately, with it the script sails on with an empty variable. libpq then treats `""` as "use every default", so the subsequent `psql` and the user-seeding loop run against the developer's own local PostgreSQL: `CREATE SCHEMA cookied`, both extensions, and users `one`/`two` with passwords `1`/`2`. Splitting the assignment from the `export` fixes it.

### F8. `Header.svelte` uses CSS custom properties that are never defined
**Nit** · [packages/demo/src/routes/Header.svelte:16](packages/demo/src/routes/Header.svelte#L16)

`--ui-background-secondary` and `--ui-border` have exactly two occurrences in the tracked tree, both consumers. Confirmed in headless Chrome that an unresolvable `var()` makes the declaration invalid at computed-value time: `backgroundColor: rgba(0,0,0,0)` and — because `border` is a shorthand — `borderStyle: none`. So the nav chips render as plain inline text and `aria-current` bold is the only surviving affordance. A fallback (`var(--ui-border, #ccc)`) or defining the tokens in `styles.css` fixes it.

---

## G. Tests, packaging, tooling

### G1. The SQL-facing code has zero automated coverage
**Medium** · [packages/cookied/package.json:7](packages/cookied/package.json#L7)

`dev/test-schema` does `export DATABASE_URI=$(pg_tmp)` inside its own bash process; an export in a child can't reach the parent, so the `vitest run` that follows sees no `DATABASE_URI` and the pg_tmp instance is simply abandoned (it self-terminates after ~60 s idle). The `&&` chain verifies only that psql exited 0 — and per B6, not even that reliably.

Confirmed by running the suite: the only test file is `lib/session.test.ts` (8 `SessionCookie` tests). Nothing imports `SessionsQuery`, `SessionKit`, or `default_sql`, and `new_session()` is never called by any test. `git ls-files` shows no CI config of any kind. So a wrong `WHERE` clause, a renamed column, a broken `new_session()` RECORD shape, or a login path that skips the hash comparison all ship green.

This is the highest-leverage item in the review: nearly every finding in sections A, B, and C would have been caught by a handful of integration tests against a pg_tmp instance, and the plumbing to spin one up already exists — `test-schema` just needs to hand the URI to vitest instead of dropping it (e.g. `DATABASE_URI=$(pg_tmp) vitest run`, or have a vitest global-setup create it).

### G2. `dev/test-schema` green-lights a broken database
**Medium** · [dev/test-schema:9](dev/test-schema#L9)

The B6 consequence, stated as a tooling defect: because `ON_ERROR_STOP` isn't in effect for `extensions.sql`, a failed `CREATE EXTENSION` (missing pgcrypto, or a non-superuser role — exactly the case `schema.sql`'s own comment anticipates) is reported as success. Reproduced: psql prints the ERROR, continues, exits 0, and the schema is created on a database where nobody can ever log in. `packages/demo/dev/serve` has the identical invocation and then seeds users and starts vite against it.

### G3. `@logtape/logtape` is an optional peer but a hard runtime import
**Medium** · [packages/cookied/lib/util.ts:3](packages/cookied/lib/util.ts#L3)

`peerDependenciesMeta` marks it optional, promising consumers they can install `cookied` without it. But `lib/util.ts` does a value-level `import { getLogger }` and calls it at module top level, `lib/kit/session.ts` does the same, and `lib/db/session.ts` imports values from `../util.js` — so the library's main data-access module pulls it in transitively.

Verified with a module resolve hook that makes the package unresolvable: `lib/session.js` and `lib/db/config.js` load fine; `lib/util.js`, `lib/db/session.js` and `lib/kit/session.js` all fail with `ERR_MODULE_NOT_FOUND`. Either drop `optional: true` or make the logger lazy. (The `@sveltejs/kit` optional peer *is* honoured correctly — `import type` only, and the built JS contains no reference to it.)

### G4. `packages/demo`'s `test` script can't run on a fresh checkout
**Medium** · [packages/demo/package.json:9](packages/demo/package.json#L9)

`tsconfig.json` extends `./.svelte-kit/tsconfig.json`, which is gitignored (confirmed via `git check-ignore`). `check` correctly runs `svelte-kit sync` first and `build` gets it via the vite plugin, but `test` runs `tsc` directly and there's no `prepare` script (the standard SvelteKit template ships one). Reproduced: `error TS5083: Cannot read file '….svelte-kit/tsconfig.json'`. It only works today because `.svelte-kit/` is already present from a previous `dev`.

### G5. The `lint` and `format` scripts are dead in both packages
**Medium** · [packages/cookied/package.json:8](packages/cookied/package.json#L8), [packages/demo/package.json:12](packages/demo/package.json#L12)

Three independent breakages, all reproduced:
- No `eslint.config.*` exists anywhere after the "Remove eslint leftovers" commit, so `eslint .` exits 2. The binary is only on PATH at all because eslint 10.6.0 is hoisted as a transitive peer of the root's `@logtape/lint` — neither package declares it.
- `packages/cookied` has no `prettier` dependency (only the demo does), so it fell through to a system-wide prettier and then died with `Cannot find package 'prettier-plugin-svelte'`.
- `--plugin-search-dir` and `.prettierrc`'s `pluginSearchDirs` were removed in Prettier 3.0; the installed 3.9.4 warns `Ignored unknown option` for both.

`pnpm -F demo lint` currently reports 50 unformatted files and never reaches eslint, so these haven't been runnable for a while. Since `oxlint` is already wired into both `test` scripts and works, the simplest fix is to make `lint` just be prettier + oxlint and delete the eslint half.

### G6. Small leftovers
**Nit**

- [packages/demo/package.json:26](packages/demo/package.json#L26) and [:37](packages/demo/package.json#L37) — `ava` is a devDependency with a config block, but nothing uses it: the demo's `test` is `tsc --noEmit && oxlint`, and cookied uses vitest.
- [pnpm-workspace.yaml:4](pnpm-workspace.yaml#L4) — the `allowBuilds` values are pnpm's own auto-inserted `"set this to true or false"` placeholders. Its `switch` matches only `true`/`false`, so no rule is registered and esbuild/svelte-preprocess build scripts stay ignored. pnpm does print an "Ignored build scripts" warning each install, so this is an unanswered prompt (`pnpm approve-builds`) rather than a silently discarded setting.
- [CLAUDE.md:9](CLAUDE.md#L9) — the hostname gate names `clank`; this machine is `zclank`, so a literal reading tells every agent to stop on your own development machine. Worth updating so the guard stays meaningful.
- Note on workflow: the demo resolves `cookied/lib/…` through the package's built output (verified with `import.meta.resolve`), and nothing in the demo's `dev`/`build` scripts rebuilds it — so edits to `packages/cookied/lib/*.ts` don't affect the running demo, and source maps still point at the `.ts` files, which makes the confusion worse.

---

## What I checked that turned out fine

Recording these so nobody "fixes" them later:

- **The `OLD.id != NEW.id` halves of both check_update triggers are load-bearing — do not remove them.** A reviewer flagged them as unreachable because `GENERATED ALWAYS AS IDENTITY` rejects `SET id = 99`. But identity columns explicitly permit `SET id = DEFAULT`, which draws a *new* value from the sequence. Verified: with the trigger disabled, `UPDATE cookied.users SET id = DEFAULT WHERE username='bob'` silently changed bob's id from 2 to 4; with it enabled, the same statement raises `cannot change id or creation_time` — and since that statement doesn't touch `creation_time`, the id disjunct is the only thing that can have fired. Deleting it would open a silent primary-key rewrite.
- **`sql("cookied.sessions_view")` is correct.** postgres.js's `escapeIdentifier` does `.replace(/\./g, '"."')`, emitting `"cookied"."sessions_view"` — verified live via the debug hook on all three queries. Embedded quotes are doubled, so identifier injection isn't possible.
- **The `\A`/`\Z` anchors in the username domains are sound** — no trailing-newline bypass (`E'abc\n' ~ '\A[-a-zA-Z0-9]+\Z'` is false).
- **`birth_time` really is a `Date` and `hashed_secret` really is a `Buffer`.** Only the int8 declarations are wrong.
- **The visual-ambiguity protection works**: inserting `Ivan` then `1van` collides correctly on `users_visual_username_index`.
- **The argon2id parameters in `hash-password.mjs` are right** — exactly RFC 9106 §4's second recommended configuration.
- **The `@sveltejs/kit` optional peer is honoured correctly** (type-only import; no reference in the built JS).
- **`timingSafeEqual` in `validate()` is used correctly** — both operands are fixed 16-byte buffers, so it can't throw on a length mismatch.
