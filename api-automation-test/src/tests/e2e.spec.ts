import { expect, test } from '@playwright/test';
import { Constants } from '../constants/constants';
import config from '../config/config';
import { HttpStatus } from '../enums/enums';
import { Base, TransfersService, WalletsService } from '../services';

const headers = { authorization: `Bearer ${config.API_TOKEN}` };

test.describe('Fund And Transfer Flow @general @e2e @fund_transfer', () => {
    test('Verify a wallet can be created, funded, and transfer funds to a second wallet, with the journey staying idempotent on replay end-to-end', async ({
        request,
    }) => {
        const base = new Base({ test, expect, request });
        const walletsService = new WalletsService(base);
        const transfersService = new TransfersService(base);

        const fundingAmountKobo = Constants.DEFAULT_FUNDING_AMOUNT_KOBO;
        const transferAmountKobo = Constants.DEFAULT_TRANSFER_AMOUNT_KOBO;

        let flow: Awaited<ReturnType<TransfersService['setupFundedTransfer']>>;
        await test.step('Create two wallets, fund the sender, and execute one transfer between them', async () => {
            flow = await transfersService.setupFundedTransfer({
                walletsService,
                headers,
                fundingAmountKobo,
                transferAmountKobo,
            });
            // Hard gate: nothing downstream makes sense without a real transfer.
            expect(flow.transfer.transferId).toBeDefined();
        });

        await test.step('Verify both wallets now reflect the exact post-transfer balances', async () => {
            const fromWallet = (await walletsService.getWalletById({ pathParams: { id: flow.fromWalletId }, headers })).body;
            const toWallet = (await walletsService.getWalletById({ pathParams: { id: flow.toWalletId }, headers })).body;
            walletsService.verifyWalletShape({ wallet: fromWallet, expectedBalanceKobo: fundingAmountKobo - transferAmountKobo });
            walletsService.verifyWalletShape({ wallet: toWallet, expectedBalanceKobo: transferAmountKobo });
        });

        await test.step('Verify replaying the same transfer journey Idempotency-Key end-to-end still returns the cached result and does not move money again', async () => {
            const replay = await transfersService.createTransfer({
                body: transfersService.generateTransferBody({
                    fromWalletId: flow.fromWalletId,
                    toWalletId: flow.toWalletId,
                    amountKobo: transferAmountKobo,
                }),
                headers: { ...headers, 'Idempotency-Key': flow.idempotencyKey },
            });
            expect.soft(replay.raw.status()).toBe(HttpStatus.CREATED);
            expect.soft(replay.body).toEqual(flow.transfer);

            const fromWalletAfterReplay = (await walletsService.getWalletById({ pathParams: { id: flow.fromWalletId }, headers })).body;
            expect.soft(fromWalletAfterReplay.balanceKobo).toBe(fundingAmountKobo - transferAmountKobo);
        });
    });
});
