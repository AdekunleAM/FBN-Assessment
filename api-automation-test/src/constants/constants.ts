export const Constants = {
    DAILY_OUTBOUND_LIMIT_KOBO: 50_000_000, // ₦500,000/day, enforced on the sending wallet
    DEFAULT_FUNDING_AMOUNT_KOBO: 1_000_000, // ₦10,000 — seed amount reused across tests
    DEFAULT_TRANSFER_AMOUNT_KOBO: 200_000, // ₦2,000
} as const;
