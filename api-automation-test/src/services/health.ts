import { APIRequestContext } from '@playwright/test';
import endpoints from '../api-endpoints/endpoints.json';
import { sendRequest } from '../helper/request-helper';

export class HealthService {
    readonly request: APIRequestContext;

    constructor(request: APIRequestContext) {
        this.request = request;
    }

    /** GET /health */
    async getHealth() {
        const response = await sendRequest(this.request, {
            method: 'get',
            url: endpoints.healthService.getHealth.url,
        });
        return response;
    }
}
