import { expect, test } from '@playwright/test';
import config from '../config/config';
import { HttpStatus } from '../enums/enums';
import { generateIdempotencyKey } from '../helper/functions-helper';
import { Base, TransfersService, WalletsService } from '../services';

const headers = { authorization: `Bearer ${config.API_TOKEN}` };
const CONCURRENT_REQUEST_COUNT = 10;

test.describe(
    'Transfers Concurrency Tests @general @transfers_svc @concurrency',
    { annotation: { type: 'Feature', description: 'Concurrency safety of POST /transfers against a single wallet' } },
    () => {
        test('Verify firing 10 concurrent transfers against a wallet that can only afford one results in exactly one success, no double-spend, and a balance that never goes negative', async ({
            request,
        }, testInfo) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);
            const transfersService = new TransfersService(base);

            const affordableAmountKobo = 100_000;
            const fromWallet = (await walletsService.createWallet({ headers })).body;
            const toWallet = (await walletsService.createWallet({ headers })).body;
            await walletsService.creditWallet({
                pathParams: { id: fromWallet.id },
                body: walletsService.generateCreditBody(affordableAmountKobo),
                headers,
            });

            const requests = Array.from({ length: CONCURRENT_REQUEST_COUNT }, (_, i) =>
                transfersService.createTransfer({
                    body: transfersService.generateTransferBody({
                        fromWalletId: fromWallet.id,
                        toWalletId: toWallet.id,
                        amountKobo: affordableAmountKobo,
                    }),
                    headers: { ...headers, 'Idempotency-Key': generateIdempotencyKey(`race-${i}`) },
                })
            );

            const responses = await Promise.all(requests);
            const statusCodes = responses.map((r) => r.raw.status());
            const successCount = statusCodes.filter((s) => s === HttpStatus.CREATED).length;
            const rejectedCount = statusCodes.filter((s) => s === HttpStatus.UNPROCESSABLE_ENTITY).length;

            // Ground truth read back from the server after the race settles -
            // not an in-memory tally of what this test thinks it sent.
            const fromWalletAfter = (await walletsService.getWalletById({ pathParams: { id: fromWallet.id }, headers })).body;
            const toWalletAfter = (await walletsService.getWalletById({ pathParams: { id: toWallet.id }, headers })).body;

            // Evidence, not assertion: attach the raw per-request outcome and
            // the final balances to the HTML report so the race result is
            // independently verifiable, not just claimed by this test's pass/fail.
            await testInfo.attach('concurrency-evidence.json', {
                body: JSON.stringify(
                    {
                        requestCount: CONCURRENT_REQUEST_COUNT,
                        amountPerRequestKobo: affordableAmountKobo,
                        statusCodes,
                        successCount,
                        rejectedCount,
                        responseBodies: responses.map((r) => r.body),
                        fromWalletBalanceAfterKobo: fromWalletAfter.balanceKobo,
                        toWalletBalanceAfterKobo: toWalletAfter.balanceKobo,
                    },
                    null,
                    2
                ),
                contentType: 'application/json',
            });

            await test.step('Verify exactly one of the 10 concurrent requests succeeded', () => {
                expect.soft(successCount, `status codes were: ${JSON.stringify(statusCodes)}`).toBe(1);
            });

            await test.step('Verify the other 9 requests were cleanly rejected as insufficient funds', () => {
                expect.soft(rejectedCount, `status codes were: ${JSON.stringify(statusCodes)}`).toBe(CONCURRENT_REQUEST_COUNT - 1);
            });

            await test.step('Verify the sender balance never went negative and reflects exactly one transfer (no double-spend)', () => {
                expect.soft(fromWalletAfter.balanceKobo).toBeGreaterThanOrEqual(0);
                expect.soft(fromWalletAfter.balanceKobo).toBe(0);
            });

            await test.step('Verify the recipient received exactly one transfer worth of funds, not ten', () => {
                expect.soft(toWalletAfter.balanceKobo).toBe(affordableAmountKobo);
            });
        });
    }
);
