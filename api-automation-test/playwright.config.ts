import { defineConfig } from '@playwright/test';
import config from './src/config/config';

export default defineConfig({
    testDir: './src/tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    timeout: 30_000,
    reporter: [['list'], ['html', { open: 'never' }], ['./src/reporter/summary-reporter.ts']],
    use: {
        baseURL: config.API_BASE_URL,
        trace: 'on-first-retry',
    },
    projects: [{ name: 'api' }],
    // Boots nova-wallet-api itself so a plain local `npm test` is
    // self-sufficient. reuseExistingServer is unconditionally true so this
    // never fights the explicit build/start/health-check steps the CI
    // workflow runs itself before this suite starts - Playwright checks the
    // health URL first and only spawns its own copy if nothing answered.
    webServer: {
        command: 'npm run build --prefix ../nova-wallet-api && npm run start --prefix ../nova-wallet-api',
        url: `${config.API_BASE_URL}/health`,
        reuseExistingServer: true,
        timeout: 60_000,
    },
});
