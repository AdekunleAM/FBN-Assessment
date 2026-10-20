import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import {
    CREDIT_AMOUNT_KOBO,
    ERROR_RATE_THRESHOLD,
    P95_THRESHOLD_MS,
    PROFILE,
    THINK_TIME_MS,
    TRANSFER_AMOUNT_KOBO,
    WALLET_FUNDING_KOBO,
    WALLET_POOL_SIZE,
    resolveExecutorConfig,
} from '../src/config.js';
import { generateIdempotencyKey, randomDistinctPair, randomItem } from '../src/helpers.js';
import { authHeaders, url } from '../src/http-client.js';

// The daily outbound limit (422) is a documented business rule, not a server
// error - without this, k6's default http_req_failed classification (any
// status >= 400) would count a healthy, correctly-enforced 422 as a
// performance failure. 400/401/404/409/5xx remain real failures everywhere,
// since this suite only ever sends requests it expects to succeed.
http.setResponseCallback(http.expectedStatuses(200, 201, 422));

const dailyLimitHits = new Counter('transfer_daily_limit_hits');
const unexpectedErrors = new Counter('unexpected_errors');
const walletCreateDuration = new Trend('wallet_create_duration', true);
const walletCreditDuration = new Trend('wallet_credit_duration', true);
const transferDuration = new Trend('transfer_duration', true);
const walletGetDuration = new Trend('wallet_get_duration', true);

export const options = {
    scenarios: {
        [PROFILE]: {
            ...resolveExecutorConfig(),
            exec: 'default',
        },
    },
    thresholds: {
        http_req_failed: [`rate<${ERROR_RATE_THRESHOLD}`],
        'http_req_duration{endpoint:createWallet}': [`p(95)<${P95_THRESHOLD_MS}`],
        'http_req_duration{endpoint:creditWallet}': [`p(95)<${P95_THRESHOLD_MS}`],
        'http_req_duration{endpoint:createTransfer}': [`p(95)<${P95_THRESHOLD_MS}`],
        'http_req_duration{endpoint:getWallet}': [`p(95)<${P95_THRESHOLD_MS}`],
    },
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// Runs once, outside of VUs, before load starts: builds a shared pool of
// pre-funded wallets so the load itself measures transfer/read/credit
// throughput, not wallet-creation overhead repeated on every iteration.
export function setup() {
    const walletIds = [];
    for (let i = 0; i < WALLET_POOL_SIZE; i++) {
        const createRes = http.post(url('/wallets'), null, { ...authHeaders(), tags: { endpoint: 'createWallet' } });
        if (createRes.status !== 201) {
            throw new Error(`setup: failed to create pool wallet #${i}: ${createRes.status} ${createRes.body}`);
        }
        const wallet = createRes.json();
        const creditRes = http.post(
            url(`/wallets/${wallet.id}/credit`),
            JSON.stringify({ amountKobo: WALLET_FUNDING_KOBO }),
            { ...authHeaders(), tags: { endpoint: 'creditWallet' } }
        );
        if (creditRes.status !== 200) {
            throw new Error(`setup: failed to fund pool wallet #${i}: ${creditRes.status} ${creditRes.body}`);
        }
        walletIds.push(wallet.id);
    }
    return { walletIds };
}

// Weighted action mix per iteration, representative of real traffic (mostly
// transfers and reads, occasional new-wallet/credit activity). Edit these
// weights directly to model a different traffic shape - the load shape
// itself (VUs/duration/ramp) stays configurable via PROFILE/VUS/DURATION.
const ACTION_WEIGHTS = [
    { action: 'transfer', weight: 55 },
    { action: 'getWallet', weight: 25 },
    { action: 'creditWallet', weight: 10 },
    { action: 'createWallet', weight: 10 },
];
const TOTAL_WEIGHT = ACTION_WEIGHTS.reduce((sum, a) => sum + a.weight, 0);

function pickAction() {
    let roll = Math.random() * TOTAL_WEIGHT;
    for (const { action, weight } of ACTION_WEIGHTS) {
        roll -= weight;
        if (roll <= 0) return action;
    }
    return ACTION_WEIGHTS[0].action;
}

export default function (data) {
    const { walletIds } = data;
    const action = pickAction();

    if (action === 'createWallet') {
        const res = http.post(url('/wallets'), null, { ...authHeaders(), tags: { endpoint: 'createWallet' } });
        walletCreateDuration.add(res.timings.duration);
        const ok = check(res, { 'createWallet: status is 201': (r) => r.status === 201 });
        if (!ok) unexpectedErrors.add(1);
    } else if (action === 'getWallet') {
        const id = randomItem(walletIds);
        const res = http.get(url(`/wallets/${id}`), { ...authHeaders(), tags: { endpoint: 'getWallet' } });
        walletGetDuration.add(res.timings.duration);
        const ok = check(res, { 'getWallet: status is 200': (r) => r.status === 200 });
        if (!ok) unexpectedErrors.add(1);
    } else if (action === 'creditWallet') {
        const id = randomItem(walletIds);
        const res = http.post(
            url(`/wallets/${id}/credit`),
            JSON.stringify({ amountKobo: CREDIT_AMOUNT_KOBO }),
            { ...authHeaders(), tags: { endpoint: 'creditWallet' } }
        );
        walletCreditDuration.add(res.timings.duration);
        const ok = check(res, { 'creditWallet: status is 200': (r) => r.status === 200 });
        if (!ok) unexpectedErrors.add(1);
    } else if (action === 'transfer') {
        const [fromId, toId] = randomDistinctPair(walletIds);
        const res = http.post(
            url('/transfers'),
            JSON.stringify({ fromWalletId: fromId, toWalletId: toId, amountKobo: TRANSFER_AMOUNT_KOBO }),
            {
                ...authHeaders({ 'Idempotency-Key': generateIdempotencyKey() }),
                tags: { endpoint: 'createTransfer' },
            }
        );
        transferDuration.add(res.timings.duration);

        if (res.status === 422) {
            // A pool wallet's daily outbound total reached the ₦500,000 cap -
            // a correct business-rule rejection, not a performance failure.
            dailyLimitHits.add(1);
        } else {
            const ok = check(res, { 'transfer: status is 201': (r) => r.status === 201 });
            if (!ok) unexpectedErrors.add(1);
        }
    }

    sleep(Math.random() * (THINK_TIME_MS / 1000));
}

export function teardown(data) {
    console.log(`Load profile "${PROFILE}" complete. Wallet pool size: ${data.walletIds.length}.`);
}
