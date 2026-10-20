import { APIRequestContext } from '@playwright/test';
import qs from 'qs';
import { RequestData } from '../types';

export const sendRequest = async (request: APIRequestContext, data: RequestData) => {
    let query = '';

    if (data.query) {
        const queryParams = qs.stringify(data.query, { encodeValuesOnly: true });
        query = Object.keys(data.query ?? {}).length > 0 ? `?${queryParams}` : '';
    }

    if (data.pathParams) {
        data.url = replaceUrlParams(data.url, data.pathParams);
    }
    const requestUrl = `${data.url}${query}`;
    const start = Date.now();
    const raw = await request[data.method](requestUrl, {
        data: data.body,
        headers: data.headers,
    });
    const end = Date.now();
    const duration = (end - start) / 1000; // seconds
    const body = (await raw.json()) ?? {};

    return { raw, body, duration, requestUrl };
};

const replaceUrlParams = (url: string, params: { [key: string]: string }) => {
    Object.keys(params).forEach((key) => {
        const matchingParam = `:${key}`;
        if (params[key] === undefined) {
            throw new Error(`Missing value for parameter: ${key}`);
        } else {
            url = url.replace(matchingParam, params[key]);
        }
    });
    return url;
};
