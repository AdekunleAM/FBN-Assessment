# Bug Report: WAL_001

| Field | Value |
|---|---|
| **bugId** | WAL_001 |
| **feature** | Wallet Creation |
| **Platform** | API |
| **Type** | Functional (API Bug) |
| **Severity** | Medium |
| **Status** | Open |
| **Date found** | 2026-10-20 |
| **Found by** | Automated test — `api-automation-test/src/tests/wallets.spec.ts` |
| **Endpoint** | `POST /wallets` |
| **Environment** | `nova-wallet-api`, local (`http://localhost:3000`) |

## Description

`POST /wallets` has no constraint limiting how many wallets a single authenticated user may
create. A user can sign up, log in to obtain a JWT, create one wallet, and then create a second
(or any further number of) wallets using that exact same identity/token — every request succeeds
with `201 Created` and a brand-new, independent wallet. There is no `409 Conflict` or any other
rejection when a user who already owns a wallet attempts to create another.

## Expected vs. Actual Outcome

| Scenario | Expected | Actual |
|---|---|---|
| First `POST /wallets` by a given authenticated user | `201 Created` | `201 Created` ✅ |
| Second `POST /wallets` by the *same* authenticated user | `409 Conflict` with a non-empty, human-readable `error` message | `201 Created` — a second, independent wallet is created; no `error` field present (request succeeded) |

## Steps to Reproduce

1. `POST /auth/signup` with a unique email/fullName/password to create a new user.
2. `POST /auth/login` with that same email/password to obtain a JWT.
3. `POST /wallets` with `Authorization: Bearer <that JWT>` — observe `201 Created` (correct, this
   is the user's first wallet).
4. Repeat step 3 immediately, with the **exact same** bearer token.
5. Observe the response status code and body.

**Expected:** Step 5 returns `409 Conflict` with a non-empty `error` field explaining that the
user already has a wallet.

**Actual:** Step 5 returns `201 Created` — a second wallet is created, with no `error` field at
all (the request succeeded, so there is nothing to report).

## Additional Observations

- The response to the second request is well-formed (no crash, no `500`) — the gap is that the
  one-wallet-per-user business rule does not appear to be implemented at all, not that it's
  implemented incorrectly.
- This is consistent with a previously-documented characteristic of this API: wallets are not
  scoped to a user identity anywhere else either (see the "no per-wallet ownership" finding in
  `api-automation-test/src/tests/security.spec.ts`). That finding was reported as an accepted
  characteristic of the design at the time, since the API had no user accounts at all when it
  was written. This report specifically concerns the newer expectation — now that real user
  accounts exist via `/auth/signup` — that each user should be limited to a single wallet.
- Automated regression coverage for this bug already exists and is currently failing by design:
  `api-automation-test/src/tests/wallets.spec.ts`, test **"Verify a user can only create a single
  wallet - a second attempt is rejected with a graceful, valid error message (negative)"**.

## Evidence

```
Command: npx playwright test --project=api --grep "single wallet"
Verify a second wallet creation by the same user is rejected with 409, not another 201
  Expected: 409
  Received: 201

Verify the rejection is graceful: never a server error, and always a valid, human-readable error message
  response must include a string error message
    Expected: "string"
    Received: "undefined"
  error message must not be empty
    Expected: > 0
    Received: 0
```
