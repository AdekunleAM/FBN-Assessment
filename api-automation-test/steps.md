# steps.md — how this framework is built, and how to extend it

This is the only documentation file for this framework (no README — this file substitutes for
one, same convention as the reference `api-automation` project this was built from). It mirrors
`prompt.md`'s layer order, but every section below reflects what was *actually built* for
`nova-wallet-api`, with the real code and a concrete edge case per section — not the generic
description.

## 0. Prerequisites

```bash
cd api-automation-test
npm install
cp .env.sample .env   # defaults already match nova-wallet-api's dev config, edit if needed
npm test              # builds + boots nova-wallet-api automatically, runs the suite, tears it down
```

`playwright.config.ts`'s `webServer` block runs `npm run build && npm run start` inside
`../nova-wallet-api` and waits on `GET /health` before the suite starts. If you already have
`nova-wallet-api` running locally (`npm run dev` in that directory), Playwright detects it and
reuses it instead of spawning a second instance (`reuseExistingServer: !process.env.CI`).

**Coverage status, honestly stated:** every endpoint (`GET /health`, `POST /wallets`,
`GET /wallets/:id`, `POST /wallets/:id/credit`, `POST /transfers`) has a happy-path test and at
least one negative test. There is no fifth backend service waiting to be covered — this API is
small by design, so unlike the reference framework there's no "service with zero test coverage"
trap to warn about yet. If `nova-wallet-api` grows a new endpoint, add it to
`endpoints.json` → the owning service class → the matching spec file, in that order, before
writing the test.

## 1. Config (`src/config/config.ts`)

```ts
const config = {
    API_BASE_URL: requiredEnv('API_BASE_URL', 'http://localhost:3000'),
    API_TOKEN: requiredEnv('API_TOKEN', 'novapay-dev-token'),
};
```

Deliberately simpler than the reference framework's per-environment URL switch-statement: this
API has exactly one backend and one base URL (no staging/prod split exists yet), so prompt.md's
plain "read straight from `process.env`, with fallback defaults" is the right fit. If a staging
environment shows up later, resist copying the reference's hardcoded-per-environment-URL
pattern unless you actually have multiple fixed, known hosts to switch between — an env var is
simpler and works today.

**Edge case:** `requiredEnv` throws immediately on import if a var is missing and has no
fallback — both of ours have dev-mode fallbacks, so a bare `npm test` with no `.env` file at all
still works out of the box against a locally-booted `nova-wallet-api`.

## 2. Types (`src/types.d.ts`)

Every type is `export`ed explicitly — unlike the reference framework, where `types.d.ts` never
uses `export` and still gets imported everywhere else (it "works" there only because Playwright's
esbuild-based TS transform skips real type-checking). This project runs `tsc --noEmit` as its
`typecheck` script and in CI, so types must be real, valid ES modules.

```ts
export type SetupFundedTransferArgs = {
    walletsService: import('./services/wallets').WalletsService;
    ...
};
```

**Edge case:** that inline `import('./services/wallets').WalletsService` type query (rather than
a top-of-file `import { WalletsService } from './services/wallets'`) exists specifically to avoid
a circular import — `types.d.ts` is imported by `wallets.ts`, and `transfers.ts`'s orchestration
method needs `WalletsService`'s type. The inline type-only `import()` is erased at compile time,
so it never becomes a real runtime circular dependency.

## 3. Enums & constants

- `src/enums/enums.ts` — `HttpStatus`, `RequestMethod`, `ResponseTime` (SLA thresholds actually
  asserted against in the happy-path tests, not just declared).
- `src/constants/constants.ts` — `Constants.DAILY_OUTBOUND_LIMIT_KOBO`,
  `DEFAULT_FUNDING_AMOUNT_KOBO`, `DEFAULT_TRANSFER_AMOUNT_KOBO`.

**Edge case:** the reference framework has a `Currency` enum and imports `ajv` into `base.ts`
that nothing in that codebase ever actually calls — dead scaffolding. This framework only
defines an enum/constant/dependency once something in `src/tests` actually asserts against it.
Before adding a new enum value or constant, grep for it first — if nothing will read it, it
doesn't belong here yet.

## 4. Endpoints registry (`src/api-endpoints/endpoints.json`)

```json
{
    "walletsService": {
        "createWallet": { "url": "/wallets", "permissions": [] },
        "getWalletById": { "url": "/wallets/:id", "permissions": [] },
        "creditWallet": { "url": "/wallets/:id/credit", "permissions": [] }
    }
}
```

Flat one-level-deep shape throughout (`service.actionName.url`) — `nova-wallet-api` has no
nested resource groupings, so there was never a reason to go two levels deep the way the
reference framework's `inventoryService.marketplaceCars.getAll.url` does.

**Edge case:** always reference `.url` on the leaf object (`endpoints.walletsService.createWallet.url`),
never the bare object. The reference framework has a real, uncovered bug
(`afs-middleware.ts`) where a service forgot the `.url` suffix and silently built a URL
containing the literal text `[object Object]` — it was never caught because that service has
zero tests. Every service method here is exercised by at least one spec, so the same mistake
would fail loudly instead of hiding.

## 5. Request helper (`src/helper/request-helper.ts`, `src/helper/functions-helper.ts`)

`sendRequest` is the single chokepoint for every HTTP call — copied verbatim from the reference
framework's implementation (it's correct as-is: query stringification via `qs`, `pathParams`
substitution via `replaceUrlParams` which throws on a missing param, full
`{raw, body, duration, requestUrl}` shape returned unopened).

`functions-helper.ts` only has what's actually called: `generateRandomNumber`,
`generateRandomString`, `generateIdempotencyKey`. No email plus-addressing or date helpers —
`nova-wallet-api` has no user/email concept and no date-bounded entities in its request bodies,
so those reference-framework helpers would be dead code here.

**Edge case:** `generateIdempotencyKey` is called with a different prefix per test
(`'transfer-happy'`, `'race-0'`, `'precision-12'`, ...) specifically so that a failed run's
HTML report attachment / Playwright trace makes it obvious which test created which key, without
needing a shared counter or test-run id threaded through everywhere.

## 6. Base class (`src/services/base.ts`)

```ts
assertUUID(value, description?)
assertInteger(value, description?)   // the one built specifically for currency-precision checks
assertStrictValue(actual, expected, description?)
```

Three methods, not the full `assertEmail`/`assertPhoneNumber`/`assertURL`/`assertJSONSchema*`
list prompt.md describes generically — this domain has no emails, phone numbers, URLs, or
schema-validated nested payloads in its responses, and the reference framework itself only ever
actually built two of those methods despite importing `ajv` for a third. Every method here is
called from at least one spec file; none are speculative.

Each method follows the same shape (copied convention, not copied code): check the condition
first, and only create a `test.step` + `expect.soft` if it **already failed** — a passing
assertion produces zero step noise in the report.

**Edge case:** `assertInteger`'s default description literally says "currency fields must be
integer kobo, never a float" — this message is what shows up in the HTML report if, say, a
future refactor of `nova-wallet-api` ever returns `balanceKobo` as `1000.0` instead of `1000`
after a JSON round-trip; the failure is self-explanatory without opening the test source.

## 7. Services (`src/services/health.ts`, `wallets.ts`, `transfers.ts`, `index.ts`)

Every service that needs its own validation/orchestration takes a `Base` instance and declares
`readonly base: Base` (consistently — the reference framework split three ways on this, some
services keep `this.base`, one doesn't, one takes a plain `APIRequestContext` instead). Rule
applied here: **plain `APIRequestContext` only if the class never calls a `Base` method itself**
(`HealthService` — it has no domain validation). `WalletsService`/`TransfersService` both have
`verifyXShape`/`verifyXIntegrity` methods, so both take `Base`.

`TransfersService.setupFundedTransfer` is the one orchestration method:

```ts
async setupFundedTransfer(args: SetupFundedTransferArgs) {
    const fromWallet = (await walletsService.createWallet({ headers })).body;
    const toWallet = (await walletsService.createWallet({ headers })).body;
    await walletsService.creditWallet({ pathParams: { id: fromWallet.id }, ... });
    const transferResponse = await this.createTransfer({ ... });
    return { fromWalletId, toWalletId, idempotencyKey, transfer: transferResponse.body };
}
```

It's named for the end state (`setupFundedTransfer`, not `createWalletsThenCreditThenTransfer`),
composed only out of `WalletsService`/`TransfersService`'s own public methods (no raw
`sendRequest` inlined), and returns only the minimal shape the e2e test needs — per prompt.md's
step 10 rule, this is the one deliberate exception to "always return the full response."

**Edge case:** `setupFundedTransfer` lives on `TransfersService` but takes a `WalletsService`
instance as an argument rather than owning one itself — this journey genuinely spans two
services, and the reference framework's own orchestration methods (`generateCarId`,
`generateLoanId`) never had to cross a service boundary this way. Passing the dependency in as
an arg (rather than, say, giving `TransfersService` a hidden internal `WalletsService` field)
keeps the two services decoupled and the orchestration method's dependencies visible at the call
site.

## 8. Test data fixtures (`src/test-data/data.json`, `users.json`, `index.ts`)

No market/tenant keying (`NG`/`KE`/...) — `nova-wallet-api` is NGN/kobo only by design (see the
backend's own `prompt.md`), so a country-keyed fixture structure would be pure ceremony.

`users.json` is intentionally thin:

```json
{ "service": { "tokenEnvVar": "API_TOKEN", "invalidToken": "not-a-real-token-should-be-rejected" } }
```

There's no multi-user/role concept in this API — one shared bearer token grants full access to
every endpoint (see the "Authorization boundary" finding in `security.spec.ts`). The *real*
token value is never duplicated here; it's read once from `config.API_TOKEN`. The only fixture
value that's actually a credential-adjacent value (`invalidToken`) is one that's genuinely used,
in the bad-token security test — nothing in this file is unused scaffolding.

## 9. Tests (`src/tests/*.spec.ts`)

**Deviation from prompt.md's "one spec file per market" rule, by explicit instruction for this
project:** since there's exactly one market/tenant here, spec files are split by
feature/concern instead, each with its own `test.describe` block(s):

| File | `test.describe` tag |
|---|---|
| `health.spec.ts` | `@general @health_svc` |
| `wallets.spec.ts` | `@general @wallets_svc` |
| `transfers.spec.ts` | `@general @transfers_svc` |
| `idempotency.spec.ts` | `@general @transfers_svc @idempotency` |
| `concurrency.spec.ts` | `@general @transfers_svc @concurrency` |
| `security.spec.ts` | `@general @security` (nested `test.describe`s per sub-concern) |
| `currency-precision.spec.ts` | `@general @currency` |
| `e2e.spec.ts` | `@general @e2e @fund_transfer` |

Inside every test: instantiate `Base` only if a service needs it (plain `request` suffices for
`HealthService`), generate a fresh `Idempotency-Key` per transfer call via
`generateIdempotencyKey(<context>)`, wrap each logical assertion group in its own `test.step`,
`expect.soft` for everything except genuine gating conditions.

**Edge case — hard vs. soft `expect`:** `idempotency.spec.ts`'s conflict test uses a *hard*
`expect(originalResponse.raw.status()).toBe(201)` before attempting the conflicting replay — if
the original transfer never actually succeeded, asserting "the conflicting replay got a 409" is
meaningless noise, so the test aborts there instead of reporting a confusing downstream failure.
The same pattern is in `currency-precision.spec.ts`'s 50-transfer loop (each individual transfer
is a hard gate) and `e2e.spec.ts` (the orchestration result must exist before verifying balances
built on top of it).

## 10. Concurrency, idempotency, security, currency — the four requirements beyond CRUD

These aren't a generic layer from prompt.md — they're this project's explicit brief, each
mapped onto the layered architecture rather than bolted on as scripts:

- **Concurrency** (`concurrency.spec.ts`): fires 10 real concurrent `POST /transfers` against a
  wallet funded for exactly one, using `Promise.all` + distinct `Idempotency-Key`s per request
  (so the race is genuinely about the balance-check mutex, not idempotency dedup). Evidence, not
  assertion: the full array of response status codes/bodies and the **server-read-back** final
  balances (not an in-memory tally) are attached to the HTML report via `testInfo.attach(...)`
  before any assertion runs, so the raw proof is inspectable independent of whether the test
  itself passes.
- **Idempotency** (`idempotency.spec.ts`): same-key-same-body → byte-identical cached response
  + money moved once; same-key-different-body → `409` + balances prove the second payload was
  never applied.
- **Security** (`security.spec.ts`): missing/invalid/malformed auth across all four protected
  endpoints; a documented **finding** (not a silently-passed assumption) that this API has no
  per-wallet ownership boundary; SQL-injection-style and NoSQL-operator-shaped payloads in path
  params and body fields, proving safe rejection rather than a crash or silent coercion.
- **Currency precision** (`currency-precision.spec.ts`): 50 sequential 1-kobo transfers summed
  with `toBe` (never `toBeCloseTo`, which would mask drift), plus rejection tests for fractional
  kobo, stringified numbers, and a large-integer round-trip past the 32-bit signed boundary.

**Edge case:** `expect.poll` isn't used anywhere in this suite — `nova-wallet-api` has no
asynchronous/eventually-consistent state (every mutation is synchronous and visible on the very
next `GET`), unlike the reference framework's loan-offer polling. If `nova-wallet-api` ever grows
an async side effect (e.g. a webhook-driven settlement), that's the pattern to reach for, built
on `expect.poll` exactly as prompt.md describes — not a `sleep()`.

## 11. E2E flow tests (`src/tests/e2e.spec.ts`)

One journey so far: `Fund And Transfer Flow @general @e2e @fund_transfer` — create two wallets,
fund the sender, transfer, verify both balances, then replay the same journey's
`Idempotency-Key` end-to-end to prove idempotency holds even inside a multi-step flow, not just
in isolation. Step granularity is coarse (milestone-level: "run the orchestration," "verify
balances," "verify replay"), not one step per HTTP call, per prompt.md's step 10 rule.

**Edge case:** there's only one e2e journey because this backend only has one real
multi-step journey (fund → transfer). Resist inventing a second flow file just to have more of
them — add one only when `nova-wallet-api` grows a feature that genuinely chains ≥3 real steps.

## 12. Before calling anything "done"

Run `npm test` against a live `nova-wallet-api` at least once — a clean `tsc --noEmit` or a
green run of unrelated tests is not proof a new test's assertions are actually correct (the
reference framework's own `steps.md` makes the identical point about never trusting a typecheck
pass as a substitute for a live run). Then re-check `src/services/index.ts` for the new service
export and `.gitignore`/`.env.sample` before finishing.

## 13. Deliverable checklist (extension checklist, not from-scratch)

- [x] `src/config/config.ts` + `.env.sample`
- [x] `src/types.d.ts`, fully `export`ed
- [x] `src/enums/enums.ts`, `src/constants/constants.ts`
- [x] `src/api-endpoints/endpoints.json` — all three services
- [x] `src/helper/request-helper.ts`, `src/helper/functions-helper.ts`
- [x] `src/services/base.ts`
- [x] `src/services/health.ts`, `wallets.ts`, `transfers.ts` + `index.ts` barrel
- [x] `src/test-data/data.json`, `users.json`, `index.ts`
- [x] `playwright.config.ts` (`testDir: './src/tests'`, `webServer` auto-boots `nova-wallet-api`)
- [x] Happy path + ≥1 negative test for every endpoint
- [x] `idempotency.spec.ts`, `concurrency.spec.ts` (with attached evidence), `security.spec.ts`,
      `currency-precision.spec.ts`
- [x] `package.json` run scripts: all-tests, per-service-tag, per-feature-tag, `e2e`,
      `e2e:fund_transfer`, `typecheck`, `report`
- [x] `src/tests/e2e.spec.ts` with one orchestration-method-backed flow
- [x] `.github/workflows/api-tests.yml` — installs both projects, typechecks, runs the suite,
      uploads the HTML report
- [x] This `steps.md`
