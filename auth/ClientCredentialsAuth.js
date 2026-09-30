import { BaseAuthStrategy } from './BaseAuthStrategy.js';

/**
 * Salesforce OAuth 2.0 Client Credentials Flow.
 * Recommended for modern headless and server-to-server integrations (External Client Apps).
 */
export class ClientCredentialsAuth extends BaseAuthStrategy {
    /**
     * @param {object} options
     * @param {string} options.clientId - The Connected App / External Client App Consumer Key.
     * @param {string} options.clientSecret - The Connected App / External Client App Consumer Secret.
     * @param {string} [options.salesforceInstance] - Your Salesforce My Domain URL (e.g. 'https://mycompany.my.salesforce.com').
     * @param {string} [options.instanceUrl] - Alias for salesforceInstance.
     * @param {boolean} [options.useBasicAuth=false] - Whether to pass client credentials in Basic Authorization header.
     */
    constructor(options = {}) {
        const instance = options.salesforceInstance || options.instanceUrl || 'https://login.salesforce.com';
        super(instance);

        this.clientId = options.clientId;
        this.clientSecret = options.clientSecret;
        this.useBasicAuth = Boolean(options.useBasicAuth);

        if (!this.clientId || !this.clientSecret) {
            throw new Error('ClientCredentialsAuth requires clientId and clientSecret.');
        }
    }

    /**
     * Authenticate using the OAuth 2.0 Client Credentials grant.
     * @returns {Promise<{ accessToken: string, instanceUrl: string, tokenType: string }>}
     */
    async authenticate() {
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');

        const headers = {};

        if (this.useBasicAuth) {
            const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
        } else {
            params.append('client_id', this.clientId);
            params.append('client_secret', this.clientSecret);
        }

        return this._postToken(params, headers);
    }
}

export default ClientCredentialsAuth;
