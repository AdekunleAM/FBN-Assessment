import { expect, test } from '@playwright/test';
import config from '../config/config';
import { HttpStatus, ResponseTime } from '../enums/enums';
import { HealthService } from '../services';

test.describe(
    'Health Service Tests @general @health_svc',
    { annotation: { type: 'Service', description: 'Health Service' } },
    () => {
        test('Verify the health endpoint returns 200 ok with no auth required @smoke', async ({ request }) => {
            const healthService = new HealthService(request);

            const response = await healthService.getHealth();

            await test.step(`Verify health response status code is ${HttpStatus.OK}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.OK);
            });

            await test.step('Verify health response body is { status: "ok" }', () => {
                expect.soft(response.body.status).toBe('ok');
            });

            await test.step(`Verify health response duration ${response.duration}s is under ${ResponseTime.GET}s`, () => {
                expect.soft(response.duration).toBeLessThan(ResponseTime.GET);
            });
        });

        test('Verify an unsupported method on the health route is rejected (negative)', async ({ request }) => {
            // /health only maps GET; POST should fall through to "no route
            // matched" rather than silently being accepted.
            const response = await request.post(`${config.API_BASE_URL}/health`);

            await test.step(`Verify POST /health response status code is ${HttpStatus.NOT_FOUND}`, () => {
                expect.soft(response.status()).toBe(HttpStatus.NOT_FOUND);
            });
        });
    }
);
