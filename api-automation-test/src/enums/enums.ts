export const RequestMethod = {
    GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'delete',
} as const;
export type RequestMethod = typeof RequestMethod[keyof typeof RequestMethod];

export const HttpStatus = {
    OK: 200, CREATED: 201, BAD_REQUEST: 400, UNAUTHORIZED: 401,
    NOT_FOUND: 404, CONFLICT: 409, UNPROCESSABLE_ENTITY: 422,
} as const;
export type HttpStatus = typeof HttpStatus[keyof typeof HttpStatus];

export const ResponseTime = { // in seconds
    GET: 1, POST: 1.5,
} as const;
export type ResponseTime = typeof ResponseTime[keyof typeof ResponseTime];
