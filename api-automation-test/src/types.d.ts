import { APIResponse, PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions, TestType } from '@playwright/test';
import { RequestMethod } from './enums/enums';

export type Test = TestType<PlaywrightTestArgs & PlaywrightTestOptions, PlaywrightWorkerArgs & PlaywrightWorkerOptions>;

export type RequestMethods = RequestMethod;

export type RequestArguments = {
    headers?: { [key: string]: string };
    body?: any;
    query?: Object;
    pathParams?: { [key: string]: string };
};

export type RequestData = RequestArguments & {
    url: string;
    method: RequestMethods;
};

export type APIResponseStructure = {
    raw: APIResponse;
    body: any;
    duration: number;
    requestUrl: string;
};

// Wallets service
export type GetWalletArgs = RequestArguments & {
    pathParams: { id: string };
};

export type CreditWalletArgs = RequestArguments & {
    pathParams: { id: string };
    body: { amountKobo: number };
};

export type VerifyWalletShapeArgs = {
    wallet: any;
    expectedBalanceKobo?: number;
    description?: string;
};

// Transfers service
export type CreateTransferArgs = RequestArguments & {
    body?: {
        fromWalletId: string;
        toWalletId: string;
        amountKobo: number;
    };
};

export type VerifyTransferIntegrityArgs = {
    transfer: any;
    expectedAmountKobo: number;
    fromBalanceBeforeKobo: number;
    toBalanceBeforeKobo: number;
    description?: string;
};

export type SetupFundedTransferArgs = {
    walletsService: import('./services/wallets').WalletsService;
    headers?: { [key: string]: string };
    fundingAmountKobo: number;
    transferAmountKobo: number;
    idempotencyKey?: string;
};

// Auth service
export type SignUpArgs = RequestArguments & {
    body?: {
        email: string;
        fullName: string;
        password: string;
    };
};

export type CredentialsArgs = RequestArguments & {
    body?: {
        email: string;
        password: string;
    };
};

export type VerifyUserShapeArgs = {
    user: any;
    expectedEmail?: string;
    expectedFullName?: string;
    description?: string;
};
