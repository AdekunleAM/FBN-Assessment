# Test Strategy — NovaWallet Transfer API

This document describes *how* and *why* this suite tests `nova-wallet-api` the way it does.
For layer-by-layer framework documentation (how to extend it), see [steps.md](./steps.md).

## 1. Scope

In scope: the five HTTP endpoints exposed by `nova-wallet-api` — `GET /health`,
`POST /wallets`, `GET /wallets/:id`, `POST /wallets/:id/credit`, `POST /transfers` — tested as a
black box over real HTTP, against a real running instance (never mocked).

Out of scope: unit/integration tests of the backend's internals (that's the backend repo's own
job), UI testing (there is no UI), load/performance testing beyond the one concurrency scenario
below, and a full penetration test (the security suite is an explicit first pass, not exhaustive
— see §6).

## 2. Risk-based prioritization

This is a money-movement API. The risks that matter are ranked by *consequence*, not by how easy
they are to test:

| Risk | Consequence if wrong | Why it's a top priority here |
|---|---|---|
| Double-spend under concurrency | Money created from nothing; balance goes negative | Classic check-then-act race; silent until a real concurrent-load incident |
| Idempotency-Key misuse | Duplicate charge on retry, or a client bug silently reprocessed as new money movement | Retries are a *given* in any real payment client — this is not an edge case |
| Currency precision drift | Balances slowly diverge from reality after enough transactions | Invisible in any single manual test; only shows up statistically |
| Auth/authz bypass | Unauthorized wallet access or fund movement | Standard baseline for any financial API |
| Input validation (negative/zero/fractional amounts, malformed requests) | Bad data enters a ledger | Cheap to test, expensive to leave untested |
| Daily outbound limit correctness | Regulatory/business-limit bypass | Explicit business rule in the brief |

The suite is organized so each of the top four risks has its own dedicated, named spec file
(`concurrency.spec.ts`, `idempotency.spec.ts`, `currency-precision.spec.ts`, `security.spec.ts`)
rather than being folded into generic CRUD tests — a reviewer should be able to find "how is
double-spend tested?" by filename alone.

## 3. Test levels

Single level: **API black-box testing** via `@playwright/test`'s `APIRequestContext`, through
the framework's layered architecture (`sendRequest` → service classes → tests — see `steps.md`
§0–9). No test ever imports or mocks anything from `nova-wallet-api`'s own source — every
assertion is made against real HTTP responses from a really-running process, including its real
JSON-file persistence and real in-process mutex. This is deliberate: concurrency and idempotency
correctness are exactly the properties that a unit test with a mocked store cannot prove.

## 4. Test environment & execution

- **Local**: `npm test` inside `api-automation-test`. Playwright's `webServer` config builds and
  boots `nova-wallet-api` itself (`npm run build && npm run start` in that directory) against
  `data/db.json` created fresh, and tears it down after. If a `nova-wallet-api` dev server is
  already running locally, it's reused instead (`reuseExistingServer: !process.env.CI`).
- **CI**: `.github/workflows/api-tests.yml` (repo root) — installs both projects, typechecks the
  framework (`tsc --noEmit`), then runs the same `npm test`, uploading the HTML report as an
  artifact regardless of pass/fail.
- Every test run starts from a clean `data/db.json` and creates its own fresh wallets — no shared
  fixture state between tests, no test depends on another test's side effects, and tests can run
  fully parallel (`fullyParallel: true`) except where a test deliberately needs sequential control
  (the 50-transfer precision test; see §7).

## 5. Coverage matrix

| Endpoint | Happy path | Negative scenario(s) |
|---|---|---|
| `GET /health` | 200, `{status:"ok"}`, no auth required | `POST /health` → 404 (method not mapped) |
| `POST /wallets` | 201, zero balance, valid UUID/ISO shape | 401 no auth |
| `GET /wallets/:id` | 200, matches created wallet exactly | 404 unknown id |
| `POST /wallets/:id/credit` | 200, balance == exact credited kobo | 400 × 5 (`0`, `-100`, `100.5`, `"100000"`, `null`) |
| `POST /transfers` | 201, both balances exact to the kobo | 422 insufficient funds · 400 self-transfer · 404 unknown wallet · 400 missing `Idempotency-Key` · 400 invalid amount · 422 daily limit exceeded · 401 no auth |

Every negative test that mutates (or attempts to mutate) a balance also re-reads the wallet via
`GET` afterward and asserts the balance was **not** moved — a 400/404/422/409 response is only
proof of correct rejection if the ledger actually didn't change.

## 6. Security testing approach (first pass, not a pen-test)

Three sub-concerns, each with its own `test.describe` in `security.spec.ts`:

1. **Authentication bypass** — no header, invalid/garbage token, malformed header (missing
   `Bearer ` prefix) — against every protected endpoint, not just one.
2. **Authorization boundary** — tested honestly rather than assumed. Finding: **this API has no
   per-wallet ownership model** — the single shared bearer token grants full read/credit/transfer
   access to every wallet by id. This is documented as a test that currently asserts the *actual*
   behavior (cross-wallet access succeeds), with an explicit comment that it should be rewritten
   to expect `403` if per-wallet scoping is ever added. This is deliberately reported rather than
   silently assumed-safe or silently skipped.
3. **Injection-style inputs** — SQL-injection-style strings and a NoSQL-operator-shaped object
   (`{"$gt": ""}`) in path params and body fields, plus a payload combining both inside the
   `Idempotency-Key` header. Since the backend has no SQL/NoSQL database (a single JSON file,
   looked up by exact UUID key), the correct and expected outcome is **safe rejection** — a clean
   404/400, never a 500, and never silent coercion of a malformed value into a valid one. These
   tests prove the absence of an injection vector for *this* storage model; they are not a
   general SQLi/NoSQLi scanner and would need to be redesigned if the backend ever moves to a
   real database.

## 7. Concurrency testing approach — evidence, not assertion

`concurrency.spec.ts` fires **10 real concurrent** `POST /transfers` (via `Promise.all`, distinct
`Idempotency-Key` per request so the race is about the balance mutex, not idempotency dedup)
against a wallet funded for exactly one of them. Three independent proofs are captured, not just
asserted:

1. The **raw status code of every one of the 10 responses** (expect exactly one `201`, nine
   `422`).
2. The **final balances read back from the server** after the race settles (not an in-memory
   tally kept by the test) — sender must be exactly `0`, recipient exactly one transfer's worth.
3. All of the above — full status codes, full response bodies, final balances — are written to
   the HTML report via `testInfo.attach('concurrency-evidence.json', ...)` **before** any
   assertion runs, so the raw proof is inspectable independent of whether the test itself is
   green. (Verified during development by decoding the attachment directly from the JSON
   reporter output, not just trusting that `attach()` was called.)

## 8. Idempotency testing approach

`idempotency.spec.ts` covers the two contractually-required paths:

- **Same key, same body** → second response is byte-identical to the first (`toEqual`), and the
  ledger shows money moved exactly once.
- **Same key, different body** → `409`, and the ledger is read back to prove the conflicting
  payload was never applied (the *recipient of the second, rejected request* has balance `0`,
  not just "the first transfer's recipient has the right balance" — the stronger claim).

The conflict test uses a **hard** `expect` to gate on the original transfer having actually
succeeded before asserting anything about the conflicting replay — an unconditional soft
assertion there would produce a confusing failure if the setup itself were broken.

## 9. Currency precision testing approach

Explicit precision checks, not "the number looked plausible":

- **50 sequential 1-kobo transfers**, summed with `toBe` (never `toBeCloseTo`, which would mask
  drift) — proves no cumulative floating-point error across many small mutations. Run
  sequentially (not concurrently) because this test is about arithmetic correctness over many
  operations, not about the concurrency guarantee (that's §7's job).
- **Fractional kobo** (`100.5`) and **stringified amounts** (`"100000"`) are rejected outright,
  not silently floored, rounded, or coerced.
- **A large integer past the 32-bit signed boundary** (`2_147_483_647 + 1_000_000`) round-trips
  through credit → response with full precision, ruling out a 32-bit integer truncation bug.

## 10. Known limitations of this suite

- No WAT-midnight boundary test (crossing the daily-limit reset at real UTC+1 midnight) — would
  require either time-travel/clock mocking the live server or waiting for a real midnight;
  judged not worth the added flakiness/complexity for this exercise. The backend's own
  `src/utils/wat.ts` is a pure function and is a better target for a focused unit test if that
  boundary needs direct verification.
- No test exercises multi-process/horizontal-scaling behavior — `nova-wallet-api`'s own README
  states this explicitly as an out-of-scope concern for a single-process JSON-file store, so no
  test here pretends otherwise.
- The security suite is a first pass (see §6) — not a substitute for a dedicated security review
  or a real pen-test.

## 11. Entry / exit criteria

- **Entry**: `nova-wallet-api` builds and starts cleanly (`npm run build && npm run start`);
  `.env`/defaults resolve to a reachable `API_BASE_URL`.
- **Exit**: `npm test` reports 0 failures, `npm run typecheck` is clean, and — for any new test —
  it has been run at least once against a live server (not just asserted to type-check; see
  `steps.md` §12 for why that distinction matters here).
