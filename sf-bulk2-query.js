import fetch from "node-fetch";
import fs from "fs";
import StreamManager from "./StreamManager.js";

export class SalesforceCredentials {
    constructor(username, password, securityToken, clientId, clientSecret) {
        this.username = username;
        this.password = password;
        this.securityToken = securityToken;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }
}

class FetchResponse {
    // This class is used to wrap the fetch response and provide a consistent interface
    // for accessing the response status, statusText, headers, and body.
    // It is not a standard part of the fetch API, but is used here for convenience.
    status;
    statusText;
    headers;
    body;

    constructor(response, body) {
        this.status = response.status;
        this.statusText = response.statusText;
        const headers = {};
        response.headers.forEach((value, name) => {
            headers[name] = value;
        });
        this.headers = headers;
        this.body = body;
    }
}

export class SalesforceBulkApiClient {
    constructor(
        salesforceInstance = "https://login.salesforce.com",
        apiVersion = "58.0",
        creds
    ) {
        this.pollTime = 10 * 1000; // 10 seconds

        this._salesforceInstance = salesforceInstance;
        this._apiVersion = apiVersion;
        this._username = creds?.username;
        this._password = creds?.password;
        this._securityToken = creds?.securityToken;
        this._clientId = creds?.clientId;
        this._clientSecret = creds?.clientSecret;
        this._accessToken = null;
        this._instanceUrl = null;
        this._tokenType = null;
    }

    /*
     * Login to Salesforce using the OAuth 2.0 Password Grant Type.
     * @param {SalesforceCredentials} creds (Optional)
     * @throws {Error} If any of the required credentials are missing or if the login fails.
     * @returns {Promise<void>} Resolves when login is successful.
     */
    async login(creds) {
        // Validate that credentials are set (basic check)
        this._username = creds?.username ? creds.username : this._username;
        this._password = creds?.password ? creds.password : this._password;
        this._securityToken = creds?.securityToken
            ? creds.securityToken
            : this._securityToken;
        this._clientId = creds?.clientId ? creds.clientId : this._clientId;
        this._clientSecret = creds?.clientSecret
            ? creds.clientSecret
            : this._clientSecret;

        if (
            !this._username ||
            !this._password ||
            !this._securityToken ||
            !this._clientId ||
            !this._clientSecret
        ) {
            throw new Error(
                "Username, password, securityToken, clientId, and clientSecret are all required."
            );
        }

        // Construct the full token endpoint URL
        const tokenUrl = `${this._salesforceInstance}/services/oauth2/token`;

        // Concatenate password and security token as required by Salesforce password grant type
        const fullPassword = this._password + this._securityToken;

        // Prepare the request body (form-urlencoded)
        const params = new URLSearchParams();
        params.append("grant_type", "password");
        params.append("client_id", this._clientId);
        params.append("client_secret", this._clientSecret);
        params.append("username", this._username);
        params.append("password", fullPassword);

        try {
            // Make the POST request to the token endpoint
            const response = await fetch(tokenUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: params,
            });

            // Parse the JSON response body
            const data = await response.json();

            // Check if the request was successful (status code 200)
            if (response.ok && data.access_token) {
                this._accessToken = data.access_token;
                this._instanceUrl = data.instance_url;
                this._tokenType = data.token_type; // Usually 'Bearer'
            } else {
                // Handle errors (e.g., invalid credentials, invalid client id)
                const errorMessage =
                    data.error_description ||
                    data.error ||
                    `HTTP error! status: ${response.status}`;
                throw new Error(`Salesforce login failed: ${errorMessage}`);
            }
        } catch (error) {
            throw error;
        }
    }

    async _getAuthorizationHeader() {
        if (!this._tokenType || !this._accessToken) {
            await this.login();
            if (!this._tokenType || !this._accessToken) {
                throw new Error("Failed to obtain access token.");
            }
        }
        return `${this._tokenType} ${this._accessToken}`;
    }

    /*
     * Start a bulk query job.
     * @param {string} query - The SOQL query string.
     * @param {boolean} allRows - Whether to include deleted and archived records.
     * @returns {Promise<FetchResponse>} The response object containing status, statusText, headers, and body.
     * @description This method initiates a bulk query job in Salesforce and returns the job ID via body.id.
     */
    async startBulkQuery(query, allRows) {
        const response = await fetch(
            `${this._instanceUrl}/services/data/v${this._apiVersion}/jobs/query`,
            {
                method: "POST",
                headers: {
                    Authorization: await this._getAuthorizationHeader(),
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    operation: allRows === true ? "query" : "queryAll",
                    query: query,
                }),
            }
        );

        const body = await response.json();

        return new FetchResponse(response, body);
    }
    //https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/query_get_one_job.htm
    async checkJobStatus(jobId) {
        try {
            const response = await fetch(
                `${this._instanceUrl}/services/data/v${this._apiVersion}/jobs/query/${jobId}`,
                {
                    method: "GET",
                    headers: {
                        Authorization: await this._getAuthorizationHeader(),
                        Accept: "application/json",
                    },
                }
            );

            const data = await response.json();
            // return data;
            return new FetchResponse(response, data);
        } catch (error) {
            throw error;
        }
    }

    // TODO Need to make this not recursive as JS does not have tail call optimization
    async pollJobTillComplete(jobId, pollTime = null) {
        try {
            let { body } = await this.checkJobStatus(jobId);
            let jobState = body.state;
            if (jobState === "Failed" || jobState === "Aborted") {
                throw new Error(`Job ${jobId} failed or was aborted.`);
            } else if (jobState !== "JobComplete") {
                await new Promise((resolve) =>
                    setTimeout(resolve, pollTime || this.pollTime)
                );
                return this.pollJobTillComplete(jobId);
            }
            return jobState;
        } catch (error) {
            throw error;
        }
    }

    // async getJobResults() {}

    async _getJobResults_AsRequest(jobId, locator = null, maxRecords = null) {
        try {
            let url = `${this._instanceUrl}/services/data/v${this._apiVersion}/jobs/query/${jobId}/results`;
            if (locator || maxRecords) {
                url += `?`;
                if (locator) {
                    url += `locator=${locator}`;
                }
                if (maxRecords) {
                    if (locator) {
                        url += `&`;
                    }
                    url += `maxRecords=${maxRecords}`;
                }
            }
            return fetch(url, {
                method: "GET",
                headers: {
                    Authorization: await this._getAuthorizationHeader(),
                    Accept: "text/csv",
                    "Accept-Encoding": "gzip",
                },
            });
        } catch (error) {
            throw error;
        }
    }

    async _writeResultsToFile(request, filename = "./results.csv") {
        // Probably should be private
        let filewriter = new Promise((resolve, reject) => {
            const dest = fs.createWriteStream(filename);
            request.body.pipe(dest);
            dest.on("close", () => {
                resolve();
            });
            dest.on("error", (e) => {
                reject(e);
            });
        });
        await filewriter;
    }

    async _poc__getJobResults_asFile(
        jobId,
        locator = null,
        maxRecords = null,
        filename = "./results.csv"
    ) {
        try {
            let response = await this._getJobResults_AsRequest(
                jobId,
                locator,
                maxRecords
            );
            await this._writeResultsToFile(response, filename);

            // const data = await response.text();
            // return data;
        } catch (error) {
            throw error;
        }
    }

    async _poc__getJobResultPages(jobId) {
        try {
            const response = await fetch(
                `${this._instanceUrl}/services/data/v${this._apiVersion}/jobs/query/${jobId}/resultPages`,
                {
                    method: "GET",
                    headers: {
                        Authorization: await this._getAuthorizationHeader(),
                        Accept: "application/json",
                    },
                }
            );

            const data = await response.json();
            return data;
        } catch (error) {
            throw error;
        }
    }

    async _retrieveJobResultsIntoPipe(
        dataPipe,
        jobId,
        locator = null,
        pageSize = null
    ) {
        try {
            let resp = await this._getJobResults_AsRequest(
                jobId,
                locator,
                pageSize
            );
            await dataPipe.addToStream(
                resp.body.pipe(dataPipe.removeCsvHeaders())
            );
            let nextLocator = resp.headers.get("Sforce-Locator");
            if (nextLocator && nextLocator !== "null") {
                return this._retrieveJobResultsIntoPipe(
                    dataPipe,
                    jobId,
                    nextLocator,
                    pageSize
                );
            } else {
                dataPipe.closeStream();
                return;
            }
        } catch (error) {
            throw error;
        }
    }

    async retrieveJobResults_sequentialStream(jobId, pageSize = null) {
        try {
            let dataPipe = new StreamManager();

            let resp = await this._getJobResults_AsRequest(
                jobId,
                null,
                pageSize
            );
            dataPipe.addToStream(resp.body).then(() => {
                return this._retrieveJobResultsIntoPipe(
                    dataPipe,
                    jobId,
                    resp.headers.get("Sforce-Locator"),
                    pageSize
                );
            });
            return dataPipe.getInternalStream();
        } catch (error) {
            throw error;
        }
    }

    async bulkQueryAsStream(queryString, options = {}) {
        // Destructure the options object, providing default values
        const { allRows = false, pageSize = null } = options;
        try {
            const response = await this.startBulkQuery(queryString, allRows);
            if (response.status !== 200) {
                throw new Error(
                    `Failed to execute query: ${response.statusText}`
                );
            }
            let job_id = response.body.id;
            await this.pollJobTillComplete(job_id);
            return this.retrieveJobResults_sequentialStream(job_id, pageSize);
        } catch (error) {
            throw error;
        }
    }

    async bulkQueryToFile(queryString, filename, options) {
        let resp = await this.bulkQueryAsStream(queryString, options);
        await this._writeResultsToFile({ body: resp }, filename);
    }

    // TODO update this to return as csv parsed into JSON
    /*
     * Execute a bulk query and return the results as a string.
     * Warning: This method can cause memory issues/crash if the result set is large.
     * @param {string} queryString - The SOQL query string.
     * @param {object} options - Options for the query (e.g., allRows, pageSize).
     * @returns {Promise<string>} The response body as a string.
     */
    async bulkQueryAsData(queryString, options = {}) {
        const response = await this.bulkQueryAsStream(queryString, options);
        const data = "";
        await new Promise((resolve, reject) => {
            response.on("data", (chunk) => {
                data += chunk;
            });
            response.on("end", () => {
                resolve();
            });
            response.on("error", (error) => {
                reject(error);
            });
        });
        return data; // TODO update this to return as csv parsed into JSON
    }
}

export default SalesforceBulkApiClient;
