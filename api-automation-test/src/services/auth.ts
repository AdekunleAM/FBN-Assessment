import { APIRequestContext, Expect } from '@playwright/test';
import endpoints from '../api-endpoints/endpoints.json';
import { sendRequest } from '../helper/request-helper';
import { CredentialsArgs, SignUpArgs, Test, VerifyUserShapeArgs } from '../types';
import { Base } from './base';

export class AuthService {
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

    /** POST /auth/signup - public, no bearer token required */
    async signUp(args: SignUpArgs) {
        const { body, headers } = args;
        return sendRequest(this.request, {
            method: 'post',
            url: endpoints.authService.signUp.url,
            body,
            headers,
        });
    }

    /** POST /auth/login - public, no bearer token required */
    async login(args: CredentialsArgs) {
        const { body, headers } = args;
        return sendRequest(this.request, {
            method: 'post',
            url: endpoints.authService.login.url,
            body,
            headers,
        });
    }

    /** POST /auth/me - protected: requires the usual Authorization header */
    async getUserInfo(args: CredentialsArgs) {
        const { body, headers } = args;
        return sendRequest(this.request, {
            method: 'post',
            url: endpoints.authService.getUserInfo.url,
            body,
            headers,
        });
    }

    generateSignUpBody(args: { email: string; fullName: string; password: string }) {
        return { ...args };
    }

    generateCredentialsBody(args: { email: string; password: string }) {
        return { ...args };
    }

    /**
     * Domain-specific, multi-field validation for a user response shape.
     * Must NOT be re-wrapped in another test.step by the caller.
     */
    verifyUserShape(args: VerifyUserShapeArgs) {
        const { user, expectedEmail, expectedFullName, description } = args;
        this.test.step(description ?? `Verify user ${user?.id} response shape (id, email, fullName, createdAt)`, () => {
            this.base.assertUUID(user.id, `Verify user.id "${user.id}" is a valid UUID`);
            this.base.assertEmail(user.email, `Verify user.email "${user.email}" is a valid email address`);
            this.expect.soft(typeof user.fullName, 'user.fullName must be a string').toBe('string');
            this.expect
                .soft(new Date(user.createdAt).toString(), `createdAt "${user.createdAt}" must be a valid ISO date`)
                .not.toBe('Invalid Date');
            this.expect.soft(user.passwordHash, 'the response must never echo back a password or password hash').toBeUndefined();

            if (expectedEmail !== undefined) {
                this.base.assertStrictValue(
                    user.email,
                    expectedEmail.toLowerCase(),
                    `Verify user.email is exactly "${expectedEmail.toLowerCase()}"`
                );
            }
            if (expectedFullName !== undefined) {
                this.base.assertStrictValue(user.fullName, expectedFullName, `Verify user.fullName is exactly "${expectedFullName}"`);
            }
        });
    }
}
