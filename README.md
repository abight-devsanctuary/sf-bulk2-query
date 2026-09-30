# SF-Bulk2-Query

A lightweight, zero-dependency Node.js module for executing SOQL queries using the Salesforce Bulk API 2.0.

Built for Node.js 18+ using native `fetch`, `crypto`, and stream utilities.

---

> [!WARNING]
> **Salesforce Authentication Deprecation Notice**
> * **SOAP API `login()`** is disabled by default in new orgs and will be permanently retired in **Summer '27**.
> * **OAuth 2.0 Username-Password Flow (`grant_type=password`)** is disabled by default in new Connected Apps and will be retired in **Winter '27**.
>
> We strongly recommend migrating to the **OAuth 2.0 Client Credentials Flow** or **JWT Bearer Flow**. Legacy username-password logins remain supported for backward compatibility, but emit a deprecation warning at runtime.

---

## Features

- **Modern OAuth 2.0 Support**:
  - **Client Credentials Flow** (Recommended for server-to-server / ETL)
  - **JWT Bearer Token Flow** (RFC 7523 - Enterprise headless & CI/CD)
  - **Direct Access Token Injection** (AWS Lambda, Next.js, `@salesforce/cli`)
  - **Refresh Token Flow** (Long-running background workers)
  - **PKCE & Web Server Flow Utilities** (Interactive web/CLI apps)
  - **Legacy Username-Password Flow** (Retained with deprecation warning)
- **Automatic Token Refresh**: Seamlessly refreshes expired session tokens on `401 Unauthorized` during long-running bulk queries without failing the job.
- **Zero External Dependencies**: Pure Node.js 18+ utilizing native `fetch`, `node:crypto`, and `node:stream`.
- **Flexible Results Handling**: Retrieve Bulk API 2.0 results as a sequential stream, write directly to disk, or read as parsed data.

---

## Installation

```bash
npm install sf-bulk2-query
```

*Requirements: Node.js 18.0.0 or higher.*

---

## Quick Start (Client Credentials Flow - Recommended)

The **Client Credentials Flow** is the modern Salesforce standard for headless, backend, and ETL integrations via **External Client Apps**.

```javascript
import SalesforceBulkApiClient from 'sf-bulk2-query';

const client = new SalesforceBulkApiClient({
  salesforceInstance: 'https://mycompany.my.salesforce.com', // Your My Domain URL
  apiVersion: '60.0',
  auth: {
    type: 'client_credentials',
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
  },
});

// Download accounts to a local CSV file
await client.bulkQueryToFile('SELECT Id, Name, Industry FROM Account', './accounts.csv');
```

---

## Authentication Methods

### 1. OAuth 2.0 Client Credentials Flow
Best for server-to-server background services and automated batch jobs.

```javascript
import SalesforceBulkApiClient from 'sf-bulk2-query';

const client = new SalesforceBulkApiClient({
  salesforceInstance: 'https://mycompany.my.salesforce.com',
  auth: {
    type: 'client_credentials',
    clientId: 'YOUR_EXTERNAL_CLIENT_APP_CLIENT_ID',
    clientSecret: 'YOUR_EXTERNAL_CLIENT_APP_CLIENT_SECRET',
    // Optional: useBasicAuth: true to pass credentials in the Authorization header
  },
});

await client.login();
```

*Salesforce Setup*: Create an **External Client App** in Setup > App Manager. Enable the Client Credentials Flow and assign a configured Run-As integration user with required permissions.

---

### 2. OAuth 2.0 JWT Bearer Token Flow (RFC 7523)
Best for enterprise automated integrations and CI/CD pipelines using digital certificates.

```javascript
import fs from 'node:fs';
import SalesforceBulkApiClient from 'sf-bulk2-query';

const privateKey = fs.readFileSync('./salesforce.key', 'utf8');

const client = new SalesforceBulkApiClient({
  salesforceInstance: 'https://login.salesforce.com', // or test.salesforce.com or My Domain
  auth: {
    type: 'jwt_bearer',
    clientId: process.env.SF_CLIENT_ID,
    username: 'integration.user@example.com',
    privateKey: privateKey, // PEM string, Buffer, or use `privateKeyPath: './salesforce.key'`
  },
});

await client.login();
```

*Salesforce Setup*: In Setup > App Manager, create a Connected App or External Client App. Check "Use digital signatures", upload your public certificate (`.crt`), and set OAuth policy to "Admin approved users are pre-authorized".

---

### 3. Pre-Authenticated Access Token (Direct Session)
Best for serverless functions (AWS Lambda), web applications, or CLI scripts where the access token was already acquired externally (e.g. from `@salesforce/cli`).

```javascript
import SalesforceBulkApiClient from 'sf-bulk2-query';

const client = new SalesforceBulkApiClient({
  auth: {
    type: 'access_token',
    accessToken: 'YOUR_ACCESS_TOKEN_OR_SESSION_ID',
    instanceUrl: 'https://mycompany.my.salesforce.com',
  },
});

// No need to call client.login()!
const stream = await client.bulkQueryAsStream('SELECT Id, Name FROM Contact');
```

You can also provide an `onRefresh` callback to dynamically re-fetch tokens:
```javascript
const client = new SalesforceBulkApiClient({
  auth: {
    type: 'access_token',
    accessToken: currentToken,
    instanceUrl: 'https://mycompany.my.salesforce.com',
    onRefresh: async () => {
      const refreshed = await fetchTokenFromSecretManager();
      return { accessToken: refreshed.token };
    },
  },
});
```

---

### 4. OAuth 2.0 Refresh Token Flow
Best for long-running daemons that have already received an offline refresh token from an initial user authorization.

```javascript
import SalesforceBulkApiClient from 'sf-bulk2-query';

const client = new SalesforceBulkApiClient({
  salesforceInstance: 'https://login.salesforce.com',
  auth: {
    type: 'refresh_token',
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET, // optional depending on app settings
    refreshToken: process.env.SF_REFRESH_TOKEN,
  },
});

await client.login();
```

---

### 5. Authorization Code Flow with PKCE Utilities
For web apps or CLI tools requiring user interaction, this package exports PKCE generation and token exchange helpers:

```javascript
import {
  generatePkceChallenge,
  getAuthorizationUrl,
  exchangeCodeForTokens,
} from 'sf-bulk2-query';

// Step 1: Generate PKCE challenge
const { codeVerifier, codeChallenge } = generatePkceChallenge();

// Step 2: Build the authorization URL and redirect the user
const authUrl = getAuthorizationUrl({
  clientId: 'YOUR_CLIENT_ID',
  redirectUri: 'https://localhost:3000/callback',
  codeChallenge: codeChallenge,
});
console.log('Open this URL to authorize:', authUrl);

// Step 3: In your callback handler, exchange code for tokens
const tokenResponse = await exchangeCodeForTokens({
  code: callbackCode,
  clientId: 'YOUR_CLIENT_ID',
  redirectUri: 'https://localhost:3000/callback',
  codeVerifier: codeVerifier,
});

// Step 4: Initialize client with returned session
const client = new SalesforceBulkApiClient({
  auth: {
    accessToken: tokenResponse.access_token,
    instanceUrl: tokenResponse.instance_url,
  },
});
```

---

### 6. Legacy Username & Password Flow (Deprecated)
Maintained for backwards compatibility. Will log a deprecation warning alerting you of Salesforce's Winter '27 retirement.

```javascript
import SalesforceBulkApiClient, { SalesforceCredentials } from 'sf-bulk2-query';

const creds = new SalesforceCredentials(
  'username@example.com',
  'password',
  'security_token',
  'client_id',
  'client_secret'
);

const client = new SalesforceBulkApiClient('https://login.salesforce.com', '58.0', creds);
await client.login();
```

---

## API Reference

### Constructor

```javascript
// Modern options-object signature:
const client = new SalesforceBulkApiClient(options);

// Legacy 3-argument signature:
const client = new SalesforceBulkApiClient(salesforceInstance, apiVersion, creds);
```

#### Options Object
* `salesforceInstance` *(string)*: Salesforce instance URL (e.g. `'https://login.salesforce.com'` or `'https://mycompany.my.salesforce.com'`). Defaults to `'https://login.salesforce.com'`.
* `apiVersion` *(string)*: Salesforce Bulk API version (e.g. `'60.0'`). Defaults to `'58.0'`.
* `pollTime` *(number)*: Job polling interval in milliseconds. Defaults to `10000` (10 seconds).
* `auth` *(object)*: Authentication configuration (see examples above).

---

### Methods

#### `login([creds]): Promise<AuthResult>`
Authenticates with Salesforce using the configured strategy. Not required if initialized with `auth.type: 'access_token'`.

#### `bulkQueryAsStream(query, [options]): Promise<Readable>`
Executes a SOQL query using Bulk API 2.0 and returns a readable stream emitting CSV chunks.
* `options.allRows` *(boolean)*: If `true`, queries deleted and archived records (`queryAll`).
* `options.pageSize` *(number)*: Chunk size for pulling results.

#### `bulkQueryToFile(query, filename, [options]): Promise<void>`
Executes a SOQL query and writes the complete CSV output to the specified local file path.

#### `bulkQueryAsData(query, [options]): Promise<string>`
Executes a SOQL query and buffers the full CSV result into a string in memory.

#### `startBulkQuery(query, [allRows]): Promise<FetchResponse>`
Starts a Bulk API 2.0 job and returns `{ status, statusText, headers, body }`. `body.id` contains the Salesforce Job ID.

#### `checkJobStatus(jobId): Promise<FetchResponse>`
Checks the current processing state of a bulk job.

#### `pollJobTillComplete(jobId, [pollTime]): Promise<string>`
Polls until the job status reaches `'JobComplete'`, or throws if `'Failed'` / `'Aborted'`.

---

## Running Tests

```bash
npm test
```

Runs all unit tests with Node.js's built-in test runner.

---

## License

MIT