import { APIRequestContext, Expect } from '@playwright/test';
import endpoints from '../api-endpoints/endpoints.json';
import { generateIdempotencyKey } from '../helper/functions-helper';
import { sendRequest } from '../helper/request-helper';
import { CreateTransferArgs, SetupFundedTransferArgs, Test, VerifyTransferIntegrityArgs } from '../types';
import { Base } from './base';

export class TransfersService {
    readonly request: APIRequestContext;
    readonly test: Test;
    readonly expect: Expect;
    readonly base: Base;

    constructor(base: Base) {
        this.base = base;
        this.request = base.request;
        this.test = base.test;
        this.expect = base.expect;
    }

    /** POST /transfers */
    async createTransfer(args: CreateTransferArgs) {
        const { body, headers, query, pathParams } = args;
        const response = await sendRequest(this.request, {
            method: 'post',
            url: endpoints.transfersService.createTransfer.url,
            body,
            headers,
            query,
            pathParams,
        });
        return response;
    }

    generateTransferBody(args: { fromWalletId: string; toWalletId: string; amountKobo: number }) {
        return { ...args };
    }

    /**
     * Domain-specific, multi-field validation that the transfer response and
     * the resulting balances are exact-integer kobo with no floating-point
     * drift. Must NOT be re-wrapped in another test.step by the caller.
     */
    verifyTransferIntegrity(args: VerifyTransferIntegrityArgs) {
        const { transfer, expectedAmountKobo, fromBalanceBeforeKobo, toBalanceBeforeKobo, description } = args;
        this.test.step(
            description ?? `Verify transfer ${transfer?.transferId} amount and resulting balances are exact-integer kobo`,
            () => {
                this.base.assertInteger(transfer.amountKobo, `transfer.amountKobo "${transfer.amountKobo}" must be an integer`);
                this.base.assertInteger(
                    transfer.fromBalanceKobo,
                    `transfer.fromBalanceKobo "${transfer.fromBalanceKobo}" must be an integer`
                );
                this.base.assertInteger(
                    transfer.toBalanceKobo,
                    `transfer.toBalanceKobo "${transfer.toBalanceKobo}" must be an integer`
                );
                this.base.assertStrictValue(
                    transfer.amountKobo,
                    expectedAmountKobo,
                    `transfer.amountKobo must be exactly ${expectedAmountKobo}`
                );
                this.base.assertStrictValue(
                    transfer.fromBalanceKobo,
                    fromBalanceBeforeKobo - expectedAmountKobo,
                    `fromBalanceKobo must be exactly ${fromBalanceBeforeKobo} - ${expectedAmountKobo}`
                );
                this.base.assertStrictValue(
                    transfer.toBalanceKobo,
                    toBalanceBeforeKobo + expectedAmountKobo,
                    `toBalanceKobo must be exactly ${toBalanceBeforeKobo} + ${expectedAmountKobo}`
                );
            }
        );
    }

    /**
     * Orchestration method: creates two fresh wallets, funds the sender, then
     * fires one transfer between them. Returns only the minimal shape the
     * caller needs, not every intermediate raw response - composed entirely
     * out of existing single-endpoint service methods.
     */
    async setupFundedTransfer(args: SetupFundedTransferArgs) {
        const { walletsService, headers, fundingAmountKobo, transferAmountKobo, idempotencyKey } = args;

        const fromWallet = (await walletsService.createWallet({ headers })).body;
        const toWallet = (await walletsService.createWallet({ headers })).body;
        await walletsService.creditWallet({
            pathParams: { id: fromWallet.id },
            body: walletsService.generateCreditBody(fundingAmountKobo),
            headers,
        });

        const key = idempotencyKey ?? generateIdempotencyKey('e2e');
        const transferResponse = await this.createTransfer({
            body: this.generateTransferBody({
                fromWalletId: fromWallet.id,
                toWalletId: toWallet.id,
                amountKobo: transferAmountKobo,
            }),
            headers: { ...(headers ?? {}), 'Idempotency-Key': key },
        });

        return {
            fromWalletId: fromWallet.id as string,
            toWalletId: toWallet.id as string,
            idempotencyKey: key,
            transfer: transferResponse.body,
        };
    }
}
