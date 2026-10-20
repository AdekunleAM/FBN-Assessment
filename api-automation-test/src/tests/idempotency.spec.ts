import { expect, test } from '@playwright/test';
import { Constants } from '../constants/constants';
import config from '../config/config';
import { HttpStatus } from '../enums/enums';
import { generateIdempotencyKey } from '../helper/functions-helper';
import { Base, TransfersService, WalletsService } from '../services';

const headers = { authorization: `Bearer ${config.API_TOKEN}` };

test.describe(
    'Transfers Idempotency Tests @general @transfers_svc @idempotency',
    { annotation: { type: 'Feature', description: 'Idempotency-Key semantics on POST /transfers' } },
    () => {
        test('Verify replaying the same Idempotency-Key with the same payload returns the cached response without moving money twice', async ({
            request,
        }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);
            const transfersService = new TransfersService(base);

            const fundingAmountKobo = Constants.DEFAULT_FUNDING_AMOUNT_KOBO;
            const transferAmountKobo = Constants.DEFAULT_TRANSFER_AMOUNT_KOBO;

            const fromWallet = (await walletsService.createWallet({ headers })).body;
            const toWallet = (await walletsService.createWallet({ headers })).body;
            await walletsService.creditWallet({
                pathParams: { id: fromWallet.id },
                body: walletsService.generateCreditBody(fundingAmountKobo),
                headers,
            });

            const idempotencyKey = generateIdempotencyKey('replay-same');
            const transferBody = transfersService.generateTransferBody({
                fromWalletId: fromWallet.id,
                toWalletId: toWallet.id,
                amountKobo: transferAmountKobo,
            });

            const firstResponse = await transfersService.createTransfer({
                body: transferBody,
                headers: { ...headers, 'Idempotency-Key': idempotencyKey },
            });
            const replayResponse = await transfersService.createTransfer({
                body: transferBody,
                headers: { ...headers, 'Idempotency-Key': idempotencyKey },
            });

            await test.step(`Verify both responses have status code ${HttpStatus.CREATED}`, () => {
                expect.soft(firstResponse.raw.status()).toBe(HttpStatus.CREATED);
                expect.soft(replayResponse.raw.status()).toBe(HttpStatus.CREATED);
            });

            await test.step('Verify the replay returns the exact same transferId and body as the original', () => {
                expect.soft(replayResponse.body).toEqual(firstResponse.body);
            });

            await test.step('Verify money moved exactly once, not twice', async () => {
                const fromAfter = (await walletsService.getWalletById({ pathParams: { id: fromWallet.id }, headers })).body;
                const toAfter = (await walletsService.getWalletById({ pathParams: { id: toWallet.id }, headers })).body;
                expect.soft(fromAfter.balanceKobo).toBe(fundingAmountKobo - transferAmountKobo);
                expect.soft(toAfter.balanceKobo).toBe(transferAmountKobo);
            });
        });

        test('Verify replaying the same Idempotency-Key with a different payload is rejected with 409 and does not reprocess', async ({
            request,
        }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);
            const transfersService = new TransfersService(base);

            const fundingAmountKobo = Constants.DEFAULT_FUNDING_AMOUNT_KOBO;
            const fromWallet = (await walletsService.createWallet({ headers })).body;
            const toWallet = (await walletsService.createWallet({ headers })).body;
            const otherWallet = (await walletsService.createWallet({ headers })).body;
            await walletsService.creditWallet({
                pathParams: { id: fromWallet.id },
                body: walletsService.generateCreditBody(fundingAmountKobo),
                headers,
            });

            const idempotencyKey = generateIdempotencyKey('replay-conflict');
            const originalAmount = 200_000;
            const originalResponse = await transfersService.createTransfer({
                body: transfersService.generateTransferBody({
                    fromWalletId: fromWallet.id,
                    toWalletId: toWallet.id,
                    amountKobo: originalAmount,
                }),
                headers: { ...headers, 'Idempotency-Key': idempotencyKey },
            });

            // Hard gate: the conflict assertion below is meaningless if the
            // original transfer this key is attached to never actually succeeded.
            expect(originalResponse.raw.status()).toBe(HttpStatus.CREATED);

            const conflictResponse = await transfersService.createTransfer({
                body: transfersService.generateTransferBody({
                    fromWalletId: fromWallet.id,
                    toWalletId: otherWallet.id,
                    amountKobo: 999,
                }),
                headers: { ...headers, 'Idempotency-Key': idempotencyKey },
            });

            await test.step(`Verify the conflicting replay response status code is ${HttpStatus.CONFLICT}`, () => {
                expect.soft(conflictResponse.raw.status()).toBe(HttpStatus.CONFLICT);
            });

            await test.step('Verify the conflicting payload was never applied: balances only reflect the original transfer', async () => {
                const fromAfter = (await walletsService.getWalletById({ pathParams: { id: fromWallet.id }, headers })).body;
                const toAfter = (await walletsService.getWalletById({ pathParams: { id: toWallet.id }, headers })).body;
                const otherAfter = (await walletsService.getWalletById({ pathParams: { id: otherWallet.id }, headers })).body;
                expect.soft(fromAfter.balanceKobo).toBe(fundingAmountKobo - originalAmount);
                expect.soft(toAfter.balanceKobo).toBe(originalAmount);
                expect
                    .soft(otherAfter.balanceKobo, 'the conflicting request must never have moved money to the other wallet')
                    .toBe(0);
            });
        });
    }
);
