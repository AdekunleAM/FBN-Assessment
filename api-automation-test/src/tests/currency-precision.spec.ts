import { expect, test } from '@playwright/test';
import config from '../config/config';
import { HttpStatus } from '../enums/enums';
import { generateIdempotencyKey } from '../helper/functions-helper';
import { Base, TransfersService, WalletsService } from '../services';

const headers = { authorization: `Bearer ${config.API_TOKEN}` };

test.describe(
    'Currency Precision Tests @general @currency',
    { annotation: { type: 'Feature', description: 'Kobo is an integer everywhere - explicit precision checks, not "amount looks right"' } },
    () => {
        test('Verify 50 sequential 1-kobo transfers sum to exactly 50 kobo with zero floating-point drift', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);
            const transfersService = new TransfersService(base);

            const startingBalanceKobo = 10_000_000;
            const transferCount = 50;
            const fromWallet = (await walletsService.createWallet({ headers })).body;
            const toWallet = (await walletsService.createWallet({ headers })).body;
            await walletsService.creditWallet({
                pathParams: { id: fromWallet.id },
                body: walletsService.generateCreditBody(startingBalanceKobo),
                headers,
            });

            for (let i = 0; i < transferCount; i++) {
                const response = await transfersService.createTransfer({
                    body: transfersService.generateTransferBody({ fromWalletId: fromWallet.id, toWalletId: toWallet.id, amountKobo: 1 }),
                    headers: { ...headers, 'Idempotency-Key': generateIdempotencyKey(`precision-${i}`) },
                });
                // Hard gate: if any single 1-kobo transfer in the sequence
                // fails, the final sum assertion below is meaningless.
                expect(response.raw.status(), `transfer #${i} must succeed`).toBe(HttpStatus.CREATED);
            }

            const fromAfter = (await walletsService.getWalletById({ pathParams: { id: fromWallet.id }, headers })).body;
            const toAfter = (await walletsService.getWalletById({ pathParams: { id: toWallet.id }, headers })).body;

            await test.step(
                `Verify sender balance is exactly ${startingBalanceKobo - transferCount} kobo (toBe, not toBeCloseTo - any float drift must fail this)`,
                () => {
                    expect.soft(fromAfter.balanceKobo).toBe(startingBalanceKobo - transferCount);
                }
            );

            await test.step(`Verify recipient balance is exactly ${transferCount} kobo`, () => {
                expect.soft(toAfter.balanceKobo).toBe(transferCount);
            });
        });

        test('Verify a non-integer (fractional kobo) amount is rejected, not floored/rounded silently (negative)', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);

            const wallet = (await walletsService.createWallet({ headers })).body;
            const response = await walletsService.creditWallet({
                pathParams: { id: wallet.id },
                body: { amountKobo: 100.5 },
                headers,
            });

            await test.step(`Verify fractional-kobo credit response status code is ${HttpStatus.BAD_REQUEST}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.BAD_REQUEST);
            });

            await test.step('Verify the balance was not partially credited (e.g. floored to 100)', async () => {
                const walletAfter = (await walletsService.getWalletById({ pathParams: { id: wallet.id }, headers })).body;
                expect.soft(walletAfter.balanceKobo).toBe(0);
            });
        });

        test('Verify a stringified number for amountKobo is rejected, not type-coerced (negative)', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);

            const wallet = (await walletsService.createWallet({ headers })).body;
            const response = await walletsService.creditWallet({
                pathParams: { id: wallet.id },
                body: { amountKobo: '100000' as any },
                headers,
            });

            await test.step(`Verify string-amount credit response status code is ${HttpStatus.BAD_REQUEST}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.BAD_REQUEST);
            });
        });

        test('Verify a large integer kobo amount is echoed back with full precision (no 32-bit/float truncation)', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);

            const largeAmountKobo = 2_147_483_647 + 1_000_000; // intentionally past a 32-bit signed int boundary
            const wallet = (await walletsService.createWallet({ headers })).body;
            const response = await walletsService.creditWallet({
                pathParams: { id: wallet.id },
                body: walletsService.generateCreditBody(largeAmountKobo),
                headers,
            });

            await test.step(`Verify credit response status code is ${HttpStatus.OK}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.OK);
            });

            await test.step(`Verify the returned balanceKobo is exactly ${largeAmountKobo}, not truncated or rounded`, () => {
                expect.soft(response.body.balanceKobo).toBe(largeAmountKobo);
            });
        });
    }
);
