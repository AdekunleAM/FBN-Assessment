import dotenv from 'dotenv';
dotenv.config();

function requiredEnv(name: string, fallback?: string): string {
    const value = process.env[name] ?? fallback;
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const config = {
    API_BASE_URL: requiredEnv('API_BASE_URL', 'http://localhost:3000'),
    API_TOKEN: requiredEnv('API_TOKEN', 'novapay-dev-token'),
    // Must match nova-wallet-api's own DEFAULT_USER_EMAIL/DEFAULT_USER_PASSWORD
    // defaults (see that repo's README) - this is the user seeded on startup
    // and conventionally linked to the static API_TOKEN above.
    DEFAULT_USER_EMAIL: requiredEnv('DEFAULT_USER_EMAIL', 'admin@novapay.dev'),
    DEFAULT_USER_PASSWORD: requiredEnv('DEFAULT_USER_PASSWORD', 'novapay-dev-password'),
};

export default config;
