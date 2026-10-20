export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const API_TOKEN = __ENV.API_TOKEN || 'novapay-dev-token';

export const WALLET_POOL_SIZE = Number(__ENV.WALLET_POOL_SIZE || 50);
// Stays comfortably under the ₦500,000/day (50,000,000 kobo) outbound limit
// per pool wallet, so the daily cap isn't hit immediately on every run.
export const WALLET_FUNDING_KOBO = Number(__ENV.WALLET_FUNDING_KOBO || 40_000_000);
export const TRANSFER_AMOUNT_KOBO = Number(__ENV.TRANSFER_AMOUNT_KOBO || 100);
export const CREDIT_AMOUNT_KOBO = Number(__ENV.CREDIT_AMOUNT_KOBO || 500_000);

export const THINK_TIME_MS = Number(__ENV.THINK_TIME_MS || 200);

export const P95_THRESHOLD_MS = Number(__ENV.P95_THRESHOLD_MS || 500);
export const ERROR_RATE_THRESHOLD = Number(__ENV.ERROR_RATE_THRESHOLD || 0.01);

// The one load-shape knob this suite is built around: PROFILE selects a full
// k6 executor config (VUs/duration/ramp stages) in a single step, so trying a
// different load shape is one env var away, not a code change. VUS/DURATION
// further tune whichever profile is selected without editing this file.
const VUS = Number(__ENV.VUS || 0) || undefined;
const DURATION = __ENV.DURATION;

const PROFILES = {
    smoke: {
        executor: 'constant-vus',
        vus: VUS || 1,
        duration: DURATION || '30s',
    },
    load: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: [
            { duration: '30s', target: VUS || 10 },
            { duration: DURATION || '2m', target: VUS || 10 },
            { duration: '30s', target: 0 },
        ],
    },
    stress: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: [
            { duration: '30s', target: Math.round((VUS || 100) * 0.2) },
            { duration: '1m', target: Math.round((VUS || 100) * 0.5) },
            { duration: DURATION || '2m', target: VUS || 100 },
            { duration: '30s', target: 0 },
        ],
    },
    soak: {
        executor: 'constant-vus',
        vus: VUS || 10,
        duration: DURATION || '30m',
    },
};

export const AVAILABLE_PROFILES = Object.keys(PROFILES);
export const PROFILE = __ENV.PROFILE || 'smoke';

export function resolveExecutorConfig() {
    const profile = PROFILES[PROFILE];
    if (!profile) {
        throw new Error(`Unknown PROFILE "${PROFILE}" - expected one of: ${AVAILABLE_PROFILES.join(', ')}`);
    }
    return profile;
}
