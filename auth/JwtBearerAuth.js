import crypto from 'node:crypto';
import fs from 'node:fs';
import { BaseAuthStrategy } from './BaseAuthStrategy.js';

/**
 * Salesforce OAuth 2.0 JWT Bearer Token Flow (RFC 7523).
 * Ideal for enterprise server-to-server integrations, automated batch jobs, and CI/CD.
 * Built using Node.js native crypto with zero external dependencies.
 */
export class JwtBearerAuth extends BaseAuthStrategy {
    /**
     * @param {object} options
     * @param {string} options.clientId - Connected App / External Client App Consumer Key.
     * @param {string} options.username - Salesforce username to authenticate as.
     * @param {string|Buffer} [options.privateKey] - RSA private key in PEM format.
     * @param {string} [options.privateKeyPath] - Path to RSA private key file.
     * @param {string} [options.salesforceInstance='https://login.salesforce.com'] - Login URL (e.g. login.salesforce.com, test.salesforce.com, or My Domain).
     * @param {number} [options.expiresInMinutes=3] - Token assertion validity duration in minutes (max 5).
     */
    constructor(options = {}) {
        const instance = options.salesforceInstance || options.instanceUrl || 'https://login.salesforce.com';
        super(instance);

        this.clientId = options.clientId;
        this.username = options.username;
        this.expiresInMinutes = Math.min(Math.max(options.expiresInMinutes || 3, 1), 5);

        let privateKey = options.privateKey;
        if (!privateKey && options.privateKeyPath) {
            privateKey = fs.readFileSync(options.privateKeyPath, 'utf8');
        }
        this.privateKey = privateKey;

        if (!this.clientId || !this.username || !this.privateKey) {
            throw new Error('JwtBearerAuth requires clientId, username, and privateKey (or privateKeyPath).');
        }
    }

    /**
     * Generate an RS256-signed JWT assertion for Salesforce.
     * @returns {string} The signed JWT assertion.
     */
    generateAssertion() {
        const header = { alg: 'RS256', typ: 'JWT' };
        const nowInSeconds = Math.floor(Date.now() / 1000);
        const expInSeconds = nowInSeconds + this.expiresInMinutes * 60;

        const payload = {
            iss: this.clientId,
            sub: this.username,
            aud: this.salesforceInstance,
            exp: expInSeconds,
        };

        const base64UrlEncode = (data) =>
            Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)).toString('base64url');

        const unsignedToken = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;

        const signer = crypto.createSign('RSA-SHA256');
        signer.update(unsignedToken);
        signer.end();

        const signature = signer.sign(this.privateKey, 'base64url');
        return `${unsignedToken}.${signature}`;
    }

    /**
     * Authenticate using the OAuth 2.0 JWT Bearer flow.
     * @returns {Promise<{ accessToken: string, instanceUrl: string, tokenType: string }>}
     */
    async authenticate() {
        const assertion = this.generateAssertion();

        const params = new URLSearchParams();
        params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        params.append('assertion', assertion);

        return this._postToken(params);
    }
}

export default JwtBearerAuth;
