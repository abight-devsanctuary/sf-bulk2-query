import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
    ClientCredentialsAuth,
    JwtBearerAuth,
    RefreshTokenAuth,
    AccessTokenAuth,
    UsernamePasswordAuth,
    createAuthStrategy,
    generatePkceChallenge,
    getAuthorizationUrl,
    exchangeCodeForTokens,
} from '../auth/index.js';

test('ClientCredentialsAuth formats request correctly', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    let requestedUrl = null;
    let requestedOptions = null;

    globalThis.fetch = async (url, options) => {
        requestedUrl = url;
        requestedOptions = options;
        return {
            ok: true,
            status: 200,
            json: async () => ({
                access_token: 'test_access_token_123',
                instance_url: 'https://custom.my.salesforce.com',
                token_type: 'Bearer',
            }),
        };
    };

    const auth = new ClientCredentialsAuth({
        clientId: 'my_client_id',
        clientSecret: 'my_client_secret',
        salesforceInstance: 'https://custom.my.salesforce.com',
    });

    const result = await auth.authenticate();

    assert.equal(requestedUrl, 'https://custom.my.salesforce.com/services/oauth2/token');
    assert.equal(requestedOptions.method, 'POST');
    assert.match(requestedOptions.body.toString(), /grant_type=client_credentials/);
    assert.match(requestedOptions.body.toString(), /client_id=my_client_id/);
    assert.match(requestedOptions.body.toString(), /client_secret=my_client_secret/);

    assert.equal(result.accessToken, 'test_access_token_123');
    assert.equal(result.instanceUrl, 'https://custom.my.salesforce.com');
    assert.equal(result.tokenType, 'Bearer');
    assert.equal(await auth.getAuthorizationHeader(), 'Bearer test_access_token_123');
});

test('ClientCredentialsAuth with Basic Auth', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    let requestedHeaders = null;

    globalThis.fetch = async (url, options) => {
        requestedHeaders = options.headers;
        return {
            ok: true,
            status: 200,
            json: async () => ({
                access_token: 'basic_access_token',
                instance_url: 'https://login.salesforce.com',
                token_type: 'Bearer',
            }),
        };
    };

    const auth = new ClientCredentialsAuth({
        clientId: 'id1',
        clientSecret: 'sec1',
        useBasicAuth: true,
    });

    await auth.authenticate();
    const expectedBasic = Buffer.from('id1:sec1').toString('base64');
    assert.equal(requestedHeaders['Authorization'], `Basic ${expectedBasic}`);
});

test('JwtBearerAuth signs RS256 token and parses claims', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    // Generate real RSA key pair for testing
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    let postedAssertion = null;

    globalThis.fetch = async (url, options) => {
        const bodyStr = options.body.toString();
        const params = new URLSearchParams(bodyStr);
        postedAssertion = params.get('assertion');
        return {
            ok: true,
            status: 200,
            json: async () => ({
                access_token: 'jwt_access_token_xyz',
                instance_url: 'https://jwt.my.salesforce.com',
                token_type: 'Bearer',
            }),
        };
    };

    const auth = new JwtBearerAuth({
        clientId: 'test_consumer_key',
        username: 'admin@example.com',
        privateKey: privateKey,
        salesforceInstance: 'https://login.salesforce.com',
    });

    const assertion = auth.generateAssertion();
    assert.ok(assertion, 'Assertion should be generated');

    const [headerB64, payloadB64, sigB64] = assertion.split('.');
    assert.ok(headerB64 && payloadB64 && sigB64, 'JWT must have 3 segments');

    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    assert.equal(header.alg, 'RS256');

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    assert.equal(payload.iss, 'test_consumer_key');
    assert.equal(payload.sub, 'admin@example.com');
    assert.equal(payload.aud, 'https://login.salesforce.com');
    assert.ok(payload.exp > Math.floor(Date.now() / 1000));

    // Verify signature with public key
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    const isValid = verifier.verify(publicKey, sigB64, 'base64url');
    assert.equal(isValid, true, 'JWT signature must be valid against public key');

    const result = await auth.authenticate();
    assert.equal(result.accessToken, 'jwt_access_token_xyz');
    assert.equal(postedAssertion, assertion);
});

test('RefreshTokenAuth issues correct refresh_token request', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    let requestedBody = null;

    globalThis.fetch = async (url, options) => {
        requestedBody = options.body.toString();
        return {
            ok: true,
            status: 200,
            json: async () => ({
                access_token: 'refreshed_access_token',
                instance_url: 'https://myorg.salesforce.com',
                token_type: 'Bearer',
            }),
        };
    };

    const auth = new RefreshTokenAuth({
        clientId: 'client_123',
        clientSecret: 'secret_456',
        refreshToken: 'refresh_tok_789',
    });

    const result = await auth.authenticate();
    assert.match(requestedBody, /grant_type=refresh_token/);
    assert.match(requestedBody, /refresh_token=refresh_tok_789/);
    assert.match(requestedBody, /client_id=client_123/);
    assert.match(requestedBody, /client_secret=secret_456/);
    assert.equal(result.accessToken, 'refreshed_access_token');
});

test('AccessTokenAuth handles pre-authenticated tokens without network call', async () => {
    const auth = new AccessTokenAuth({
        accessToken: 'pre_auth_token_999',
        instanceUrl: 'https://preauth.my.salesforce.com/',
    });

    assert.equal(auth.canRefresh(), false);
    const result = await auth.authenticate();
    assert.equal(result.accessToken, 'pre_auth_token_999');
    assert.equal(result.instanceUrl, 'https://preauth.my.salesforce.com');
    assert.equal(await auth.getAuthorizationHeader(), 'Bearer pre_auth_token_999');
});

test('AccessTokenAuth supports dynamic onRefresh callback', async () => {
    let callCount = 0;
    const auth = new AccessTokenAuth({
        accessToken: 'initial_token',
        instanceUrl: 'https://org.salesforce.com',
        onRefresh: async () => {
            callCount++;
            return {
                accessToken: `updated_token_${callCount}`,
                instanceUrl: 'https://org.salesforce.com',
            };
        },
    });

    assert.equal(auth.canRefresh(), true);
    const refreshed = await auth.refresh();
    assert.equal(refreshed.accessToken, 'updated_token_1');
    assert.equal(await auth.getAuthorizationHeader(), 'Bearer updated_token_1');
});

test('UsernamePasswordAuth emits deprecation warning and handles password + token', async (t) => {
    const originalFetch = globalThis.fetch;
    const originalWarn = console.warn;
    t.after(() => {
        globalThis.fetch = originalFetch;
        console.warn = originalWarn;
    });

    let warningLogged = false;
    console.warn = (msg) => {
        if (msg.includes('Winter \'27')) {
            warningLogged = true;
        }
    };

    let requestedBody = null;
    globalThis.fetch = async (url, options) => {
        requestedBody = options.body.toString();
        return {
            ok: true,
            status: 200,
            json: async () => ({
                access_token: 'pwd_token',
                instance_url: 'https://login.salesforce.com',
                token_type: 'Bearer',
            }),
        };
    };

    const auth = new UsernamePasswordAuth({
        username: 'user@test.com',
        password: 'myPassword',
        securityToken: 'myToken',
        clientId: 'cid',
        clientSecret: 'csecret',
    });

    await auth.authenticate();
    assert.equal(warningLogged, true, 'Must log deprecation warning');
    assert.match(requestedBody, /grant_type=password/);
    assert.match(requestedBody, /password=myPasswordmyToken/);
});

test('createAuthStrategy auto-detects strategy types correctly', () => {
    const clientCreds = createAuthStrategy({
        clientId: 'id',
        clientSecret: 'sec',
    });
    assert.ok(clientCreds instanceof ClientCredentialsAuth);

    const jwt = createAuthStrategy({
        clientId: 'id',
        username: 'user',
        privateKey: 'key',
    });
    assert.ok(jwt instanceof JwtBearerAuth);

    const refresh = createAuthStrategy({
        clientId: 'id',
        refreshToken: 'rtok',
    });
    assert.ok(refresh instanceof RefreshTokenAuth);

    const direct = createAuthStrategy({
        accessToken: 'atok',
        instanceUrl: 'https://test.my.salesforce.com',
    });
    assert.ok(direct instanceof AccessTokenAuth);

    const legacy = createAuthStrategy({
        username: 'user',
        password: 'pwd',
        clientId: 'cid',
        clientSecret: 'csec',
    });
    assert.ok(legacy instanceof UsernamePasswordAuth);
});

test('PKCE challenge generation and URL builder', () => {
    const pkce = generatePkceChallenge();
    assert.ok(pkce.codeVerifier.length >= 43);
    assert.ok(pkce.codeChallenge.length >= 43);
    assert.equal(pkce.method, 'S256');

    // Verify hash of verifier matches challenge
    const calculatedChallenge = crypto
        .createHash('sha256')
        .update(pkce.codeVerifier)
        .digest('base64url');
    assert.equal(calculatedChallenge, pkce.codeChallenge);

    const authUrl = getAuthorizationUrl({
        clientId: 'my_consumer_key',
        redirectUri: 'https://localhost:3000/callback',
        codeChallenge: pkce.codeChallenge,
        salesforceInstance: 'https://custom.my.salesforce.com',
    });

    const parsed = new URL(authUrl);
    assert.equal(parsed.origin, 'https://custom.my.salesforce.com');
    assert.equal(parsed.pathname, '/services/oauth2/authorize');
    assert.equal(parsed.searchParams.get('client_id'), 'my_consumer_key');
    assert.equal(parsed.searchParams.get('redirect_uri'), 'https://localhost:3000/callback');
    assert.equal(parsed.searchParams.get('code_challenge'), pkce.codeChallenge);
    assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
});
