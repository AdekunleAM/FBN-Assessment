export const generateRandomNumber = (limit: number, start: number = 0) => {
    if (start >= limit) {
        throw new Error(`Starting number ${start} should not be greater than limit ${limit}`);
    }
    return Math.floor(Math.random() * (limit - start + 1) + start);
};

export const generateRandomString = (length: number = 8): string => {
    return Math.random().toString(36).slice(2, 2 + length);
};

export const generateIdempotencyKey = (prefix: string = 'test'): string => {
    return `${prefix}-${Date.now()}-${generateRandomString(6)}`;
};

// Plus-addressing style unique email per run - signup rejects a reused
// email with 409, so every signup test needs a fresh one.
export const generateUniqueEmail = (prefix: string = 'test'): string => {
    return `${prefix}.${Date.now()}.${generateRandomString(6)}@example.com`.toLowerCase();
};
