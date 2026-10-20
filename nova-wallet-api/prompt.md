# Prompt: NovaWallet Transfer API (NestJS + TypeScript)

 Build a small "Transfer API" for a fictional Nigerian digital wallet (NovaWallet). This is a
 take-home reference implementation, not production software — keep it small, but don't cut
 corners on correctness for money movement.

 **Stack: NestJS + TypeScript.** I want Nest specifically, not bare Express


 **Storage:** no database — persist to a single JSON file on disk, read into memory on startup. I
 know this means I'm giving up real ACID transactions, so compensate explicitly: all
 read-modify-write sequences against the in-memory store must be funneled through a single
 serialization point (a mutex/async lock provider, or equivalent) so that two requests can never
 interleave between "read balance" and "write balance." State the concurrency model you chose and
 its failure mode (e.g., "this guarantees atomicity within one Node process; it would not survive
 horizontal scaling without moving the lock to Redis/Postgres advisory locks") rather than
 silently assuming a single process is fine.

 **Endpoints:**
 - `POST /wallets` — create a wallet, balance starts at 0.
 - `POST /wallets/:id/credit` — deposit funds.
 - `POST /transfers` — move funds between two wallets.
 - `GET /wallets/:id` — return balance.

 All amounts are **integers in kobo**, never floats — this is a monetary system, and float drift
 on repeated additions/subtractions is not acceptable. Validate that amounts are positive
 integers at the DTO layer.

 **Idempotency on `POST /transfers`** — require an `Idempotency-Key` header and implement real
 idempotency semantics, not just "ignore duplicate IDs":
 - First request with a given key: process normally, then persist the key alongside a hash of
   the request body and the exact response (status + payload) that was returned.
 - Replay with the same key **and the same body**: return the cached response verbatim, without
   re-executing the transfer. The caller should not be able to tell the difference between the
   original call and the replay except for timing.
 - Replay with the same key **and a different body**: this is a client bug (key reuse across two
   logically different transfers) — reject with `409 Conflict`, don't silently process it as a
   new transfer and don't silently return the old result for a different request.
 - Idempotency-Key storage and the balance mutation it guards must be committed together — if the
   assistant's design can throw after mutating a balance but before recording the key (or vice
   versa), that's a bug, flag it.

 **Concurrency correctness for `POST /transfers`** — a transfer is a classic
 check-then-act race: read balance, check `balance = amount`, then debit. Under concurrent
 requests against the same wallet this race can produce a negative balance if the check and the
 write aren't atomic with respect to each other. I want this demonstrably correct, not just
 "looks fine in manual testing": design it so that N concurrent transfer requests against a
 wallet that can only afford one of them result in exactly one success and N-1 clean
 `422`/`409`-style rejections, with the final balance never going negative. Tell me what
 concurrency primitive enforces this (e.g., a single mutex guarding the whole store, or per-wallet
 locks if you want finer granularity) and why you picked that granularity.

 **Daily outbound transfer limit** — ₦500,000/day per wallet (500,000 × 100 = 50,000,000 kobo),
 enforced on the *sending* wallet only. The reset boundary is **midnight West Africa Time
 (UTC+1, no DST)**, regardless of what timezone the server's host clock or `TZ` env var is set
 to — don't use the server's local midnight or naive UTC midnight. Make the WAT-day computation a
 pure, independently testable function, since getting this wrong silently (e.g. via DST-aware
 libraries that don't realize WAT has none) is the kind of bug that only shows up once a year at a
 timezone boundary.

 **Auth:** a bearer token check in front of every endpoint except a health check. A hardcoded or
 env-configurable token is fine — I'm not asking for OAuth for a take-home, but it should be a
 real `Guard`/middleware, not an inline `if` in each handler.

 **What I don't want:** an ORM, a real database, a message queue, retry/backoff logic for the
 idempotency store, multi-region anything, or speculative abstractions for requirements I haven't
 stated (e.g., don't build multi-currency support — this is NGN/kobo only). Favor a small number
 of well-named files over a deep module hierarchy. If you're tempted to add a feature "for
 robustness" that isn't in this brief, ask me first instead of adding it.

 **Deliverables:** the Nest app, a README covering how to run it and the specific design choices
 above (concurrency primitive, WAT computation, idempotency conflict semantics), and enough
 manual/curl verification that I can see the concurrency guarantee and the idempotency conflict
 actually hold, not just that the happy path returns 200.

---

## Why this prompt is structured this way

- **Stack choice is justified, not asserted.** "Use NestJS" without the DI/Guard/Interceptor
  reasoning reads as cargo-culting a framework name; stating *which Nest primitives map to which
  requirement* signals the prompter already has the solution shape in mind and is using the
  framework choice to get it for free.
- **Idempotency is specified as a state machine** (new key → process; replay+same body → cached
  response; replay+different body → `409`), not as "handle the Idempotency-Key header." Most
  under-specified prompts stop at "support idempotency," which an AI assistant will happily
  satisfy with a naive duplicate-ID check that doesn't actually prevent a double-charge on retry
  with a mutated payload.
- **Concurrency is specified by observable outcome** (N concurrent requests, one winner, balance
  never negative) rather than by naming a mechanism up front — this lets the assistant choose an
  implementation but forces it to justify correctness against a concrete adversarial scenario
  instead of describing coordination it never actually enforces.
- **The WAT reset requirement calls out the specific failure mode** (DST-aware libraries, server
  `TZ` dependence) that a less experienced prompt would omit and that an assistant would get wrong
  by default (most date libraries assume DST exists somewhere nearby).
- **The "what I don't want" section** exists because an unconstrained AI build tends to gold-plate
  — adding retries, queues, or abstractions nobody asked for. Naming the anti-scope up front is as
  important as naming the scope.
