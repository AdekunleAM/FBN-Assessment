# Bug Report: US_001

| Field | Value |
|---|---|
| **bugId** | US_001 |
| **feature** | User Signup |
| **Platform** | API |
| **Type** | Functional (API Bug) |
| **Severity** | Medium |
| **Status** | Open |
| **Date found** | 2026-10-20 |
| **Found by** | Automated test — `api-automation-test/src/tests/auth.spec.ts` |
| **Endpoint** | `POST /auth/signup` |
| **Environment** | `nova-wallet-api`, local (`http://localhost:3000`) |

## Description

`POST /auth/signup` only enforces a minimum password length of 8 characters
(`SignUpDto.password` via `@MinLength(8)`). It does **not** enforce the expected complexity rule
that a password must contain at least one number and at least one special character. A password
that satisfies the length minimum but is missing one or both of those character classes is still
accepted, and a new account is created.

The exact failure mode for these inputs was also **inconsistent across two separate test runs
against the same code**: in one run (immediately following a fresh server build/start) all three
weak-password cases returned `500 Internal Server Error`; in a later run against a longer-running
instance of the same, unmodified code, the identical three inputs instead returned `201 Created`.
Neither result is correct, but the inconsistency itself is worth flagging as a second, related
concern layered on top of the missing validation.

## Expected vs. Actual Outcome

| Password tried | Missing | Expected | Actual |
|---|---|---|---|
| `noNumberOrSpecial` | a number and a special character | `400 Bad Request` | `201 Created` (latest run) / `500 Internal Server Error` (earlier run) |
| `hasNumber1only` | a special character | `400 Bad Request` | `201 Created` (latest run) / `500 Internal Server Error` (earlier run) |
| `has!SpecialOnly` | a number | `400 Bad Request` | `201 Created` (latest run) / `500 Internal Server Error` (earlier run) |

## Steps to Reproduce

1. `POST /auth/signup` with a unique email, any `fullName`, and `password: "noNumberOrSpecial"`
   (18 characters, letters only — passes the existing 8-character minimum, but has no digit and
   no special character).
2. Observe the response status code and body.
3. Repeat with `password: "hasNumber1only"` (has a digit, no special character) and a new unique
   email.
4. Repeat with `password: "has!SpecialOnly"` (has a special character, no digit) and a new
   unique email.

**Expected:** All three requests are rejected with `400 Bad Request` and a descriptive validation
error, e.g. `{"error": "password must contain at least one number and one special character"}`.

**Actual:** All three requests succeeded with `201 Created` (account created, full user object
returned) in the most recent test run. In an earlier run immediately following a fresh
build/start, the identical three inputs instead returned `500 Internal Server Error`.

## Additional Observations

- The existing 8-character minimum length rule (`@MinLength(8)`) **is** correctly enforced and is
  not in question here — this report is specifically about the missing number + special-character
  complexity rule.
- The `201`/`500` inconsistency for identical input across two runs of the same unmodified code
  suggests there may be more than one contributing cause. This report is sourced entirely from
  black-box API test evidence — the server's internals/logs were intentionally left uninspected
  per the task's explicit "do not modify or investigate the API" instruction, so root-causing the
  `500` is left to whoever picks this up.
- Automated regression coverage for this bug already exists and is currently failing by design:
  `api-automation-test/src/tests/auth.spec.ts`, test group **"Sign Up"**, the three parameterized
  cases driven by `passwordsMissingComplexity`.

## Evidence (latest run)

```
Command: npx playwright test --project=api --grep "missing"
Verify password "noNumberOrSpecial" (missing a number and a special character) response status code is 400
  Expected: 400
  Received: 201

Verify password "hasNumber1only" (missing a special character) response status code is 400
  Expected: 400
  Received: 201

Verify password "has!SpecialOnly" (missing a number) response status code is 400
  Expected: 400
  Received: 201
```
