import crypto from 'node:crypto';

/**
 * Generates a PKCE code verifier and code challenge (S256).
 * @param {number} [byteLength=32] - Number of random bytes for the verifier (produces 43-128 chars in base64url).
 * @returns {{ codeVerifier: string, codeChallenge: string, method: string }}
 */
export function generatePkceChallenge(byteLength = 32) {
    const codeVerifier = crypto.randomBytes(byteLength).toString('base64url');
    const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

    return {
        codeVerifier,
        codeChallenge,
        method: 'S256',
    };
}

/**
 * Builds the Salesforce OAuth 2.0 authorization URL for the Web Server flow (with PKCE).
 * @param {object} options
 * @param {string} options.clientId - Connected App / External Client App Consumer Key.
 * @param {string} options.redirectUri - Registered callback URL.
 * @param {string} [options.codeChallenge] - SHA-256 PKCE code challenge.
 * @param {string} [options.salesforceInstance='https://login.salesforce.com'] - Login host.
 * @param {string} [options.scope='api refresh_token'] - Requested OAuth scopes.
 * @param {string} [options.state] - State parameter for CSRF mitigation.
 * @param {string} [options.prompt] - Prompt parameter (e.g. 'login', 'consent').
 * @returns {string} The full authorization URL.
 */
export function getAuthorizationUrl(options) {
    const {
        clientId,
        redirectUri,
        codeChallenge,
        salesforceInstance = 'https://login.salesforce.com',
        scope = 'api refresh_token',
        state,
        prompt,
    } = options;

    if (!clientId || !redirectUri) {
        throw new Error('getAuthorizationUrl requires clientId and redirectUri.');
    }

    const host = salesforceInstance.replace(/\/+$/, '');
    const url = new URL(`${host}/services/oauth2/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);

    if (codeChallenge) {
        url.searchParams.set('code_challenge', codeChallenge);
        url.searchParams.set('code_challenge_method', 'S256');
    }

    if (scope) {
        url.searchParams.set('scope', scope);
    }
    if (state) {
        url.searchParams.set('state', state);
    }
    if (prompt) {
        url.searchParams.set('prompt', prompt);
    }

    return url.toString();
}

/**
 * Exchange an authorization code for Salesforce OAuth 2.0 tokens (access_token, refresh_token, etc.).
 * @param {object} options
 * @param {string} options.code - Authorization code received from the callback.
 * @param {string} options.clientId - Connected App Consumer Key.
 * @param {string} options.redirectUri - Registered callback URL.
 * @param {string} [options.codeVerifier] - PKCE code verifier matching the earlier challenge.
 * @param {string} [options.clientSecret] - Consumer Secret (if required by app configuration).
 * @param {string} [options.salesforceInstance='https://login.salesforce.com'] - Login host.
 * @returns {Promise<any>} Response data containing access_token, instance_url, refresh_token, etc.
 */
export function exchangeCodeForTokens(options) {
    const {
        code,
        clientId,
        redirectUri,
        codeVerifier,
        clientSecret,
        salesforceInstance = 'https://login.salesforce.com',
    } = options;

    if (!code || !clientId || !redirectUri) {
        throw new Error('exchangeCodeForTokens requires code, clientId, and redirectUri.');
    }

    const host = salesforceInstance.replace(/\/+$/, '');
    const tokenUrl = `${host}/services/oauth2/token`;

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', clientId);
    params.append('redirect_uri', redirectUri);

    if (codeVerifier) {
        params.append('code_verifier', codeVerifier);
    }
    if (clientSecret) {
        params.append('client_secret', clientSecret);
    }

    return fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        body: params,
    }).then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.access_token) {
            const msg = data.error_description || data.error || `HTTP ${res.status}`;
            throw new Error(`Failed to exchange authorization code: ${msg}`);
        }
        return data;
    });
}
