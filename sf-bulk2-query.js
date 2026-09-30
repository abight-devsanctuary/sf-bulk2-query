import fs from 'node:fs';
import StreamManager from './StreamManager.js';
import {
    BaseAuthStrategy,
    ClientCredentialsAuth,
    JwtBearerAuth,
    RefreshTokenAuth,
    AccessTokenAuth,
    UsernamePasswordAuth,
    createAuthStrategy,
    generatePkceChallenge,
    getAuthorizationUrl,
    exchangeCodeForTokens,
} from './auth/index.js';

export {
    BaseAuthStrategy,
    ClientCredentialsAuth,
    JwtBearerAuth,
    RefreshTokenAuth,
    AccessTokenAuth,
    UsernamePasswordAuth,
    createAuthStrategy,
    generatePkceChallenge,
    getAuthorizationUrl,
    exchangeCodeForTokens,
};

/**
 * Salesforce credentials container.
 * Supports legacy Username-Password parameters as well as static factory helpers
 * for modern OAuth 2.0 flows.
 */
export class SalesforceCredentials {
    /**
     * Legacy constructor for Username-Password flow.
     * @deprecated Salesforce is retiring the Username-Password flow in Winter '27.
     * Use SalesforceCredentials.fromClientCredentials() or .fromJwt() instead.
     */
    constructor(username, password, securityToken, clientId, clientSecret) {
        this.type = 'password';
        this.username = username;
        this.password = password;
        this.securityToken = securityToken;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }

    /**
     * Create credentials for OAuth 2.0 Client Credentials flow.
     * @param {object} options
     * @param {string} options.clientId
     * @param {string} options.clientSecret
     * @param {string} [options.salesforceInstance]
     * @param {boolean} [options.useBasicAuth]
     */
    static fromClientCredentials(options) {
        return { type: 'client_credentials', ...options };
    }

    /**
     * Create credentials for OAuth 2.0 JWT Bearer flow.
     * @param {object} options
     * @param {string} options.clientId
     * @param {string} options.username
     * @param {string|Buffer} [options.privateKey]
     * @param {string} [options.privateKeyPath]
     * @param {string} [options.salesforceInstance]
     */
    static fromJwt(options) {
        return { type: 'jwt_bearer', ...options };
    }

    /**
     * Create credentials for OAuth 2.0 Refresh Token flow.
     * @param {object} options
     * @param {string} options.clientId
     * @param {string} [options.clientSecret]
     * @param {string} options.refreshToken
     * @param {string} [options.salesforceInstance]
     */
    static fromRefreshToken(options) {
        return { type: 'refresh_token', ...options };
    }

    /**
     * Create credentials using a pre-authenticated Access Token / Session.
     * @param {object} options
     * @param {string} options.accessToken
     * @param {string} options.instanceUrl
     * @param {Function} [options.onRefresh]
     */
    static fromAccessToken(options) {
        return { type: 'access_token', ...options };
    }

    /**
     * Create credentials for legacy Username-Password flow.
     * @deprecated Retiring in Winter '27.
     */
    static fromPassword(options) {
        return { type: 'password', ...options };
    }
}

export class FetchResponse {
    // This class is used to wrap the fetch response and provide a consistent interface
    // for accessing the response status, statusText, headers, and body.
    status;
    statusText;
    headers;
    body;

    constructor(response, body) {
        this.status = response.status;
        this.statusText = response.statusText;
        const headers = {};
        if (response.headers && typeof response.headers.forEach === 'function') {
            response.headers.forEach((value, name) => {
                headers[name] = value;
            });
        }
        this.headers = headers;
        this.body = body;
    }
}

export class SalesforceBulkApiClient {
    /**
     * Initialize Salesforce Bulk API 2.0 Client.
     *
     * Supports both modern options-object initialization:
     *   new SalesforceBulkApiClient({ salesforceInstance, apiVersion, auth: { type: 'client_credentials', ... } })
     * and legacy positional arguments:
     *   new SalesforceBulkApiClient(salesforceInstance, apiVersion, creds)
     *
     * @param {string|object} [salesforceInstanceOrOptions='https://login.salesforce.com']
     * @param {string} [apiVersion='58.0']
     * @param {SalesforceCredentials|BaseAuthStrategy|object} [creds]
     */
    constructor(
        salesforceInstanceOrOptions = 'https://login.salesforce.com',
        apiVersion = '58.0',
        creds
    ) {
        this.pollTime = 10 * 1000; // 10 seconds

        let instance = 'https://login.salesforce.com';
        let version = '58.0';
        let authConfig = null;

        if (
            typeof salesforceInstanceOrOptions === 'object' &&
            salesforceInstanceOrOptions !== null
        ) {
            const opts = salesforceInstanceOrOptions;
            instance = opts.salesforceInstance || opts.instanceUrl || instance;
            version = opts.apiVersion || version;
            if (opts.pollTime) {
                this.pollTime = opts.pollTime;
            }
            authConfig = opts.auth || opts.creds || null;
        } else {
            instance = salesforceInstanceOrOptions || instance;
            version = apiVersion || version;
            authConfig = creds || null;
        }

        this._salesforceInstance = instance.replace(/\/+$/, '');
        this._apiVersion = version;

        this._authStrategy = null;
        this._accessToken = null;
        this._instanceUrl = null;
        this._tokenType = null;

        // Maintain legacy property references
        this._username = null;
        this._password = null;
        this._securityToken = null;
        this._clientId = null;
        this._clientSecret = null;

        if (authConfig) {
            this._configureAuth(authConfig);
        }
    }

    /**
     * Configures the internal authentication strategy and syncs properties.
     * @private
     */
    _configureAuth(authConfig) {
        this._authStrategy = createAuthStrategy(authConfig, this._salesforceInstance);

        // Sync legacy credential fields if present
        if (this._authStrategy.username) this._username = this._authStrategy.username;
        if (this._authStrategy.password) this._password = this._authStrategy.password;
        if (this._authStrategy.securityToken) this._securityToken = this._authStrategy.securityToken;
        if (this._authStrategy.clientId) this._clientId = this._authStrategy.clientId;
        if (this._authStrategy.clientSecret) this._clientSecret = this._authStrategy.clientSecret;

        // If pre-authenticated (AccessTokenAuth), immediately populate token and instanceUrl
        if (this._authStrategy.accessToken) {
            this._accessToken = this._authStrategy.accessToken;
            this._instanceUrl = this._authStrategy.instanceUrl;
            this._tokenType = this._authStrategy.tokenType || 'Bearer';
        }
    }

    /**
     * Login to Salesforce using the configured OAuth authentication strategy.
     * @param {SalesforceCredentials|BaseAuthStrategy|object} [creds] - Optional credentials to use.
     * @throws {Error} If credentials are missing or authentication fails.
     * @returns {Promise<{ accessToken: string, instanceUrl: string, tokenType: string }>}
     */
    async login(creds) {
        if (creds) {
            this._configureAuth(creds);
        }

        if (!this._authStrategy) {
            throw new Error(
                'No credentials provided. Please pass authentication credentials to login() or the constructor.'
            );
        }

        const result = await this._authStrategy.authenticate();
        this._accessToken = result.accessToken;
        this._instanceUrl = result.instanceUrl ? result.instanceUrl.replace(/\/+$/, '') : this._instanceUrl;
        this._tokenType = result.tokenType || 'Bearer';

        return result;
    }

    /**
     * Get the Authorization header, authenticating first if needed.
     * @returns {Promise<string>}
     */
    async _getAuthorizationHeader() {
        if (!this._tokenType || !this._accessToken) {
            await this.login();
            if (!this._tokenType || !this._accessToken) {
                throw new Error('Failed to obtain access token.');
            }
        }
        return `${this._tokenType} ${this._accessToken}`;
    }

    /**
     * Wrapper for authenticated fetch requests with automatic 401 retry and token refresh.
     * @private
     */
    async _fetchWithAuth(url, options = {}, isRetry = false) {
        const authHeader = await this._getAuthorizationHeader();
        const headers = {
            ...options.headers,
            Authorization: authHeader,
        };

        const response = await fetch(url, {
            ...options,
            headers,
        });

        // If unauthorized and strategy can refresh, refresh token and retry once
        if (
            response.status === 401 &&
            !isRetry &&
            this._authStrategy &&
            typeof this._authStrategy.canRefresh === 'function' &&
            this._authStrategy.canRefresh()
        ) {
            try {
                const refreshed = await this._authStrategy.refresh();
                this._accessToken = refreshed.accessToken;
                if (refreshed.instanceUrl) {
                    this._instanceUrl = refreshed.instanceUrl.replace(/\/+$/, '');
                }
                this._tokenType = refreshed.tokenType || 'Bearer';

                return this._fetchWithAuth(url, options, true);
            } catch (refreshErr) {
                // If refresh fails, return original 401 response
                return response;
            }
        }

        return response;
    }

    /**
     * Start a bulk query job.
     * @param {string} query - The SOQL query string.
     * @param {boolean} [allRows=false] - Whether to include deleted and archived records.
     * @returns {Promise<FetchResponse>} The response object containing status, statusText, headers, and body.
     */
    async startBulkQuery(query, allRows = false) {
        if (!this._instanceUrl) {
            await this._getAuthorizationHeader();
        }

        const response = await this._fetchWithAuth(
            `${this._instanceUrl}/services/data/v${this._apiVersion}/jobs/query`,
            {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    operation: allRows === true ? 'queryAll' : 'query',
                    query: query,
                }),
            }
        );

        const body = await response.json();
        return new FetchResponse(response, body);
    }

    /**
     * Check the status of a bulk query job.
     * @param {string} jobId - Salesforce Bulk API Job Id.
     * @returns {Promise<FetchResponse>}
     */
    async checkJobStatus(jobId) {
        if (!this._instanceUrl) {
            await this._getAuthorizationHeader();
        }

        const response = await this._fetchWithAuth(
            `${this._instanceUrl}/services/data/v${this._apiVersion}/jobs/query/${jobId}`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
            }
        );

        const data = await response.json();
        return new FetchResponse(response, data);
    }

    /**
     * Poll job status until it reaches JobComplete, Failed, or Aborted.
     * @param {string} jobId - Salesforce Bulk API Job Id.
     * @param {number} [pollTime=null] - Polling interval in milliseconds.
     * @returns {Promise<string>} The completed job state.
     */
    async pollJobTillComplete(jobId, pollTime = null) {
        const interval = pollTime || this.pollTime;

        while (true) {
            const { body } = await this.checkJobStatus(jobId);
            const jobState = body.state;

            if (jobState === 'Failed' || jobState === 'Aborted') {
                const errorMessage = body.errorMessage ? `: ${body.errorMessage}` : '.';
                throw new Error(`Job ${jobId} failed or was aborted${errorMessage}`);
            } else if (jobState === 'JobComplete') {
                return jobState;
            }

            await new Promise((resolve) => setTimeout(resolve, interval));
        }
    }

    async _getJobResults_AsRequest(jobId, locator = null, maxRecords = null) {
        if (locator === 'null') {
            locator = null;
        }

        if (!this._instanceUrl) {
            await this._getAuthorizationHeader();
        }

        let url = `${this._instanceUrl}/services/data/v${this._apiVersion}/jobs/query/${jobId}/results`;
        const queryParams = new URLSearchParams();
        if (locator) queryParams.set('locator', locator);
        if (maxRecords) queryParams.set('maxRecords', maxRecords);

        const queryString = queryParams.toString();
        if (queryString) {
            url += `?${queryString}`;
        }

        return this._fetchWithAuth(url, {
            method: 'GET',
            headers: {
                Accept: 'text/csv',
                'Accept-Encoding': 'gzip',
            },
        });
    }

    async _writeResultsToFile(request, filename = './results.csv') {
        const dest = fs.createWriteStream(filename);

        // Native Node 18+ fetch returns a WHATWG ReadableStream on response.body
        // If it's a web stream (Node 18+ global fetch), convert to Node stream via Readable.fromWeb
        if (request.body && typeof request.body.pipe !== 'function') {
            const { Readable } = await import('node:stream');
            const nodeStream = Readable.fromWeb(request.body);
            await new Promise((resolve, reject) => {
                nodeStream.pipe(dest);
                dest.on('close', resolve);
                dest.on('error', reject);
            });
        } else {
            await new Promise((resolve, reject) => {
                request.body.pipe(dest);
                dest.on('close', resolve);
                dest.on('error', reject);
            });
        }
    }

    async _poc__getJobResults_asFile(
        jobId,
        locator = null,
        maxRecords = null,
        filename = './results.csv'
    ) {
        const response = await this._getJobResults_AsRequest(jobId, locator, maxRecords);
        await this._writeResultsToFile(response, filename);
    }

    async _poc__getJobResultPages(jobId) {
        if (!this._instanceUrl) {
            await this._getAuthorizationHeader();
        }

        const response = await this._fetchWithAuth(
            `${this._instanceUrl}/services/data/v${this._apiVersion}/jobs/query/${jobId}/resultPages`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
            }
        );

        return response.json();
    }

    async _retrieveJobResultsIntoPipe(
        dataPipe,
        jobId,
        locator = null,
        pageSize = null
    ) {
        const resp = await this._getJobResults_AsRequest(jobId, locator, pageSize);

        let bodyStream = resp.body;
        if (bodyStream && typeof bodyStream.pipe !== 'function') {
            const { Readable } = await import('node:stream');
            bodyStream = Readable.fromWeb(bodyStream);
        }

        await dataPipe.addToStream(
            bodyStream.pipe(dataPipe.removeCsvHeaders())
        );

        const nextLocator = resp.headers.get('Sforce-Locator');
        if (nextLocator && nextLocator !== 'null') {
            return this._retrieveJobResultsIntoPipe(
                dataPipe,
                jobId,
                nextLocator,
                pageSize
            );
        } else {
            await dataPipe.closeStream();
        }
    }

    async retrieveJobResults_sequentialStream(jobId, pageSize = null) {
        const dataPipe = new StreamManager();

        const resp = await this._getJobResults_AsRequest(jobId, null, pageSize);

        let bodyStream = resp.body;
        if (bodyStream && typeof bodyStream.pipe !== 'function') {
            const { Readable } = await import('node:stream');
            bodyStream = Readable.fromWeb(bodyStream);
        }

        dataPipe.addToStream(bodyStream).then(() => {
            return this._retrieveJobResultsIntoPipe(
                dataPipe,
                jobId,
                resp.headers.get('Sforce-Locator'),
                pageSize
            );
        });

        return dataPipe.getInternalStream();
    }

    async bulkQueryAsStream(queryString, options = {}) {
        const { allRows = false, pageSize = null } = options;
        const response = await this.startBulkQuery(queryString, allRows);
        if (response.status !== 200) {
            throw new Error(`Failed to execute query: ${response.statusText}`);
        }
        const jobId = response.body.id;
        await this.pollJobTillComplete(jobId);
        return this.retrieveJobResults_sequentialStream(jobId, pageSize);
    }

    async bulkQueryToFile(queryString, filename, options = {}) {
        const resp = await this.bulkQueryAsStream(queryString, options);
        await this._writeResultsToFile({ body: resp }, filename);
    }

    /**
     * Execute a bulk query and return the results as a string.
     * @param {string} queryString - The SOQL query string.
     * @param {object} [options={}] - Options for the query (e.g. allRows, pageSize).
     * @returns {Promise<string>} The response body as a string.
     */
    async bulkQueryAsData(queryString, options = {}) {
        const response = await this.bulkQueryAsStream(queryString, options);
        let data = '';
        await new Promise((resolve, reject) => {
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                resolve();
            });
            response.on('error', (error) => {
                reject(error);
            });
        });
        return data;
    }
}

export default SalesforceBulkApiClient;
