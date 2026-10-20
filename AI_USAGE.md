# AI Usage Log

A high-level walkthrough of what I (Claude, via Claude Code) was asked to do across this
engagement, in the order it was requested, and what I actually did in response. This is a
summary for a human reviewer — it is not a line-by-line transcript.

## 1. Orientation: read and understand the existing `Wallet API`, then rename it

**Prompt:** read, ingest, and understand the `Wallet API` directory and session info; rename it
to `nova-wallet-api`.

**What I did:** read every source file (`README.md`, `prompt.md`, `src/**`, `package.json`,
`tsconfig.json`) of the existing Express + TypeScript implementation and summarized its
architecture back (mutex-based concurrency, Idempotency-Key semantics, WAT-anchored daily
limit, bearer auth). I flagged two things proactively rather than silently noting them: the
backend's own `prompt.md` asked for **NestJS** but the delivered code was plain **Express**, and
there was no `test/` directory despite `package.json` and the README referencing a "Part B test
suite." Then I renamed the directory with a plain `mv` (no code inside referenced the old path
name, confirmed by grep before renaming).

## 2. Migrate the backend from Express to NestJS, preserving behavior exactly

**Prompt:** rework the API to use NestJS instead, maintaining functionality and everything else.

**What I did:** a full framework migration, not a rewrite of behavior — restructured the app
into Nest modules/controllers/services/guards/DTOs/a global exception filter, while deliberately
carrying over the four things that actually mattered: the promise-chain mutex (`StoreService`),
the Idempotency-Key hash-and-replay logic, the WAT-anchored daily-limit reset, and the exact
`{error: "..."}` response envelope (via a custom `ApiException` + `ValidationPipe` exception
factory, since Nest's defaults would otherwise have changed the error response shape). I
installed the real NestJS dependencies, fixed `tsconfig.json` for decorator metadata, and — before
calling it done — built the compiled app and ran it live: health check, auth success/failure,
wallet CRUD, the full transfer lifecycle (success / idempotent replay / idempotency conflict /
insufficient funds), and critically, **fired 10 concurrent transfers against a wallet that could
only afford one** to prove the concurrency guarantee survived the migration (exactly one `201`,
nine `422`s, balance never negative). Updated the README to describe the new architecture.

## 3. Build a Playwright API test automation framework for the migrated backend

**Prompt:** create a new `api-automation-test` directory, Playwright + API testing framework,
architecture as specified in the root-level `prompt.md`, with seven explicit, numbered coverage
requirements (happy + negative path per endpoint, a concurrency proof with evidence, idempotency
replay/conflict tests, a security first-pass, explicit currency-precision checks, and a working
CI pipeline).

**What I did:**
- Read the root `prompt.md` — a generic ten-layer architecture spec (config → types → enums →
  endpoints registry → request helper → base class → services → test data → tests → e2e flows).
- Partway through, the user pointed me at a sibling **reference implementation**
  (`api-automation`) and asked me to mirror how that architecture is *actually* built, not just
  the generic prompt description. I used a research subagent to read that entire reference
  framework file-by-file and report back its real conventions, its deliberate
  deviations from the generic prompt, and its known bugs/dead code — specifically so I could
  copy the good conventions and *not* copy the bugs (e.g., a service method that silently built
  a broken URL by forgetting `.url`, an unused `ajv` import, inconsistent constructor patterns
  across services).
- The user also redirected the test-file layout mid-task: feature-based spec files
  (`wallets.spec.ts`, `transfers.spec.ts`, `idempotency.spec.ts`, `concurrency.spec.ts`,
  `security.spec.ts`, `currency-precision.spec.ts`, plain `e2e.spec.ts`) instead of the
  per-market file the generic prompt describes — appropriate here since this backend has no
  multi-market concept.
- Built every layer for real: a thin `Base` class with only the assertions actually called
  (no speculative/unused helpers), three service classes (`HealthService`, `WalletsService`,
  `TransfersService`) with one cross-service orchestration method for the e2e flow, a flat
  endpoints registry, and test-data fixtures sized to what this domain actually has (no
  user/market concept to fabricate).
- Wrote all 8 spec files (36 tests total) directly addressing the 7 numbered requirements: every
  endpoint has a happy path and ≥1 negative test; `concurrency.spec.ts` fires 10 real concurrent
  requests and attaches the raw evidence (status codes + server-read-back balances) to the HTML
  report rather than just asserting a conclusion; `idempotency.spec.ts` covers same-key-same-body
  and same-key-different-body; `security.spec.ts` covers auth bypass, an honestly-documented
  finding that this API has no per-wallet ownership boundary, and injection-style inputs;
  `currency-precision.spec.ts` explicitly checks integer-kobo precision (50 summed 1-kobo
  transfers via `toBe`, not `toBeCloseTo`; fractional/stringified-amount rejection; a 32-bit
  boundary round-trip).
- Added `.github/workflows/api-tests.yml` at the repo root (installs both projects, typechecks,
  runs the suite, uploads the report) and `steps.md` documenting every layer with real excerpts
  and edge cases.
- Verified rather than claimed: ran `tsc --noEmit`, then ran the actual suite multiple times
  including a genuine cold start (killed any running server, deleted `dist`/`data`, ran
  `npm test` from scratch) to confirm the Playwright `webServer` config really does build and
  boot `nova-wallet-api` on its own. When the concurrency evidence attachment wasn't visible via
  a plaintext search of the (zipped) HTML report, I didn't assume it was broken — I decoded it
  directly from the JSON reporter output to confirm it was actually recorded correctly.

## 4. Document the testing strategy and this usage log

**Prompt:** create `TEST_STRATEGY.md` and this `AI_USAGE.md`.

**What I did:** `TEST_STRATEGY.md` (in `api-automation-test/`) documents the *why* behind the
test suite — risk-based prioritization for a money-movement API, the coverage matrix, and a
deep-dive rationale for each of the four special-focus areas (concurrency, idempotency,
security, currency precision), plus explicitly stated out-of-scope items (no WAT-midnight
boundary test, no multi-process test, security is a first pass not a pen-test). This file is
that log.

## Notable judgment calls made along the way

- Flagged the NestJS-vs-Express and missing-test-suite discrepancies in the original backend
  instead of silently fixing or ignoring them.
- Chose to actually run the migrated server and fire real HTTP requests (including a 10-way
  concurrency race) rather than relying on a type-check or a clean build as proof the migration
  preserved behavior.
- Removed an unused `ajv` dependency during the test-framework build rather than installing it
  "for parity" with the reference project, once it was clear nothing would actually call it.
- When the user's reference framework and the generic `prompt.md` disagreed on a convention
  (e.g., `Base` class scope, endpoints registry depth, spec file naming), I treated the user's
  explicit, later instruction and the reference project's *actual working code* as the higher
  authority over the generic prompt's aspirational description.
