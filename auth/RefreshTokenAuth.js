import { BaseAuthStrategy } from './BaseAuthStrategy.js';

/**
 * Salesforce OAuth 2.0 Refresh Token Flow.
 * Enables long-lived background jobs and services to obtain new access tokens
 * using an existing refresh token without user intervention.
 */
export class RefreshTokenAuth extends BaseAuthStrategy {
    /**
     * @param {object} options
     * @param {string} options.clientId - Connected App / External Client App Consumer Key.
     * @param {string} [options.clientSecret] - Connected App Consumer Secret (if required by app policy).
     * @param {string} options.refreshToken - The OAuth 2.0 refresh token.
     * @param {string} [options.salesforceInstance='https://login.salesforce.com'] - Salesforce login URL or My Domain.
     */
    constructor(options = {}) {
        const instance = options.salesforceInstance || options.instanceUrl || 'https://login.salesforce.com';
        super(instance);

        this.clientId = options.clientId;
        this.clientSecret = options.clientSecret;
        this.refreshToken = options.refreshToken;

        if (!this.clientId || !this.refreshToken) {
            throw new Error('RefreshTokenAuth requires clientId and refreshToken.');
        }
    }

    /**
     * Authenticate (refresh) using the OAuth 2.0 refresh_token grant.
     * @returns {Promise<{ accessToken: string, instanceUrl: string, tokenType: string }>}
     */
    async authenticate() {
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('client_id', this.clientId);
        params.append('refresh_token', this.refreshToken);

        if (this.clientSecret) {
            params.append('client_secret', this.clientSecret);
        }

        return this._postToken(params);
    }
}

export default RefreshTokenAuth;
