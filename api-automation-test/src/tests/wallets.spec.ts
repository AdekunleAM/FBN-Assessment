import { expect, test } from '@playwright/test';
import config from '../config/config';
import { HttpStatus, ResponseTime } from '../enums/enums';
import { generateUniqueEmail } from '../helper/functions-helper';
import { AuthService, Base, WalletsService } from '../services';
import { data } from '../test-data';

const headers = { authorization: `Bearer ${config.API_TOKEN}` };

test.describe(
    'Wallets Service Tests @general @wallets_svc',
    { annotation: { type: 'Service', description: 'Wallets Service' } },
    () => {
        test('Verify a wallet can be created with a zero balance @smoke', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);

            const response = await walletsService.createWallet({ headers });

            await test.step(`Verify create wallet response status code is ${HttpStatus.CREATED}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.CREATED);
            });

            await test.step(`Verify create wallet response duration ${response.duration}s is under ${ResponseTime.POST}s`, () => {
                expect.soft(response.duration).toBeLessThan(ResponseTime.POST);
            });

            walletsService.verifyWalletShape({ wallet: response.body, expectedBalanceKobo: 0 });
        });

        test('Verify a wallet can be credited and the balance reflects the exact kobo amount @smoke', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);

            const wallet = (await walletsService.createWallet({ headers })).body;
            const creditAmountKobo = 1_000_000;

            const response = await walletsService.creditWallet({
                pathParams: { id: wallet.id },
                body: walletsService.generateCreditBody(creditAmountKobo),
                headers,
            });

            await test.step(`Verify credit response status code is ${HttpStatus.OK}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.OK);
            });

            walletsService.verifyWalletShape({ wallet: response.body, expectedBalanceKobo: creditAmountKobo });
        });

        test('Verify a wallet can be fetched by id and matches what was created', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);

            const created = (await walletsService.createWallet({ headers })).body;
            const response = await walletsService.getWalletById({ pathParams: { id: created.id }, headers });

            await test.step(`Verify get wallet response status code is ${HttpStatus.OK}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.OK);
            });

            await test.step('Verify fetched wallet matches the created wallet exactly', () => {
                expect.soft(response.body).toEqual(created);
            });
        });

        test('Verify fetching a non-existent wallet returns 404 (negative)', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);

            const response = await walletsService.getWalletById({ pathParams: { id: data.nonExistentWalletId }, headers });

            await test.step(`Verify get wallet response status code is ${HttpStatus.NOT_FOUND}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.NOT_FOUND);
            });

            await test.step('Verify the 404 response carries an error message', () => {
                expect.soft(typeof response.body.error).toBe('string');
            });
        });

        for (const invalidAmount of [0, -100, 100.5, '100000', null]) {
            test(`Verify crediting a wallet with an invalid amountKobo (${JSON.stringify(invalidAmount)}) is rejected (negative)`, async ({
                request,
            }) => {
                const base = new Base({ test, expect, request });
                const walletsService = new WalletsService(base);
                const wallet = (await walletsService.createWallet({ headers })).body;

                const response = await walletsService.creditWallet({
                    pathParams: { id: wallet.id },
                    body: { amountKobo: invalidAmount as any },
                    headers,
                });

                await test.step(`Verify credit response status code is ${HttpStatus.BAD_REQUEST}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.BAD_REQUEST);
                });

                await test.step('Verify the wallet balance was not mutated by the rejected credit', async () => {
                    const walletAfter = (await walletsService.getWalletById({ pathParams: { id: wallet.id }, headers })).body;
                    expect.soft(walletAfter.balanceKobo).toBe(0);
                });
            });
        }

        test('Verify a user can only create a single wallet - a second attempt is rejected with a graceful, valid error message (negative)', async ({
            request,
        }) => {
            const base = new Base({ test, expect, request });
            const authService = new AuthService(base);
            const walletsService = new WalletsService(base);

            const email = generateUniqueEmail('one-wallet-per-user');
            const password = 'correct-horse-1';
            await authService.signUp({ body: authService.generateSignUpBody({ email, fullName: 'One Wallet Per User', password }) });
            const loginResponse = await authService.login({ body: authService.generateCredentialsBody({ email, password }) });
            const userHeaders = { authorization: `Bearer ${loginResponse.body.token}` };

            const firstWalletResponse = await walletsService.createWallet({ headers: userHeaders });
            // Hard gate: the "second wallet rejected" assertion below is
            // meaningless if the first wallet itself never succeeded.
            expect(firstWalletResponse.raw.status()).toBe(HttpStatus.CREATED);

            const secondWalletResponse = await walletsService.createWallet({ headers: userHeaders });

            await test.step(
                `Verify a second wallet creation by the same user is rejected with ${HttpStatus.CONFLICT}, not another ${HttpStatus.CREATED}`,
                () => {
                    expect.soft(secondWalletResponse.raw.status()).toBe(HttpStatus.CONFLICT);
                }
            );

            await test.step('Verify the rejection is graceful: never a server error, and always a valid, human-readable error message', () => {
                expect
                    .soft(secondWalletResponse.raw.status(), 'a known business rule must never surface as a 500 crash')
                    .toBeLessThan(500);
                expect.soft(typeof secondWalletResponse.body.error, 'response must include a string error message').toBe('string');
                expect
                    .soft((secondWalletResponse.body.error ?? '').length, 'error message must not be empty')
                    .toBeGreaterThan(0);
            });
        });

        test('Verify creating a wallet without auth is rejected (negative)', async ({ request }) => {
            const base = new Base({ test, expect, request });
            const walletsService = new WalletsService(base);

            const response = await walletsService.createWallet({});

            await test.step(`Verify create wallet without auth response status code is ${HttpStatus.UNAUTHORIZED}`, () => {
                expect.soft(response.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
            });
        });
    }
);
