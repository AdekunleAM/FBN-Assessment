import { APIRequestContext, Expect } from '@playwright/test';
import validator from 'validator';
import { Test } from '../types';

type BaseArgs = {
    test: Test;
    request: APIRequestContext;
    expect: Expect;
};

export class Base {
    readonly request: APIRequestContext;
    readonly test: Test;
    readonly expect: Expect;

    constructor(args: BaseArgs) {
        this.test = args.test;
        this.request = args.request;
        this.expect = args.expect;
    }

    assertEmail(value: any, description?: string) {
        const testDescription = description ?? `Verify ${value} is a valid email address`;
        if (!validator.isEmail(String(value))) {
            this.test.step(testDescription, () => {
                this.expect.soft(validator.isEmail(String(value))).toBeTruthy();
            });
        }
    }

    assertUUID(value: any, description?: string) {
        const testDescription = description ?? `Verify ${value} is a valid UUID`;
        if (!validator.isUUID(String(value))) {
            this.test.step(testDescription, () => {
                this.expect.soft(validator.isUUID(String(value))).toBeTruthy();
            });
        }
    }

    assertInteger(value: any, description?: string) {
        const testDescription =
            description ??
            `Verify ${JSON.stringify(value)} is an integer (currency fields must be integer kobo, never a float)`;
        if (typeof value !== 'number' || !Number.isInteger(value)) {
            this.test.step(testDescription, () => {
                this.expect.soft(Number.isInteger(value)).toBeTruthy();
            });
        }
    }

    assertStrictValue(actual: any, expected: any, description?: string) {
        const testDescription =
            description ?? `Verify value is strictly ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
        if (actual !== expected) {
            this.test.step(testDescription, () => {
                this.expect.soft(actual).toBe(expected);
            });
        }
    }
}
