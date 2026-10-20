import { expect, test } from '@playwright/test';
import config from '../config/config';
import { HttpStatus } from '../enums/enums';
import { generateUniqueEmail } from '../helper/functions-helper';
import { AuthService, Base } from '../services';

const headers = { authorization: `Bearer ${config.API_TOKEN}` };

test.describe(
    'Auth Service Tests @general @auth_svc',
    { annotation: { type: 'Service', description: 'Auth Service (signup / login / me)' } },
    () => {
        test.describe('Sign Up', () => {
            test('Verify a new user can sign up with no Authorization header required (public endpoint) @smoke', async ({
                request,
            }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);

                const email = generateUniqueEmail('signup-happy');
                const response = await authService.signUp({
                    body: authService.generateSignUpBody({ email, fullName: 'Ada Lovelace', password: 'correct-horse-1' }),
                });

                await test.step(`Verify signup response status code is ${HttpStatus.CREATED}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.CREATED);
                });

                authService.verifyUserShape({ user: response.body, expectedEmail: email, expectedFullName: 'Ada Lovelace' });
            });

            test('Verify signing up with an already-registered email is rejected with 409 (negative)', async ({ request }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);
                const email = generateUniqueEmail('signup-duplicate');
                const body = authService.generateSignUpBody({ email, fullName: 'Grace Hopper', password: 'correct-horse-1' });

                const firstResponse = await authService.signUp({ body });
                expect(firstResponse.raw.status()).toBe(HttpStatus.CREATED); // hard gate: the duplicate check is meaningless if the first signup itself failed

                const duplicateResponse = await authService.signUp({ body });

                await test.step(`Verify duplicate signup response status code is ${HttpStatus.CONFLICT}`, () => {
                    expect.soft(duplicateResponse.raw.status()).toBe(HttpStatus.CONFLICT);
                });
            });

            test('Verify signing up with an invalid email is rejected with 400 (negative)', async ({ request }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);

                const response = await authService.signUp({
                    body: { email: 'not-an-email', fullName: 'Bad Email', password: 'correct-horse-1' },
                });

                await test.step(`Verify invalid-email signup response status code is ${HttpStatus.BAD_REQUEST}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.BAD_REQUEST);
                });
            });

            test('Verify signing up with a missing fullName is rejected with 400 (negative)', async ({ request }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);

                const response = await authService.signUp({
                    body: { email: generateUniqueEmail('signup-no-name'), fullName: '', password: 'correct-horse-1' } as any,
                });

                await test.step(`Verify missing-fullName signup response status code is ${HttpStatus.BAD_REQUEST}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.BAD_REQUEST);
                });
            });

            test('Verify signing up with a password under 8 characters is rejected with 400 (negative)', async ({ request }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);

                const response = await authService.signUp({
                    body: authService.generateSignUpBody({ email: generateUniqueEmail('signup-short-pw'), fullName: 'Short Pw', password: 'short1' }),
                });

                await test.step(`Verify short-password signup response status code is ${HttpStatus.BAD_REQUEST}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.BAD_REQUEST);
                });
            });

            // Required complexity: at least 1 number AND at least 1 special
            // character (independent of the separate 8-char minimum-length
            // rule already covered above). Each password below is long
            // enough (>= 8 chars) to isolate the complexity check specifically.
            const passwordsMissingComplexity = [
                { password: 'noNumberOrSpecial', missing: 'a number and a special character' },
                { password: 'hasNumber1only', missing: 'a special character' },
                { password: 'has!SpecialOnly', missing: 'a number' },
            ];

            for (const { password, missing } of passwordsMissingComplexity) {
                test(`Verify signing up with a password missing ${missing} is rejected with 400 (negative)`, async ({ request }) => {
                    const base = new Base({ test, expect, request });
                    const authService = new AuthService(base);

                    const response = await authService.signUp({
                        body: authService.generateSignUpBody({
                            email: generateUniqueEmail('signup-weak-pw'),
                            fullName: 'Weak Password',
                            password,
                        }),
                    });

                    await test.step(
                        `Verify password "${password}" (missing ${missing}) response status code is ${HttpStatus.BAD_REQUEST}`,
                        () => {
                            expect.soft(response.raw.status()).toBe(HttpStatus.BAD_REQUEST);
                        }
                    );
                });
            }
        });

        test.describe('Login', () => {
            test('Verify a signed-up user can log in and receive a JWT, with no Authorization header required @smoke', async ({
                request,
            }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);
                const email = generateUniqueEmail('login-happy');
                const password = 'correct-horse-1';

                const signUpResponse = await authService.signUp({
                    body: authService.generateSignUpBody({ email, fullName: 'Login Happy Path', password }),
                });
                expect(signUpResponse.raw.status()).toBe(HttpStatus.CREATED); // hard gate: login can't succeed if signup didn't

                const response = await authService.login({ body: authService.generateCredentialsBody({ email, password }) });

                await test.step(`Verify login response status code is ${HttpStatus.OK}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.OK);
                });

                await test.step('Verify a non-trivial JWT string is returned', () => {
                    expect.soft(typeof response.body.token).toBe('string');
                    expect.soft(response.body.token.split('.').length, 'a JWT has 3 dot-separated segments').toBe(3);
                });

                authService.verifyUserShape({ user: response.body.user, expectedEmail: email });
            });

            test('Verify logging in with the wrong password is rejected with 401 (negative)', async ({ request }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);
                const email = generateUniqueEmail('login-wrong-pw');

                await authService.signUp({ body: authService.generateSignUpBody({ email, fullName: 'Wrong Pw', password: 'correct-horse-1' }) });
                const response = await authService.login({ body: authService.generateCredentialsBody({ email, password: 'incorrect-horse' }) });

                await test.step(`Verify wrong-password login response status code is ${HttpStatus.UNAUTHORIZED}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
                });
            });

            test('Verify logging in with an unregistered email is rejected with 401, with the same message as a wrong password (no user enumeration) (negative)', async ({
                request,
            }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);
                const email = generateUniqueEmail('login-unknown-vs-wrong-pw');

                await authService.signUp({ body: authService.generateSignUpBody({ email, fullName: 'Enumeration Check', password: 'correct-horse-1' }) });
                const wrongPasswordResponse = await authService.login({ body: authService.generateCredentialsBody({ email, password: 'incorrect-horse' }) });
                const unknownEmailResponse = await authService.login({
                    body: authService.generateCredentialsBody({ email: generateUniqueEmail('never-signed-up'), password: 'whatever-pw' }),
                });

                await test.step(`Verify both responses are ${HttpStatus.UNAUTHORIZED}`, () => {
                    expect.soft(wrongPasswordResponse.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
                    expect.soft(unknownEmailResponse.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
                });

                await test.step('Verify the error message does not differ between "wrong password" and "unknown email"', () => {
                    expect.soft(unknownEmailResponse.body.error).toBe(wrongPasswordResponse.body.error);
                });
            });
        });

        test.describe('Get User (me)', () => {
            test('Verify the default user seeded on startup can be fetched via the static API token @smoke', async ({ request }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);

                const response = await authService.getUserInfo({
                    headers,
                    body: authService.generateCredentialsBody({
                        email: config.DEFAULT_USER_EMAIL,
                        password: config.DEFAULT_USER_PASSWORD,
                    }),
                });

                await test.step(`Verify me response status code is ${HttpStatus.OK}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.OK);
                });

                authService.verifyUserShape({ user: response.body, expectedEmail: config.DEFAULT_USER_EMAIL });
            });

            test('Verify me works with a freshly-issued JWT and that user\'s own credentials @smoke', async ({ request }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);
                const email = generateUniqueEmail('me-own-jwt');
                const password = 'correct-horse-1';

                await authService.signUp({ body: authService.generateSignUpBody({ email, fullName: 'Me Own Jwt', password }) });
                const loginResponse = await authService.login({ body: authService.generateCredentialsBody({ email, password }) });
                const token = loginResponse.body.token;

                const response = await authService.getUserInfo({
                    headers: { authorization: `Bearer ${token}` },
                    body: authService.generateCredentialsBody({ email, password }),
                });

                await test.step(`Verify me response status code is ${HttpStatus.OK}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.OK);
                });

                authService.verifyUserShape({ user: response.body, expectedEmail: email });
            });

            test('Verify me is rejected with 401 when no Authorization header is sent, even with correct credentials in the body (negative)', async ({
                request,
            }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);

                const response = await authService.getUserInfo({
                    body: authService.generateCredentialsBody({
                        email: config.DEFAULT_USER_EMAIL,
                        password: config.DEFAULT_USER_PASSWORD,
                    }),
                });

                await test.step(`Verify me without auth response status code is ${HttpStatus.UNAUTHORIZED}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
                });
            });

            test('Verify me is rejected with 401 when the body password is wrong, even with a valid bearer token (negative)', async ({
                request,
            }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);

                const response = await authService.getUserInfo({
                    headers,
                    body: authService.generateCredentialsBody({ email: config.DEFAULT_USER_EMAIL, password: 'wrong-password' }),
                });

                await test.step(`Verify me with wrong body password response status code is ${HttpStatus.UNAUTHORIZED}`, () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.UNAUTHORIZED);
                });
            });

            test('Finding: a valid bearer token from ANY user can fetch a DIFFERENT user\'s info, given that user\'s correct credentials - /auth/me is not scoped to the token holder', async ({
                request,
            }) => {
                const base = new Base({ test, expect, request });
                const authService = new AuthService(base);

                // Consistent with security.spec.ts's cross-wallet-access finding:
                // this API has no per-user scoping anywhere. The bearer token
                // only proves "some valid credential was presented," not "this is
                // the specific user you're asking about." Documented here as
                // current behavior, not a bypass - if /auth/me is ever scoped to
                // the token's own identity, this test should start failing and
                // should then be rewritten to expect a 403.
                const emailA = generateUniqueEmail('cross-user-a');
                const passwordA = 'correct-horse-1';
                await authService.signUp({ body: authService.generateSignUpBody({ email: emailA, fullName: 'User A', password: passwordA }) });
                const loginA = await authService.login({ body: authService.generateCredentialsBody({ email: emailA, password: passwordA }) });

                const emailB = generateUniqueEmail('cross-user-b');
                const passwordB = 'correct-horse-2';
                await authService.signUp({ body: authService.generateSignUpBody({ email: emailB, fullName: 'User B', password: passwordB }) });

                const response = await authService.getUserInfo({
                    headers: { authorization: `Bearer ${loginA.body.token}` }, // User A's token
                    body: authService.generateCredentialsBody({ email: emailB, password: passwordB }), // User B's credentials
                });

                await test.step('Document current behavior: User B\'s info is returned using User A\'s bearer token', () => {
                    expect.soft(response.raw.status()).toBe(HttpStatus.OK);
                    expect.soft(response.body.email).toBe(emailB);
                });
            });
        });
    }
);
