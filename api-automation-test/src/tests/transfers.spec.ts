import { expect, test } from '@playwright/test';
import { Constants } from '../constants/constants';
import config from '../config/config';
import { HttpStatus, ResponseTime } from '../enums/enums';
import { generateIdempotencyKey } from '../helper/functions-helper';
import { Base, TransfersService, WalletsService } from '../services';
import { data } from '../test-data';

const headers = { authorization: `Bearer ${config.API_TOKEN}` };

async function createFundedWallet(walletsService: WalletsService, fundingAmountKobo: number) {
    const wallet = (await walletsService.createWallet({ headers })).body;
    if (fundingAmountKobo > 0) {
        await walletsService.creditWallet({
            pathParams: { id: wallet.id },
            body: walletsService.generateCreditBody(fundingAmountKobo),
            headers,
        });
    }
    return wallet;
}

test.describe(
    'Transfers Service Tests @general @transfers_svc',
    { annotation: { type: 'Service', description: 'Transfers Service' } },
    () => {
        test('Verify a funded wallet can transfer to another wallet and balances update exactly @smoke', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);
            const transfersService = new TransfersService(base);

            const fundingAmountKobo = Constants.DEFAULT_FUNDING_AMOUNT_KOBO;
            const transferAmountKobo = Constants.DEFAULT_TRANSFER_AMOUNT_KOBO;

            const fromWallet = await createFundedWallet(walletsService, fundingAmountKobo);
            const toWallet = await createFundedWallet(walletsService, 0);

            const response = await transfersService.createTransfer({
                body: transfersService.generateTransferBody({
                    fromWalletId: fromWallet.id,
                    toWalletId: toWallet.id,
                    amountKobo: transferAmountKobo,
                }),
                headers: { ...headers, 'Idempotency-Key': generateIdempotencyKey('transfer-happy') },
            });

            await test.step(`Verify transfer response status code is ${HttpStatus.CREATED}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.CREATED);
            });

            await test.step(`Verify transfer response duration ${response.duration}s is under ${ResponseTime.POST}s`, () => {
                expect.soft(response.duration).toBeLessThan(ResponseTime.POST);
            });

            transfersService.verifyTransferIntegrity({
                transfer: response.body,
                expectedAmountKobo: transferAmountKobo,
                fromBalanceBeforeKobo: fundingAmountKobo,
                toBalanceBeforeKobo: 0,
            });
        });

        test('Verify a transfer exceeding the sender balance is rejected with 422 (negative)', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);
            const transfersService = new TransfersService(base);

            const fromWallet = await createFundedWallet(walletsService, 1000);
            const toWallet = await createFundedWallet(walletsService, 0);

            const response = await transfersService.createTransfer({
                body: transfersService.generateTransferBody({
                    fromWalletId: fromWallet.id,
                    toWalletId: toWallet.id,
                    amountKobo: 1_000_000,
                }),
                headers: { ...headers, 'Idempotency-Key': generateIdempotencyKey('transfer-insufficient') },
            });

            await test.step(`Verify insufficient-funds transfer response status code is ${HttpStatus.UNPROCESSABLE_ENTITY}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
            });

            await test.step('Verify neither wallet balance moved', async () => {
                const fromAfter = (await walletsService.getWalletById({ pathParams: { id: fromWallet.id }, headers })).body;
                const toAfter = (await walletsService.getWalletById({ pathParams: { id: toWallet.id }, headers })).body;
                expect.soft(fromAfter.balanceKobo).toBe(1000);
                expect.soft(toAfter.balanceKobo).toBe(0);
            });
        });

        test('Verify a self-transfer (fromWalletId === toWalletId) is rejected with 400 (negative)', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);
            const transfersService = new TransfersService(base);

            const wallet = await createFundedWallet(walletsService, 1000);

            const response = await transfersService.createTransfer({
                body: transfersService.generateTransferBody({ fromWalletId: wallet.id, toWalletId: wallet.id, amountKobo: 100 }),
                headers: { ...headers, 'Idempotency-Key': generateIdempotencyKey('transfer-self') },
            });

            await test.step(`Verify self-transfer response status code is ${HttpStatus.BAD_REQUEST}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.BAD_REQUEST);
            });
        });

        test('Verify a transfer referencing a non-existent wallet is rejected with 404 (negative)', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);
            const transfersService = new TransfersService(base);

            const fromWallet = await createFundedWallet(walletsService, 1000);

            const response = await transfersService.createTransfer({
                body: transfersService.generateTransferBody({
                    fromWalletId: fromWallet.id,
                    toWalletId: data.nonExistentWalletId,
                    amountKobo: 100,
                }),
                headers: { ...headers, 'Idempotency-Key': generateIdempotencyKey('transfer-missing-wallet') },
            });

            await test.step(`Verify transfer-to-nonexistent-wallet response status code is ${HttpStatus.NOT_FOUND}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.NOT_FOUND);
            });
        });

        test('Verify a transfer without an Idempotency-Key header is rejected with 400 (negative)', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);
            const transfersService = new TransfersService(base);

            const fromWallet = await createFundedWallet(walletsService, 1000);
            const toWallet = await createFundedWallet(walletsService, 0);

            const response = await transfersService.createTransfer({
                body: transfersService.generateTransferBody({ fromWalletId: fromWallet.id, toWalletId: toWallet.id, amountKobo: 100 }),
                headers, // deliberately no Idempotency-Key
            });

            await test.step(`Verify missing-Idempotency-Key response status code is ${HttpStatus.BAD_REQUEST}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.BAD_REQUEST);
            });
        });

        test('Verify an invalid amountKobo on a transfer is rejected with 400 (negative)', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);
            const transfersService = new TransfersService(base);

            const fromWallet = await createFundedWallet(walletsService, 1000);
            const toWallet = await createFundedWallet(walletsService, 0);

            const response = await transfersService.createTransfer({
                body: { fromWalletId: fromWallet.id, toWalletId: toWallet.id, amountKobo: -50 as any },
                headers: { ...headers, 'Idempotency-Key': generateIdempotencyKey('transfer-bad-amount') },
            });

            await test.step(`Verify invalid-amount transfer response status code is ${HttpStatus.BAD_REQUEST}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.BAD_REQUEST);
            });
        });

        test('Verify the ₦500,000/day outbound limit is enforced with 422 (negative)', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);
            const transfersService = new TransfersService(base);

            const dailyLimitKobo = Constants.DAILY_OUTBOUND_LIMIT_KOBO;
            const fromWallet = await createFundedWallet(walletsService, dailyLimitKobo + 1_000_000);
            const toWallet = await createFundedWallet(walletsService, 0);

            const response = await transfersService.createTransfer({
                body: transfersService.generateTransferBody({
                    fromWalletId: fromWallet.id,
                    toWalletId: toWallet.id,
                    amountKobo: dailyLimitKobo + 1,
                }),
                headers: { ...headers, 'Idempotency-Key': generateIdempotencyKey('transfer-daily-limit') },
            });

            await test.step(`Verify daily-limit-exceeded response status code is ${HttpStatus.UNPROCESSABLE_ENTITY}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
            });
        });

        test('Verify transfers without auth are rejected with 401 (negative)', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const transfersService = new TransfersService(base);

            const response = await transfersService.createTransfer({
                body: { fromWalletId: data.nonExistentWalletId, toWalletId: data.nonExistentWalletId, amountKobo: 100 },
                headers: { 'Idempotency-Key': generateIdempotencyKey('transfer-no-auth') },
            });

            await test.step(`Verify unauthenticated transfer response status code is ${HttpStatus.UNAUTHORIZED}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
            });
        });
    }
);
