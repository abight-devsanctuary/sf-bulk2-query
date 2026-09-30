import { BaseAuthStrategy } from './BaseAuthStrategy.js';

/**
 * Pre-authenticated Session / Access Token Strategy.
 * Ideal for serverless functions (AWS Lambda), web applications, or CLI scripts where
 * an access token was already acquired externally (e.g. via @salesforce/cli or API gateway).
 */
export class AccessTokenAuth extends BaseAuthStrategy {
    /**
     * @param {object} options
     * @param {string} options.accessToken - Valid Salesforce access token / session ID.
     * @param {string} options.instanceUrl - Salesforce instance URL (e.g. 'https://mycompany.my.salesforce.com').
     * @param {string} [options.tokenType='Bearer'] - Token type (usually 'Bearer').
     * @param {Function} [options.onRefresh] - Optional callback function to refresh the token when expired.
     */
    constructor(options = {}) {
        const instance = options.instanceUrl || options.salesforceInstance;
        if (!options.accessToken || !instance) {
            throw new Error('AccessTokenAuth requires accessToken and instanceUrl (or salesforceInstance).');
        }

        super(instance);
        this.accessToken = options.accessToken;
        this.instanceUrl = instance.replace(/\/+$/, '');
        this.tokenType = options.tokenType || 'Bearer';
        this.onRefresh = typeof options.onRefresh === 'function' ? options.onRefresh : null;
    }

    /**
     * Pre-authenticated strategy does not need network login unless a refresh hook is configured.
     * @returns {Promise<{ accessToken: string, instanceUrl: string, tokenType: string }>}
     */
    async authenticate() {
        return {
            accessToken: this.accessToken,
            instanceUrl: this.instanceUrl,
            tokenType: this.tokenType,
        };
    }

    /**
     * Check if this strategy can be refreshed.
     * @returns {boolean}
     */
    canRefresh() {
        return Boolean(this.onRefresh);
    }

    /**
     * Refresh the token using the optional user-provided callback.
     * @returns {Promise<{ accessToken: string, instanceUrl: string, tokenType: string }>}
     */
    async refresh() {
        if (!this.onRefresh) {
            throw new Error('Cannot refresh static AccessTokenAuth without an onRefresh callback.');
        }

        const result = await this.onRefresh();
        if (!result || !result.accessToken) {
            throw new Error('onRefresh callback must return an object with an accessToken.');
        }

        this.accessToken = result.accessToken;
        if (result.instanceUrl) {
            this.instanceUrl = result.instanceUrl.replace(/\/+$/, '');
        }
        if (result.tokenType) {
            this.tokenType = result.tokenType;
        }

        return {
            accessToken: this.accessToken,
            instanceUrl: this.instanceUrl,
            tokenType: this.tokenType,
        };
    }
}

export default AccessTokenAuth;
