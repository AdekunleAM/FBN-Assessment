import { APIRequestContext, Expect } from '@playwright/test';
import endpoints from '../api-endpoints/endpoints.json';
import { sendRequest } from '../helper/request-helper';
import { CreditWalletArgs, GetWalletArgs, RequestArguments, Test, VerifyWalletShapeArgs } from '../types';
import { Base } from './base';

export class WalletsService {
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

    /** POST /wallets */
    async createWallet(args: RequestArguments = {}) {
        const { body, headers } = args;
        const response = await sendRequest(this.request, {
            method: 'post',
            url: endpoints.walletsService.createWallet.url,
            body,
            headers,
        });
        return response;
    }

    /** GET /wallets/:id */
    async getWalletById(args: GetWalletArgs) {
        const { pathParams, headers, query } = args;
        const response = await sendRequest(this.request, {
            method: 'get',
            url: endpoints.walletsService.getWalletById.url,
            pathParams,
            headers,
            query,
        });
        return response;
    }

    /** POST /wallets/:id/credit */
    async creditWallet(args: CreditWalletArgs) {
        const { pathParams, body, headers } = args;
        const response = await sendRequest(this.request, {
            method: 'post',
            url: endpoints.walletsService.creditWallet.url,
            pathParams,
            body,
            headers,
        });
        return response;
    }

    generateCreditBody(amountKobo: number) {
        return { amountKobo };
    }

    /**
     * Domain-specific, multi-field validation for a wallet response shape.
     * Must NOT be re-wrapped in another test.step by the caller.
     */
    verifyWalletShape(args: VerifyWalletShapeArgs) {
        const { wallet, expectedBalanceKobo, description } = args;
        this.test.step(description ?? `Verify wallet ${wallet?.id} response shape (id, balanceKobo, createdAt)`, () => {
            this.base.assertUUID(wallet.id, `Verify wallet.id "${wallet.id}" is a valid UUID`);
            this.base.assertInteger(
                wallet.balanceKobo,
                `Verify wallet.balanceKobo "${wallet.balanceKobo}" is an integer (kobo, never a float)`
            );
            this.expect.soft(wallet.balanceKobo).toBeGreaterThanOrEqual(0);
            this.expect
                .soft(new Date(wallet.createdAt).toString(), `createdAt "${wallet.createdAt}" must be a valid ISO date`)
                .not.toBe('Invalid Date');
            if (expectedBalanceKobo !== undefined) {
                this.base.assertStrictValue(
                    wallet.balanceKobo,
                    expectedBalanceKobo,
                    `Verify wallet.balanceKobo is exactly ${expectedBalanceKobo} kobo, with no floating-point drift`
                );
            }
        });
    }
}
