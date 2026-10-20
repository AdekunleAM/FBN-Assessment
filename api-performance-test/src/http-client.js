import { API_TOKEN, BASE_URL } from './config.js';

export function authHeaders(extra = {}) {
    return {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_TOKEN}`,
            ...extra,
        },
    };
}

export function url(path) {
    return `${BASE_URL}${path}`;
}
