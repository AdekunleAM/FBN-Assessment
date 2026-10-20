# Prompt: Build a Playwright API Test Automation Framework (endpoints → services → sendRequest → tests)

Paste everything below this line to an agent to have it scaffold a new Playwright-based API test automation framework from scratch, following the same layered architecture as an existing reference implementation. Fill in the `<...>` placeholders for your project before sending.

---

## Context

Build a TypeScript test automation framework on top of `@playwright/test`'s `APIRequestContext`, for testing a backend made of `<N>` HTTP services/controllers: `<list your services, e.g. authService, inventoryService, orderService>`.

The framework is **not** "one test file calls `axios`/`fetch` directly." It is a strict layered architecture where every layer has one job, so that adding a new test is a mechanical, repeatable process rather than a design decision each time. Build the layers in this order — each depends on the one before it:

1. **Config** — env-driven settings
2. **Types** — shared TypeScript contracts every other layer imports
3. **Enums & constants** — fixed value sets
4. **Endpoints registry** — a single JSON file mapping every URL, grouped by service
5. **Request helper** — one function (`sendRequest`) that is the *only* place an HTTP call is actually made
6. **Base class** — generic, reusable field-level assertions (email, UUID, URL, phone, JSON-schema, etc.)
7. **Services** — one class per backend service, wrapping `sendRequest` per endpoint
8. **Test data fixtures** — static JSON for users/accounts/reference data, keyed by market/tenant
9. **Tests** — one spec file per market/tenant, grouped into `test.describe` blocks per service
10. **E2E flow tests** — a second category of spec file where orchestration methods on services chain several endpoint calls into one real business journey

Do not skip ahead to writing tests before layers 1–7 exist, even for a single endpoint — the whole point of this architecture is that the test file ends up almost trivial (call a service method, assert on the result) because all the request-building complexity is pushed down into the service layer.

---

## 1. Config (`src/config/config.ts`)

Export a single default object reading from `process.env`, with a short runtime assertion (not a schema library) that required vars are present. Fields you'll typically need: `API_BASE_URL`, `USERS_PASSWORD` (or per-market credential base), `BASE_EMAIL` (for plus-addressing unique test accounts), any third-party captcha/test keys the API requires, and an `ENVIRONMENT` flag (`development | staging | production`) if behavior/test data differs by environment.

Provide a `.env.sample` listing every key with a placeholder value, and `.gitignore` the real `.env*` files.

---

## 2. Types (`src/types.d.ts`)

Define the request/response plumbing types first — everything else imports from here:

```ts
export type RequestMethods = 'get' | 'post' | 'put' | 'patch' | 'delete';

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

export type Test = /* import and re-export Playwright's TestType so service classes can accept it without importing @playwright/test directly in every file */ any;
```

Then, as you build each service in step 7, add one named arg-type per method that takes a structured/non-trivial argument (`CreateXArgs`, `GenerateXIdArgs`, `VerifyXStatusArgs`) rather than loosely typing with `any`. Only type the response fields you actually assert on or pass between steps — never try to fully mirror the backend's response shape.

---

## 3. Enums & constants

- `src/enums/enums.ts` — `export const X = {...} as const` plus `export type X = typeof X[keyof typeof X]` for every closed set of values used across multiple tests: country/market codes, currency codes, platform/app identifiers sent as headers, response-time SLA thresholds, product/loan types, etc.
- `src/constants/constants.ts` — standalone magic values that don't form a set (a popular-makes list, a default page size). Check both files before adding a new value — never duplicate a value under two names.

---

## 4. Endpoints registry (`src/api-endpoints/endpoints.json`)

One JSON file, top-level keys are service names matching your backend's actual service/controller boundaries (not arbitrary groupings):

```json
{
  "authService": {
    "login": { "url": "/v1/auth/login", "permissions": [] }
  },
  "inventoryService": {
    "createCar": { "url": "/v1/inventory/admin/car", "permissions": [] },
    "getCarByAdmin": { "url": "/v1/inventory/admin/car/:carId", "permissions": [] }
  }
}
```

Rules:
- Key per endpoint is camelCase, verb+noun, describing the action (`getCarList`, `createCar`) — not the HTTP method.
- Path params use a `:paramName` placeholder; the request helper substitutes these from `pathParams`.
- Only create a new top-level service key when the endpoint genuinely belongs to a backend service/controller that doesn't already have one — don't invent groupings that don't match the backend's real boundaries.

---

## 5. Request helper (`src/helper/request-helper.ts`)

One exported function, `sendRequest(request: APIRequestContext, data: RequestData)`, and it is the **only** place in the entire codebase that calls `request[method](...)`. Every service method funnels through it. Responsibilities:

```ts
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
    const raw = await request[data.method](requestUrl, { data: data.body, headers: data.headers });
    const end = Date.now();
    const duration = (end - start) / 1000;
    const body = await raw.json() ?? {};
    return { raw, body, duration, requestUrl };
};
```

`replaceUrlParams` throws if a required `:param` has no matching key in `pathParams` — fail fast on a malformed call rather than silently sending a URL with a literal `:param` in it.

Always return the full `{raw, body, duration, requestUrl}` shape — never unwrap inside the helper. Callers (service methods) decide what they need.

Add a second helper file (`src/helper/functions-helper.ts`) for small pure utilities reused across services/tests: random number/string generation (for unique test data), date helpers (`randomDateValue`, `getISODateHoursFromNow`), and anything else that would otherwise be duplicated inline in multiple tests.

---

## 6. Base class (`src/services/base.ts`)

A single `Base` class, constructed with `{ test, expect, request }` (Playwright's test fixtures, passed down from the spec file). Holds **generic, reusable, field-shape** assertions only — nothing domain-specific:

```ts
export class Base {
    readonly request: APIRequestContext;
    readonly test: Test;
    readonly expect: Expect;

    constructor(args: { test: Test; request: APIRequestContext; expect: Expect }) {
        this.test = args.test;
        this.request = args.request;
        this.expect = args.expect;
    }

    assertEmail(value: any, description?: string) {
        const desc = description ?? `Verify ${value} is a valid Email address`;
        if (!validator.isEmail(value)) {
            this.test.step(desc, () => {
                this.expect.soft(validator.isEmail(value)).toBeTruthy();
            });
        }
    }
    // assertUUID, assertURL, assertPhoneNumber, assertString, assertBoolean,
    // assertNumber, assertOptions (value is one of an allowed set),
    // assertStrictValue (exact equality with a clear failure description),
    // assertJSONSchemaValidationForObjects / ...ForArrays (using ajv)
}
```

Every assertion method follows the same shape: take the value(s) plus an optional description, wrap the failure path in `this.test.step(...)` using `this.expect.soft(...)`, and be a complete no-op (no step created at all) when the value already passes. This keeps passing tests' step output clean and failing tests' reports granular. Use `ajv` for JSON-schema checks and the `validator` npm package for email/URL/phone-shape checks rather than hand-rolled regex where a battle-tested check already exists.

`Base` is also the carrier that services use when they need `test`/`expect` for their own validation methods (see step 7) — services that only need to fire requests can take a plain `APIRequestContext` instead.

---

## 7. Services (`src/services/<service-name>.ts`, one file per backend service)

```ts
export class InventoryService {
    readonly request: APIRequestContext;
    readonly test: Test;
    readonly expect: Expect;
    readonly base: Base;

    constructor(base: Base) {
        this.base = base;
        this.request = base.request;
        this.expect = base.expect;
        this.test = base.test;
    }

    async createCar(args: RequestArguments) {
        const { body, headers } = args;
        const response = await sendRequest(this.request, {
            method: 'post',
            url: endpoints.inventoryService.createCar.url,
            body,
            headers,
        });
        return response;
    }
}
```

Rules:
- **Constructor:** take `APIRequestContext` directly for services that only fire requests; take a `Base` instance for services that also need to run their own assertions or polling (see domain-specific validation below) so they have `test`/`expect` available via `this.base`.
- **Method signature:** always `async methodName(args: SomeArgs)`, destructuring only what's needed (`headers`, `body`, `query`, `pathParams`) — default to `RequestArguments` unless the method needs a structured custom shape (see step 3).
- **`method` value:** lowercase, matching `RequestMethods`.
- **Return value:** the full `sendRequest` result — don't unwrap `.body` inside the method; let the caller decide. (The one deliberate exception is orchestration methods, step 10.)
- **Non-trivial payloads:** if a request body is complex to construct, add a `generateXBody(args)` helper method on the same class rather than inlining object construction in the test.
- **Domain-specific, multi-field validation** that's tied to one feature (not a generic field-shape check) also lives on the owning service class as its own method, e.g. `verifyCarsData({cars, excludeTests})` — checks several related fields together as one logical unit, wraps itself in its own `test.step` internally, and is called from the test as a single line with no extra wrapping needed.
- **Registration:** every service class must be exported from `src/services/index.ts` so the rest of the codebase imports from one place: `import { InventoryService, AuthService, ... } from '../services'`.

---

## 8. Test data fixtures (`src/test-data/*.json` + `src/test-data/index.ts`)

Static, reused-across-tests data only — one-off values stay inline in the test that needs them.
- `users.json` — credentials/identifiers for standing test accounts, keyed by market/tenant code plus any role keys you need (`accountManager`, `Admin`, ...).
- `data.json` — other static per-market data (franchise names, product config), same key structure, plus a `global` key for values that don't vary by market.

Re-export both from `src/test-data/index.ts` so tests do `import { data, users } from '../test-data'`.

---

## 9. Tests (`src/tests/<market>.spec.ts`)

**One spec file per market/tenant**, not one file per feature or endpoint. Inside each file:

```ts
test.describe('Inventory Service Tests @general @inventory_svc', () => {
    test('Verify an account manager can create a new car @account_manager', async ({ request }) => {
        const base = new Base({ test, expect, request });
        const inventoryService = new InventoryService(base);
        // ...
    });
});
```

- One `test.describe(..., { annotation: { type: 'Service', description: '...' } })` block per backend service, tagged `@general @<service>_svc`; individual `test()` cases tagged by role/scenario (`@admin`, `@account_manager`, `@normal_user`).
- Inside a test: instantiate `Base`, then every service needed, passing `request` or `base` per that service's constructor signature.
- Generate unique data per run — email plus-addressing (`BASE_EMAIL.replace('@', '+p<random>@')`), random dates — since there's no test-account teardown and every run hits a real environment.
- Wrap each **logical assertion group** in its own `test.step`, not one giant step per request, so the report shows granular pass/fail.
- `expect(...)` (hard) only for genuine gating conditions (a token must exist before you build auth headers from it); `expect.soft(...)` for everything else, so one unrelated failure doesn't hide the rest of the run.
- Thread auth forward explicitly: confirm the token, build `headers = { authorization: \`Bearer ${token}\` }` once, pass it to every subsequent authenticated call.
- For state the backend computes asynchronously (an offer, a webhook), poll rather than sleep:

```ts
await expect.poll(async () => {
    const details = (await service.getById({ headers, pathParams })).body;
    return details.status; // guard against throwing on a not-yet-ready shape — expect.poll does not retry a thrown error
}, { intervals: [30_000], timeout: 95_000 }).toBe('EXPECTED_STATUS');
```

- Run scope is controlled by npm scripts (`package.json`), not filenames: an all-markets script (`--project=<project-name>`), a per-market script (grep the filename), and a per-service script (`--grep @<service>_svc`). Add a new per-service script whenever you introduce a new service tag.

---

## 10. E2E flow tests (`src/tests/<market>.e2e.spec.ts`)

Once steps 1–9 exist, add a second category of spec file for journeys that cross multiple services — this reuses every layer above, it does not introduce a new one.

- **Naming:** `<market>.e2e.spec.ts`. Keep the `.e2e.` filename segment literal — it's what an `npm run e2e` script greps on (`npx playwright test e2e`), no separate Playwright project is needed.
- **Structure:** one `test.describe('<Journey Name> Flow @general @e2e @<flow_tag>', ...)` per journey, one `test()` inside walking the whole thing start to finish. A new market's e2e file mirrors an existing one almost exactly — copy it and change the market/currency constant at the top rather than writing from scratch.
- **Orchestration methods — the one new pattern this layer adds:** when a journey needs a resource driven through several real steps before it's usable (create → upload media → upload docs → submit for moderation, or create a draft → four staged updates → finalize), write **one orchestration method on the relevant service class**, next to that service's plain single-endpoint methods, that calls those methods in sequence internally:

```ts
async generateCarId(args: GenerateCarIdArgs) {
    // resolve make/model/trim/body-type ids
    const body = this.generateCarData({ ...resolvedIds, country, is_draft: true });
    const response = await this.createCar({ body, headers });
    const carId = response.body.id;
    await this.uploadCarMedia({ body: this.generateCarMediaData({ car_id: carId, is_draft: true }), headers });
    await this.uploadCarDocuments({ body: this.generateCarDocumentsData({ car_id: carId, is_draft: true, country }), headers });
    // ...
    return { carId, carEntity };
}
```

  Rules specific to orchestration methods:
  - Name them for the end state produced (`generateCarId`, `generateLoanId`), not the call sequence.
  - **They are the one deliberate exception to step 7's "always return the full response" rule** — return only the minimal shape the flow test needs (an id, or `{id, entity}`), since the caller only cares about the end state, not the last call's raw response.
  - Still composed entirely out of the service's existing single-endpoint methods — never raw `sendRequest` calls inlined in the orchestration method.
  - Give them their own arg type in `types.d.ts` like any other service method.
  - A long-running state check used by more than one flow (e.g. "poll until this entity reaches status X") is worth its own reusable method (`verifyXStatus`) built on the `expect.poll` pattern from step 9, rather than repeating the poll block in every flow test.
- **Step granularity is coarser here than in step 9:** each `test.step` in a flow test represents one *milestone* in the journey ("create car", "create loan to offer received"), which may fire several requests internally via an orchestration method — not one step per HTTP call.
- **Run scripts:** a general `"e2e": "npx playwright test e2e"`, plus one `"e2e:<flow_tag>": "npx playwright test e2e --grep @<flow_tag>"` per journey you want runnable on its own across all markets.

---

## Conventions that apply to every layer

- Never call `request.get/post/put/patch/delete` outside `sendRequest`.
- Never hardcode a URL outside `endpoints.json`.
- Never duplicate a fixed value across enums/constants under two names.
- Prefer composing existing service methods over writing new raw request logic, at every layer — a new test should almost always be "new endpoint entry + new/extended service method(s) + test," never a one-off script.
- Type only what you assert on or pass between steps — do not try to fully model backend response shapes.
- Keep one spec file per market for both plain and e2e tests; group by service/journey with `test.describe`, not by splitting into many small files.

## Deliverable checklist for the agent building this

- [ ] `src/config/config.ts` + `.env.sample`
- [ ] `src/types.d.ts` with request/response plumbing types
- [ ] `src/enums/enums.ts`, `src/constants/constants.ts`
- [ ] `src/api-endpoints/endpoints.json` seeded with the first service's endpoints
- [ ] `src/helper/request-helper.ts` (`sendRequest`, `replaceUrlParams`), `src/helper/functions-helper.ts`
- [ ] `src/services/base.ts` (`Base` class with generic assertions)
- [ ] `src/services/<first-service>.ts` + `src/services/index.ts` barrel export
- [ ] `src/test-data/*.json` + `src/test-data/index.ts` for the first market
- [ ] `playwright.config.ts` with `testDir: './src/tests'` and at least one project
- [ ] `src/tests/<first-market>.spec.ts` with one working test proving the full chain (endpoint → service → sendRequest → assertion) end to end
- [ ] `package.json` run scripts: all-tests, per-market, per-service-tag
- [ ] Once the above is proven: `src/tests/<first-market>.e2e.spec.ts` with one orchestration-method-backed flow, plus its `npm run e2e` / `e2e:<flow_tag>` scripts
- [ ] A `steps.md` documenting this exact process for the next person/agent to extend the framework, mirroring the structure of this prompt
