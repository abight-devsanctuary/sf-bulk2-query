import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SalesforceBulkApiClient,
    SalesforceCredentials,
} from '../sf-bulk2-query.js';

test('Legacy constructor and credentials backwards compatibility', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async (url, options) => {
        return {
            ok: true,
            status: 200,
            json: async () => ({
                access_token: 'legacy_access_token',
                instance_url: 'https://legacy.my.salesforce.com',
                token_type: 'Bearer',
            }),
        };
    };

    const creds = new SalesforceCredentials(
        'user@example.com',
        'pass123',
        'tokenXYZ',
        'clientIdABC',
        'clientSecret123'
    );

    const client = new SalesforceBulkApiClient('https://login.salesforce.com', '59.0', creds);
    const authResult = await client.login();

    assert.equal(authResult.accessToken, 'legacy_access_token');
    assert.equal(client._accessToken, 'legacy_access_token');
    assert.equal(client._instanceUrl, 'https://legacy.my.salesforce.com');
    assert.equal(client._apiVersion, '59.0');
});

test('Modern options constructor with ClientCredentialsAuth', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async (url, options) => {
        return {
            ok: true,
            status: 200,
            json: async () => ({
                access_token: 'cc_token_123',
                instance_url: 'https://modern.my.salesforce.com',
                token_type: 'Bearer',
            }),
        };
    };

    const client = new SalesforceBulkApiClient({
        salesforceInstance: 'https://modern.my.salesforce.com',
        apiVersion: '60.0',
        auth: {
            type: 'client_credentials',
            clientId: 'client_key',
            clientSecret: 'client_sec',
        },
    });

    const result = await client.login();
    assert.equal(result.accessToken, 'cc_token_123');
    assert.equal(client._instanceUrl, 'https://modern.my.salesforce.com');
    assert.equal(client._apiVersion, '60.0');
});

test('Pre-authenticated access token does not require manual login() call', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    let requestedHeaders = null;
    let requestedUrl = null;

    globalThis.fetch = async (url, options) => {
        requestedUrl = url;
        requestedHeaders = options.headers;
        return {
            ok: true,
            status: 200,
            json: async () => ({
                id: '750xx0000000001AAA',
                state: 'UploadComplete',
            }),
        };
    };

    const client = new SalesforceBulkApiClient({
        auth: {
            type: 'access_token',
            accessToken: 'direct_token_abc',
            instanceUrl: 'https://direct.my.salesforce.com',
        },
    });

    const resp = await client.startBulkQuery('SELECT Id FROM Account');
    assert.equal(requestedUrl, 'https://direct.my.salesforce.com/services/data/v58.0/jobs/query');
    assert.equal(requestedHeaders['Authorization'], 'Bearer direct_token_abc');
    assert.equal(resp.body.id, '750xx0000000001AAA');
});

test('Automatic 401 retry interceptor refreshes token and retries request', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    let tokenRefreshCalls = 0;
    let queryCalls = 0;

    globalThis.fetch = async (url, options) => {
        if (url.includes('/services/oauth2/token')) {
            tokenRefreshCalls++;
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    access_token: `refreshed_token_v${tokenRefreshCalls}`,
                    instance_url: 'https://refreshable.my.salesforce.com',
                    token_type: 'Bearer',
                }),
            };
        }

        if (url.includes('/jobs/query')) {
            queryCalls++;
            if (queryCalls === 1) {
                // First call returns 401 Unauthorized
                return {
                    ok: false,
                    status: 401,
                    statusText: 'Unauthorized',
                    json: async () => [{ message: 'Session expired', errorCode: 'INVALID_SESSION_ID' }],
                };
            }
            // Second call succeeds with refreshed token
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Map(),
                json: async () => ({
                    id: 'job_after_refresh_123',
                    state: 'JobComplete',
                }),
            };
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
    };

    const client = new SalesforceBulkApiClient({
        salesforceInstance: 'https://refreshable.my.salesforce.com',
        auth: {
            type: 'client_credentials',
            clientId: 'id',
            clientSecret: 'secret',
        },
    });

    // Initial login
    await client.login();
    assert.equal(client._accessToken, 'refreshed_token_v1');

    // Query triggers 401, which auto-refreshes and retries
    const resp = await client.startBulkQuery('SELECT Id FROM Contact');
    assert.equal(tokenRefreshCalls, 2, 'Token endpoint should have been called again on 401');
    assert.equal(queryCalls, 2, 'Query endpoint should have been retried after token refresh');
    assert.equal(resp.body.id, 'job_after_refresh_123');
    assert.equal(client._accessToken, 'refreshed_token_v2');
});

test('pollJobTillComplete loops until JobComplete and throws on Failed', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    let checkCount = 0;
    globalThis.fetch = async (url, options) => {
        checkCount++;
        const state = checkCount < 3 ? 'InProgress' : 'JobComplete';
        return {
            ok: true,
            status: 200,
            json: async () => ({
                id: 'job_poll_test',
                state,
            }),
        };
    };

    const client = new SalesforceBulkApiClient({
        pollTime: 10,
        auth: {
            accessToken: 'dummy',
            instanceUrl: 'https://test.my.salesforce.com',
        },
    });

    const finalState = await client.pollJobTillComplete('job_poll_test', 10);
    assert.equal(finalState, 'JobComplete');
    assert.equal(checkCount, 3);
});
