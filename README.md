# SF-Bulk2-Query

A Javascript module for querying with the Salesforce Bulk API 2.0

## Features

* Authenticate with Salesforce using username, password, security token, client key and secret.

* Execute SOQL queries using the Bulk API 2.0.

* Retrieve job results as a stream, file, or raw data.

## Installation

npm install sf-bulk2-query

## Usage

### Salesforce Credentials Class

Represents the credentials needed to connect to Salesforce.
```
import { SalesforceCredentials } from 'sf-bulk2-query';

const creds = new SalesforceCredentials(
'your_username',
'your_password',
'your_security_token',
'your_client_id',
'your_client_secret'
);
```

### Bulk API Client

```
import SalesforceBulkApiClient from 'sf-bulk2-query';

const client = new SalesforceBulkApiClient('https://login.salesforce.com', '58.0', creds);
await client.login();
await client.bulkQueryToFile('SELECT Id, Name FROM Account', './accounts.csv');
```