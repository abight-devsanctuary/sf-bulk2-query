import { BaseAuthStrategy } from './BaseAuthStrategy.js';

let deprecationWarningLogged = false;

/**
 * Legacy Salesforce OAuth 2.0 Username-Password Flow (grant_type=password).
 * @deprecated Salesforce has deprecated this flow and is retiring it in Winter '27.
 * Use ClientCredentialsAuth or JwtBearerAuth instead.
 */
export class UsernamePasswordAuth extends BaseAuthStrategy {
    /**
     * @param {object} options
     * @param {string} options.username - Salesforce username.
     * @param {string} options.password - Salesforce password.
     * @param {string} [options.securityToken=''] - Salesforce security token.
     * @param {string} options.clientId - Connected App Consumer Key.
     * @param {string} options.clientSecret - Connected App Consumer Secret.
     * @param {string} [options.salesforceInstance='https://login.salesforce.com'] - Salesforce login URL.
     */
    constructor(options = {}) {
        const instance = options.salesforceInstance || options.instanceUrl || 'https://login.salesforce.com';
        super(instance);

        this.username = options.username;
        this.password = options.password;
        this.securityToken = options.securityToken || '';
        this.clientId = options.clientId;
        this.clientSecret = options.clientSecret;

        if (!this.username || !this.password || !this.clientId || !this.clientSecret) {
            throw new Error(
                'UsernamePasswordAuth requires username, password, clientId, and clientSecret.'
            );
        }
    }

    /**
     * Authenticate using the OAuth 2.0 username-password grant.
     * @returns {Promise<{ accessToken: string, instanceUrl: string, tokenType: string }>}
     */
    async authenticate() {
        if (!deprecationWarningLogged) {
            console.warn(
                "[sf-bulk2-query] WARNING: Salesforce is retiring the OAuth 2.0 Username-Password flow in Winter '27 " +
                "(and SOAP login in Summer '27). Please migrate to modern OAuth flows such as Client Credentials or JWT Bearer."
            );
            deprecationWarningLogged = true;
        }

        const fullPassword = this.securityToken ? `${this.password}${this.securityToken}` : this.password;

        const params = new URLSearchParams();
        params.append('grant_type', 'password');
        params.append('client_id', this.clientId);
        params.append('client_secret', this.clientSecret);
        params.append('username', this.username);
        params.append('password', fullPassword);

        return this._postToken(params);
    }
}

export default UsernamePasswordAuth;
