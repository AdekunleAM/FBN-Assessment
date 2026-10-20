import { expect, test } from '@playwright/test';
import config from '../config/config';
import { HttpStatus } from '../enums/enums';
import { generateIdempotencyKey } from '../helper/functions-helper';
import { AuthService, Base, TransfersService, WalletsService } from '../services';
import { data, users } from '../test-data';

const headers = { authorization: `Bearer ${config.API_TOKEN}` };

test.describe(
    'Security Tests @general @security',
    {
        annotation: {
            type: 'Feature',
            description: 'Authn/authz bypass attempts and injection-style inputs — a first pass, not a full pen-test',
        },
    },
    () => {
        test.describe('Authentication bypass attempts', () => {
            test('Verify every protected endpoint rejects a request with no Authorization header', async ({ request }) => {
                const base = new Base({ test, expect, request });
                const walletsService = new WalletsService(base);
                const transfersService = new TransfersService(base);
                const authService = new AuthService(base);

                const createResponse = await walletsService.createWallet({});
                const getResponse = await walletsService.getWalletById({ pathParams: { id: data.nonExistentWalletId } });
                const creditResponse = await walletsService.creditWallet({
                    pathParams: { id: data.nonExistentWalletId },
                    body: { amountKobo: 100 },
                });
                const transferResponse = await transfersService.createTransfer({
                    body: { fromWalletId: data.nonExistentWalletId, toWalletId: data.nonExistentWalletId, amountKobo: 100 },
                    headers: { 'Idempotency-Key': generateIdempotencyKey('no-auth') },
                });
                // /auth/signup and /auth/login are deliberately excluded here -
                // they're the one pair of endpoints meant to stay public.
                const meResponse = await authService.getUserInfo({
                    body: authService.generateCredentialsBody({ email: config.DEFAULT_USER_EMAIL, password: config.DEFAULT_USER_PASSWORD }),
                });

                await test.step(`Verify all five protected endpoints respond ${HttpStatus.UNAUTHORIZED} without a token`, () => {
                    expect.soft(createResponse.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
                    expect.soft(getResponse.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
                    expect.soft(creditResponse.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
                    expect.soft(transferResponse.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
                    expect.soft(meResponse.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
                });
            });

            test('Verify an invalid/garbage bearer token is rejected on a protected endpoint', async ({ request }) => {
                const base = new Base({ test, expect, request });
                const walletsService = new WalletsService(base);
                const badHeaders = { authorization: `Bearer ${users.service.invalidToken}` };

                const response = await walletsService.createWallet({ headers: badHeaders });

                await test.step(`Verify invalid-token response status code is ${HttpStatus.UNAUTHORIZED}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
                });
            });

            test('Verify a malformed Authorization header (missing "Bearer " prefix) is rejected', async ({ request }) => {
                const base = new Base({ test, expect, request });
                const walletsService = new WalletsService(base);

                const response = await walletsService.createWallet({ headers: { authorization: config.API_TOKEN } });

                await test.step(`Verify malformed-header response status code is ${HttpStatus.UNAUTHORIZED}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
                });
            });
        });

        test.describe('Authorization boundary (cross-wallet access)', () => {
            test('Finding: the API has no per-wallet ownership — any holder of the single shared bearer token can read/credit/transfer any wallet by id', async ({
                request,
            }) => {
                const base = new Base({ test, expect, request });
                const walletsService = new WalletsService(base);
                const transfersService = new TransfersService(base);

                // There is no "my wallet" vs "someone else's wallet" concept in
                // this API - one shared service-level token grants access to
                // every wallet. This test documents that as a known
                // characteristic of the current design (not a bug introduced by
                // this test), since the brief never specified per-user wallet
                // ownership/ACLs. If per-wallet scoping is added later, this
                // test should start failing and should then be rewritten to
                // expect a 403.
                const ownerWallet = (await walletsService.createWallet({ headers })).body;
                const otherHolderWallet = (await walletsService.createWallet({ headers })).body;

                const crossGetResponse = await walletsService.getWalletById({ pathParams: { id: ownerWallet.id }, headers });
                const crossCreditResponse = await walletsService.creditWallet({
                    pathParams: { id: ownerWallet.id },
                    body: { amountKobo: 100 },
                    headers,
                });
                const crossTransferResponse = await transfersService.createTransfer({
                    body: { fromWalletId: ownerWallet.id, toWalletId: otherHolderWallet.id, amountKobo: 50 },
                    headers: { ...headers, 'Idempotency-Key': generateIdempotencyKey('cross-wallet') },
                });

                await test.step('Document current behavior: cross-wallet GET/credit/transfer all succeed with a valid (shared) token', () => {
                    expect.soft(crossGetResponse.raw.status()).toBe(HttpStatus.OK);
                    expect.soft(crossCreditResponse.raw.status()).toBe(HttpStatus.OK);
                    expect.soft(crossTransferResponse.raw.status()).toBe(HttpStatus.CREATED);
                });
            });
        });

        test.describe('Injection attempts', () => {
            test('Verify a SQL-injection-style wallet id in a GET path param is treated as a safe not-found, not a crash', async ({
                request,
            }) => {
                const base = new Base({ test, expect, request });
                const walletsService = new WalletsService(base);

                const response = await walletsService.getWalletById({ pathParams: { id: data.injectionPayloads.sqlLike }, headers });

                await test.step(`Verify SQL-injection-style id responds ${HttpStatus.NOT_FOUND}, not 500`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.NOT_FOUND);
                });
            });

            test('Verify a destructive SQL-injection-style payload as a wallet id does not crash the server', async ({ request }) => {
                const base = new Base({ test, expect, request });
                const walletsService = new WalletsService(base);

                const response = await walletsService.getWalletById({ pathParams: { id: data.injectionPayloads.sqlDrop }, headers });

                await test.step(`Verify destructive-payload id responds ${HttpStatus.NOT_FOUND}, not 500`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.NOT_FOUND);
                });
            });

            test('Verify a NoSQL-operator-shaped object in place of amountKobo is rejected by validation, not coerced', async ({
                request,
            }) => {
                const base = new Base({ test, expect, request });
                const walletsService = new WalletsService(base);
                const wallet = (await walletsService.createWallet({ headers })).body;

                const response = await walletsService.creditWallet({
                    pathParams: { id: wallet.id },
                    body: { amountKobo: data.injectionPayloads.noSqlOperator as any },
                    headers,
                });

                await test.step(`Verify object-shaped amountKobo response status code is ${HttpStatus.BAD_REQUEST}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.BAD_REQUEST);
                });

                await test.step('Verify the wallet balance was not mutated', async () => {
                    const walletAfter = (await walletsService.getWalletById({ pathParams: { id: wallet.id }, headers })).body;
                    expect.soft(walletAfter.balanceKobo).toBe(0);
                });
            });

            test('Verify an injection payload inside the Idempotency-Key header is handled as an opaque string, not executed/reflected unsafely', async ({
                request,
            }) => {
                const base = new Base({ test, expect, request });
                const walletsService = new WalletsService(base);
                const transfersService = new TransfersService(base);

                const fromWallet = (await walletsService.createWallet({ headers })).body;
                const toWallet = (await walletsService.createWallet({ headers })).body;
                await walletsService.creditWallet({
                    pathParams: { id: fromWallet.id },
                    body: walletsService.generateCreditBody(1000),
                    headers,
                });

                const maliciousKey = `${data.injectionPayloads.sqlDrop}-<script>alert(1)</script>`;
                const response = await transfersService.createTransfer({
                    body: transfersService.generateTransferBody({ fromWalletId: fromWallet.id, toWalletId: toWallet.id, amountKobo: 100 }),
                    headers: { ...headers, 'Idempotency-Key': maliciousKey },
                });

                await test.step(`Verify a transfer with a malicious-string Idempotency-Key still processes normally (${HttpStatus.CREATED})`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.CREATED);
                });

                await test.step('Verify replaying that same malicious key with the same body still returns the cached response safely', async () => {
                    const replay = await transfersService.createTransfer({
                        body: transfersService.generateTransferBody({ fromWalletId: fromWallet.id, toWalletId: toWallet.id, amountKobo: 100 }),
                        headers: { ...headers, 'Idempotency-Key': maliciousKey },
                    });
                    expect.soft(replay.raw.status()).toBe(HttpStatus.CREATED);
                    expect.soft(replay.body).toEqual(response.body);
                });
            });
        });
    }
);
