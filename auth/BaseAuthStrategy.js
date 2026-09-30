/**
 * Base strategy for Salesforce OAuth 2.0 authentication.
 */
export class BaseAuthStrategy {
    /**
     * @param {string} [salesforceInstance='https://login.salesforce.com']
     */
    constructor(salesforceInstance = 'https://login.salesforce.com') {
        this.salesforceInstance = salesforceInstance ? salesforceInstance.replace(/\/+$/, '') : 'https://login.salesforce.com';
        this.accessToken = null;
        this.instanceUrl = null;
        this.tokenType = 'Bearer';
        this.expiresAt = null;
    }

    /**
     * Authenticate with Salesforce and acquire an access token and instance URL.
     * @returns {Promise<{ accessToken: string, instanceUrl: string, tokenType: string }>}
     */
    async authenticate() {
        throw new Error('authenticate() must be implemented by subclass');
    }

    /**
     * Refresh the access token. Defaults to calling authenticate().
     * @returns {Promise<{ accessToken: string, instanceUrl: string, tokenType: string }>}
     */
    async refresh() {
        return this.authenticate();
    }

    /**
     * Returns true if the strategy is capable of refreshing its token.
     * @returns {boolean}
     */
    canRefresh() {
        return true;
    }

    /**
     * Get the Authorization header value for HTTP requests.
     * @returns {Promise<string>}
     */
    async getAuthorizationHeader() {
        if (!this.accessToken) {
            await this.authenticate();
        }
        return `${this.tokenType || 'Bearer'} ${this.accessToken}`;
    }

    /**
     * Helper to post form-urlencoded data to the token endpoint.
     * @protected
     * @param {URLSearchParams|Record<string, string>} params
     * @param {Record<string, string>} [extraHeaders={}]
     * @returns {Promise<any>}
     */
    async _postToken(params, extraHeaders = {}) {
        const tokenUrl = `${this.salesforceInstance}/services/oauth2/token`;
        const body = params instanceof URLSearchParams ? params : new URLSearchParams(params);

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
                ...extraHeaders,
            },
            body: body,
        });

        const data = await response.json();

        if (!response.ok || !data.access_token) {
            const errorMessage =
                data.error_description ||
                data.error ||
                `HTTP ${response.status} ${response.statusText}`;
            throw new Error(`Salesforce OAuth authentication failed: ${errorMessage}`);
        }

        return this._handleTokenResponse(data);
    }

    /**
     * Process token response data.
     * @protected
     * @param {any} data
     * @returns {{ accessToken: string, instanceUrl: string, tokenType: string }}
     */
    _handleTokenResponse(data) {
        this.accessToken = data.access_token;
        this.instanceUrl = data.instance_url ? data.instance_url.replace(/\/+$/, '') : this.salesforceInstance;
        this.tokenType = data.token_type || 'Bearer';

        if (data.issued_at && data.expires_in) {
            this.expiresAt = parseInt(data.issued_at, 10) + parseInt(data.expires_in, 10) * 1000;
        }

        return {
            accessToken: this.accessToken,
            instanceUrl: this.instanceUrl,
            tokenType: this.tokenType,
            data,
        };
    }
}

export default BaseAuthStrategy;
