# SF-Bulk2-Query

A Javascript module for querying with the Salesforce Bulk API 2.0

## Features

-   Authenticate with Salesforce using username, password, security token, client key and secret.

-   Execute SOQL queries using the Bulk API 2.0.

-   Retrieve job results as a stream, file, or raw data.

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

## API Documentation

### Constructor

`const client = new SalesforceBulkApiClient(salesforceInstance, apiVersion, creds);`

##### salesforceInstance

The URL of your Salesforce instance (e.g., 'https://login.salesforce.com' or 'https://yourinstance.my.salesforce.com').

Defaults to 'https://login.salesforce.com'.

##### apiVersion

The Salesforce API version to use. Defaults to '58.0'.

##### creds

An instance of **SalesforceCredentials**.

### Attibutes

#### pollTime

The frequncy of job polling in milliseconds. Defaults to 10 seconds

### Methods

#### login (async) : void

`await client.login(creds);`

##### creds

Optional: An instance of **SalesforceCredentials**.

If creds are provided then it will use the newly passes credentials, else it will used those passed during the constructor. If there are no creds an error will be thrown.

#### async bulkQueryAsStream(query, options) : stream
`let dataStream = await client.bulkQueryAsStream(query, options);`
##### query
A SOQL Query
##### options
Defaults to `{ allRows = false, pageSize = null }`
###### allRows
Optional: Boolean
If passed True then will use the all rows flag to the bulk api allowing the return of deleted and archived data.
###### pageSize
Optional: Integer  
If passed will pull results in chunks the size of the int.

#### async bulkQueryToFile(query, filename, options) : void
`let dataStream = await client.bulkQueryToFile(query, filename, options);`
##### query
A SOQL Query
##### filename
A file path for writing the results to disk.

Will override an existing file.
##### options
Defaults to `{ allRows = false, pageSize = null }`
###### allRows
Optional: Boolean
If passed True then will use the all rows flag to the bulk api allowing the return of deleted and archived data.
###### pageSize
Optional: Integer  
If passed will pull results in chunks the size of the int.

### Advanced Methods
#### startBulkQuery (async) : request

`let resp = await client.startBulkQuery(query, allRows);`

##### query

A SOQL Query

##### allRows

Optional: Boolean.  
If passed True then will use the all rows flag to the bulk api allowing the return of deleted and archived data.

##### resp

```
{
    status,
    statusText,
    headers,
    body
}
```

#### checkJobStatus (async) : response

`let resp = await client.checkJobStatus(jobId);`

##### jobId

Salesforce Bulk API Job Id - Returned from `executeBulkQuery` `body.id`

##### resp

fetch response.json()

#### pollJobTillComplete (async) : response

`let resp = await client.pollJobTillComplete(jobId, pollTime);`

##### jobId

Salesforce Bulk API Job Id - Returned from `executeBulkQuery` `body.id`

##### pollTime

Optional : Time in milliseconds. If not passed defaults to client.pollTime

##### resp

The jobs state as defined https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/query_get_one_job.htm

#### retrieveJobResults_sequentialStream (async) : stream
`let resp = await client.retrieveJobResults_sequentialStream(jobId);`

Returns a data stream that will pipe the csv like text as the results are retrieved.