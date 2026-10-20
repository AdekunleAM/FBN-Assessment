# NovaWallet Transfer API

Minimal reference implementation for the FirstBank NovaPay "NovaWallet Transfer API" exercise
(Part A). NestJS + TypeScript, reads/writes a single JSON file instead of a database. Not
production-grade by design — small, auditable, and built to be exercised by the Part B test
suite.

## Run it

```bash
npm install
npm run dev     # nest start --watch, listens on :3000
```

or build + run compiled JS:

```bash
npm run build
npm start
```

The data file lives at `data/db.json` and is created automatically on first run. Delete it to
reset all state.

## Auth

Every endpoint except `GET /health`, `POST /auth/signup`, and `POST /auth/login` requires a
bearer token (`POST /admin/clear` requires specifically the admin one - see §Admin below):

```
Authorization: Bearer novapay-dev-token
```

Override the static token via the `API_TOKEN` env var. `BearerAuthGuard`
(`src/common/guards/bearer-auth.guard.ts`) accepts **either** that static token **or** a real
per-user JWT issued by `POST /auth/login` — both grant identical access, since this API has no
per-wallet or per-user ownership model (any valid bearer can read/credit/transfer any wallet).
The static token exists so wallet/transfer clients never need to log in at all; it isn't being
phased out.

A default user is seeded on every startup (idempotently — restarting never creates a duplicate),
conventionally linked to the static token: its credentials are documented below specifically so
`POST /auth/me` has something to authenticate with when you're already using the static token
for everything else.

| Env var | Default | Meaning |
|---|---|---|
| `API_TOKEN` | `novapay-dev-token` | Static bearer token, still valid on every protected route |
| `JWT_SECRET` | `novapay-dev-jwt-secret` | HMAC secret used to sign/verify login JWTs |
| `DEFAULT_USER_EMAIL` | `admin@novapay.dev` | Seeded default user's email |
| `DEFAULT_USER_PASSWORD` | `novapay-dev-password` | Seeded default user's password |
| `DEFAULT_USER_FULL_NAME` | `NovaPay Default User` | Seeded default user's display name |

### `POST /auth/signup`
Creates a user account. Public — no bearer token required (there's nothing to authenticate with
yet).

```
Body: { "email": "...", "fullName": "...", "password": "..." }  (password: min 8 chars)
201 { "id": "...", "email": "...", "fullName": "...", "createdAt": "..." }
400 invalid email / missing fullName / password under 8 chars
409 email already registered
```

### `POST /auth/login`
Exchanges valid credentials for a JWT. Public — no bearer token required.

```
Body: { "email": "...", "password": "..." }
200 { "token": "<jwt>", "user": { "id": "...", "email": "...", "fullName": "...", "createdAt": "..." } }
401 invalid email or password (same message either way — doesn't reveal which was wrong)
```

The returned `token` is a standard JWT (HMAC-SHA256, 1 day expiry) signed with `JWT_SECRET`. Use
it exactly like the static token: `Authorization: Bearer <token>`.

### `POST /auth/me`
Returns a user's profile, re-verifying their email + password. **Protected** — requires the
usual `Authorization` header (the static token or any valid JWT) *in addition to* the
credentials in the body.

```
Body: { "email": "...", "password": "..." }
200 { "id": "...", "email": "...", "fullName": "...", "createdAt": "..." }
401 missing/invalid bearer token, or invalid email/password
```

Guards are real Nest `Guard`s (`@UseGuards`), not inline checks in each handler —
`BearerAuthGuard` is applied per-controller on `WalletsController`/`TransfersController` and
per-route on `AuthController` (only `me`, since `signup`/`login` must stay public).

## Admin

### `POST /admin/clear`
Wipes **wallets, transfers, and idempotency keys entirely**, and wipes **every user except
admin users** (`isAdmin: true` — in practice, just the one seeded default user). Admin-only:
unlike every other route, this does **not** accept a per-user JWT, even a valid one — only the
exact static `API_TOKEN`.

```
200 { "walletsCleared": N, "transfersCleared": N, "idempotencyKeysCleared": N,
      "usersCleared": N, "adminUsersPreserved": N }
401 missing/malformed Authorization header
403 a validly-authenticated caller (e.g. a real JWT from a signed-up user) that isn't the admin token
```

Enforced by a separate `AdminAuthGuard` (`src/common/guards/admin-auth.guard.ts`), not
`BearerAuthGuard` — the distinction matters: every other endpoint treats "any valid credential"
as sufficient, but this one is destructive, so it specifically requires *the* admin credential,
not just *a* credential. The admin user is tracked via a persisted `isAdmin` flag on the user
record (not re-derived from `DEFAULT_USER_EMAIL` at clear-time) so that changing that env var
later can never retroactively "unmark" an already-seeded admin.

**This endpoint is intentionally excluded from the Part B / Playwright test suite** — it's an
operator/reset tool (e.g. for wiping a shared dev environment between manual testing sessions),
not a behavior under test, and running it from an automated suite would wipe state out from
under any other test running in parallel.

## Endpoints

### `POST /wallets`
Creates a wallet with a zero balance. No body required.

```
201 { "id": "...", "balanceKobo": 0, "createdAt": "..." }
```

### `POST /wallets/:id/credit`
Deposits funds.

```
Body: { "amountKobo": 100000 }
200 { "id": "...", "balanceKobo": 100000, "createdAt": "..." }
```

### `GET /wallets/:id`
```
200 { "id": "...", "balanceKobo": 100000, "createdAt": "..." }
404 if the wallet doesn't exist
```

### `POST /transfers`
Moves funds between two wallets.

```
Headers: Idempotency-Key: <any client-generated string>
Body: { "fromWalletId": "...", "toWalletId": "...", "amountKobo": 50000 }

201 {
  "transferId": "...", "fromWalletId": "...", "toWalletId": "...",
  "amountKobo": 50000, "fromBalanceKobo": ..., "toBalanceKobo": ..., "createdAt": "..."
}
```

Error cases:
| Status | Condition |
|---|---|
| 400 | missing `Idempotency-Key`, missing/invalid fields, `fromWalletId === toWalletId` |
| 401 | missing/invalid bearer token |
| 404 | either wallet doesn't exist |
| 409 | `Idempotency-Key` reused with a different request payload |
| 422 | insufficient funds, or the ₦500,000/day outbound limit would be exceeded |

Replaying a `POST /transfers` request with the **same** `Idempotency-Key` and the same body
returns the original response (same status code and body) without moving money twice.

## Architecture

NestJS feature modules, kept deliberately flat rather than deeply nested:

```
src/
  main.ts                           bootstrap: body-parser wiring, global ValidationPipe, global exception filter
  app.module.ts / app.controller.ts health check only, no guard
  store.service.ts / store.module.ts   the mutex + JSON file persistence (DI singleton)
  wallet.model.ts                   pure domain functions shared by wallets + transfers (wallet lookup,
                                     daily-window reset, kobo math)
  utils/wat.ts                      pure WAT-date function
  common/
    exceptions/api.exception.ts     HttpException subclass that renders `{ error: message }`
    filters/all-exceptions.filter.ts  global catch-all -> consistent error envelope + 500 logging
    guards/bearer-auth.guard.ts     auth, see above - accepts the static token OR a signed JWT
    guards/admin-auth.guard.ts      stricter: accepts ONLY the static token, for /admin/clear
    guards/idempotency-key.guard.ts route-level guard: rejects a missing Idempotency-Key before
                                     the body even reaches DTO validation (preserves original
                                     check ordering: auth -> idempotency header -> body shape)
    jwt.util.ts                     sign/verify JWTs (HMAC-SHA256 via `jsonwebtoken`)
    password.util.ts                salted scrypt hash/verify (Node's built-in `crypto`, no bcrypt dep)
  wallets/      wallets.module.ts, wallets.controller.ts, wallets.service.ts, dto/credit-wallet.dto.ts
  transfers/    transfers.module.ts, transfers.controller.ts, transfers.service.ts, dto/create-transfer.dto.ts
  users/        users.module.ts (seeds the default user on startup via OnModuleInit),
                auth.controller.ts (/auth/signup, /auth/login, /auth/me), users.service.ts,
                user.model.ts, dto/sign-up.dto.ts, dto/credentials.dto.ts
  admin/        admin.module.ts, admin.controller.ts (/admin/clear), admin.service.ts, admin.model.ts
```

Request validation (`amountKobo` positive-integer, `fromWalletId`/`toWalletId` non-empty strings)
lives at the DTO layer via `class-validator`, wired through a global `ValidationPipe` with a
custom `exceptionFactory` so validation failures come back as `400 { "error": "..." }` instead of
Nest's default `{ statusCode, message, error }` shape. Cross-field checks that `class-validator`
decorators can't express on their own (`fromWalletId !== toWalletId`) and the `Idempotency-Key`
header check stay as explicit guards/service-level checks, per the brief's guidance against
speculative abstraction.

## Design notes

- **Amounts in kobo.** All monetary fields are integer kobo (₦1 = 100 kobo) to avoid
  floating-point drift, per the brief.
- **Atomicity without a database.** All mutating operations (`credit`, `transfer`, wallet
  creation) run through a single in-process async mutex (`src/store.service.ts`, a Nest DI
  singleton) that serializes read-modify-write cycles against the in-memory store, then persists
  to `data/db.json` via a write-to-temp-file + rename so a crash mid-write can't corrupt the file.
  This is enough to guarantee correctness for a single Node process; it would not survive multiple
  processes sharing the same file (noted as an explicit scaling limit, not something Part A tries
  to solve — scaling out would mean moving the lock to Redis/Postgres advisory locks).
- **Idempotency.** Each `Idempotency-Key` is stored with a hash of the request body it was
  first used with. A replay with an identical body returns the cached response; a replay with a
  *different* body is rejected with `409` instead of silently reprocessing — this protects
  against a client bug that reuses a key across logically different transfers.
  Validation (wallet existence, sufficient funds, daily limit) always runs before any balance
  mutation, so a thrown error never leaves a half-applied transfer.
- **Daily outbound limit, WAT-anchored.** Each wallet stores `dailyOutbound: { watDate, totalKobo }`.
  `src/utils/wat.ts` computes "today" by adding a fixed UTC+1 offset to `Date.now()` and reading
  the UTC calendar fields back off — this gives the correct West Africa Time calendar date
  regardless of the host server's own timezone or DST settings (WAT has no DST). The window
  resets lazily on next access once the stored `watDate` no longer matches today, rather than
  via a cron job.
- **No negative balances.** Verified under concurrency: firing 10 simultaneous transfers against
  a wallet that can only afford one succeeds exactly once; the other nine get `422 Insufficient
  funds` and the balance never dips below zero (see Part B test suite for the automated version
  of this check).
- **Users, passwords, and JWTs — added as a second DB collection, not a second store.** `users`
  lives inside the same `db.json` and goes through the same mutex/persist-on-write path as
  wallets/transfers (see `StoreService`) — "the appropriate JSON file" for this app is the one
  it already has, not a new one. An old `db.json` written before `users` existed still loads
  correctly (`StoreService.load()` defaults a missing `users` key to `{}`), so upgrading in place
  never loses existing wallet/transfer history.
- **Passwords are never stored in plaintext.** `src/common/password.util.ts` salts + hashes with
  Node's built-in `crypto.scryptSync` (stored as `"salt:hash"`) and compares with
  `crypto.timingSafeEqual` — no new dependency needed for this.
- **JWTs are real, not hardcoded.** `POST /auth/login` issues a signed, 1-day-expiry JWT via the
  `jsonwebtoken` package; `BearerAuthGuard` verifies it on every subsequent request. The static
  `API_TOKEN` keeps working side by side with real JWTs (checked first, as a cheap equality
  check) specifically so existing wallet/transfer integrations never have to change.
- **The default user is seeded once, idempotently.** `UsersModule` seeds it in `OnModuleInit`
  (before the app starts accepting connections, so there's no race with request traffic) via
  `StoreService.mutateIfNeeded`, which only persists if a user was actually created — restarting
  the server never produces a duplicate default user or an unnecessary disk write.
- **"Admin" is a persisted flag, not a derived check.** `POST /admin/clear` needs to know which
  user to spare, but comparing against `DEFAULT_USER_EMAIL` *at clear time* would be fragile - if
  that env var ever changes between restarts, the old admin record would silently stop matching.
  Instead `isAdmin: true` is set once, at seed time, and persisted on the record itself; clearing
  filters on that flag, not on a recomputed email comparison. A `db.json` written before this
  flag existed is migrated once on load (same email-match heuristic, applied only to records
  that predate the field) and the migrated shape is persisted immediately, before the server
  accepts any requests - so the on-disk file is never left in a stale, pre-migration shape.
