# api-performance-test

k6 performance tests for the NovaWallet Transfer API (`nova-wallet-api`). Exercises a realistic
mixed workload (wallet creation, credits, reads, transfers) against a real running instance and
reports per-endpoint latency, error rate, and the ₦500,000/day outbound-limit rejection rate as
a separate, non-failing metric.

## Prerequisites

- [k6](https://k6.io) installed locally (`brew install k6`, or run via the official
  `grafana/k6` Docker image — see §Run via Docker below).
- `nova-wallet-api` built and running (`npm run build && npm run start` in `../nova-wallet-api`),
  or point `BASE_URL` at wherever it's actually deployed.

## Quick start

```bash
cd api-performance-test
cp .env.sample .env   # edit if your BASE_URL/API_TOKEN differ from the defaults
npm run smoke         # 1 VU, 30s - sanity check before anything heavier
npm run load          # ramps to a moderate steady VU count
npm run stress        # ramps higher, in stages, to find the breaking point
npm run soak          # sustained moderate load for 30 minutes
```

Each npm script just calls `k6 run -e PROFILE=<name> scenarios/wallet-transfer-flow.js`. Env
vars in a `.env` file are **not** auto-loaded by k6 — either `set -a && source .env && set +a`
first (this k6 build passes real OS env vars through by default), or pass everything explicitly
with repeated `-e` flags:

```bash
k6 run \
  -e PROFILE=load -e VUS=25 -e DURATION=3m \
  -e BASE_URL=http://localhost:3000 -e API_TOKEN=novapay-dev-token \
  scenarios/wallet-transfer-flow.js
```

## The configurable performance parameter: `PROFILE`

The one knob this suite is built around. `PROFILE` selects a complete k6 executor
configuration — virtual users, duration, ramp-up/ramp-down stages — in a single step, so trying
a different load shape is an env var away, not a code edit:

| `PROFILE` | Shape | Default VUs/duration | Use it to... |
|---|---|---|---|
| `smoke` | constant VUs | 1 VU, 30s | Sanity-check a change before running anything heavier |
| `load` | ramp up → hold → ramp down | 10 VUs, 2m hold | Measure steady-state latency at an expected real traffic level |
| `stress` | staged ramp (20% → 50% → 100%) | up to 100 VUs | Find where latency/error-rate starts to break down |
| `soak` | constant VUs, long duration | 10 VUs, 30m | Catch slow leaks/degradation that only show up over time |

`VUS` and `DURATION` override the peak VU count / hold duration for whichever profile is active,
without needing a new profile:

```bash
k6 run -e PROFILE=stress -e VUS=200 -e DURATION=5m scenarios/wallet-transfer-flow.js
```

## All configurable parameters

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Target instance |
| `API_TOKEN` | `novapay-dev-token` | Bearer token sent on every request |
| `PROFILE` | `smoke` | `smoke` \| `load` \| `stress` \| `soak` |
| `VUS` | profile-specific | Overrides peak virtual users |
| `DURATION` | profile-specific | Overrides hold/run duration |
| `WALLET_POOL_SIZE` | `50` | Wallets created once in `setup()` and reused all run — isolates transfer/read throughput from wallet-creation overhead |
| `WALLET_FUNDING_KOBO` | `40000000` | Initial funding per pool wallet (kept under the ₦500,000/day cap) |
| `TRANSFER_AMOUNT_KOBO` | `100` | Amount moved per simulated transfer |
| `CREDIT_AMOUNT_KOBO` | `500000` | Amount added per simulated top-up |
| `THINK_TIME_MS` | `200` | Random 0–N ms pause between a VU's iterations |
| `P95_THRESHOLD_MS` | `500` | Pass/fail latency threshold, per endpoint |
| `ERROR_RATE_THRESHOLD` | `0.01` | Pass/fail threshold on `http_req_failed` (1%) |

## What's actually being simulated

`scenarios/wallet-transfer-flow.js` runs one weighted action per iteration against a shared pool
of pre-funded wallets: **55% transfer, 25% get, 10% credit, 10% create** — representative of a
wallet API's real traffic shape (mostly money movement and balance checks, occasional new
accounts/top-ups). Edit `ACTION_WEIGHTS` at the top of the file directly to model a different
mix; the load shape (`PROFILE`) and the traffic mix are intentionally separate knobs.

A `422` from `/transfers` (daily outbound limit reached) is tracked via a dedicated
`transfer_daily_limit_hits` counter, **not** counted against the error-rate threshold — it's a
correct business-rule rejection once a pool wallet's cumulative daily transfers approach
₦500,000, not a performance failure. Everything else `/transfers` can return (400/401/404/409/5xx)
is still a real failure, since this suite only ever sends requests it expects to succeed. To
actually observe the daily-limit counter firing, shrink the pool
(`-e WALLET_POOL_SIZE=2`) and/or raise the transfer amount so the cap is reached within a run.

## A finding this suite is specifically designed to surface

`nova-wallet-api` documents its own scaling limit: all mutations serialize through a single
in-process mutex, and persistence is a synchronous `fs.writeFileSync` + rename on every write.
Running `stress`/`soak` against it demonstrates this directly — in a local run at 20 concurrent
VUs with no think time, **p95 latency rose to ~170ms across every endpoint, including plain
`GET /wallets/:id` reads**, not just the writes that go through the mutex. That's consistent with
Node's single-threaded event loop being blocked by synchronous disk I/O on every mutation, not
only with lock contention — a slightly stronger and more specific claim than "the mutex is the
bottleneck." If you're using this suite to evaluate a future change to the backend's persistence
layer (e.g. moving off synchronous `fs` calls), `stress`/`soak` p95 broken down by endpoint
(reads vs. writes) is the metric that will show whether that change actually helped.

## Run via Docker (no local k6 install)

```bash
docker run --rm -i -v "$(pwd)":/scripts -w /scripts \
  -e BASE_URL=http://host.docker.internal:3000 -e API_TOKEN=novapay-dev-token -e PROFILE=smoke \
  grafana/k6 run scenarios/wallet-transfer-flow.js
```

(`host.docker.internal` resolves to the host machine from inside the container on macOS/Windows;
on Linux, use `--network host` and `BASE_URL=http://localhost:3000` instead.)

## Reading the output

- `THRESHOLDS` section — pass/fail at a glance, one line per endpoint's p95 plus the global error
  rate.
- `CUSTOM` metrics — per-endpoint latency trends (`wallet_create_duration`,
  `wallet_credit_duration`, `transfer_duration`, `wallet_get_duration`) and the
  `transfer_daily_limit_hits` / `unexpected_errors` counters.
- `HTTP` section, tagged by `endpoint:` — the same latency breakdown via k6's built-in
  `http_req_duration`, useful if you pipe results to `--summary-export=result.json` for
  comparison across runs.
