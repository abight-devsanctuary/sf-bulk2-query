import { PassThrough, Readable } from 'node:stream';

export interface BaseAuthOptions {
    salesforceInstance?: string;
    instanceUrl?: string;
}

export interface ClientCredentialsAuthOptions extends BaseAuthOptions {
    type?: 'client_credentials';
    clientId: string;
    clientSecret: string;
    useBasicAuth?: boolean;
}

export interface JwtBearerAuthOptions extends BaseAuthOptions {
    type?: 'jwt_bearer' | 'jwt';
    clientId: string;
    username: string;
    privateKey?: string | Buffer;
    privateKeyPath?: string;
    expiresInMinutes?: number;
}

export interface RefreshTokenAuthOptions extends BaseAuthOptions {
    type?: 'refresh_token';
    clientId: string;
    clientSecret?: string;
    refreshToken: string;
}

export interface AccessTokenAuthOptions extends BaseAuthOptions {
    type?: 'access_token' | 'token' | 'session';
    accessToken: string;
    instanceUrl: string;
    tokenType?: string;
    onRefresh?: () => Promise<{ accessToken: string; instanceUrl?: string; tokenType?: string }>;
}

export interface UsernamePasswordAuthOptions extends BaseAuthOptions {
    type?: 'password' | 'username_password';
    username: string;
    password: string;
    securityToken?: string;
    clientId: string;
    clientSecret: string;
}

export type AuthConfig =
    | ClientCredentialsAuthOptions
    | JwtBearerAuthOptions
    | RefreshTokenAuthOptions
    | AccessTokenAuthOptions
    | UsernamePasswordAuthOptions
    | BaseAuthStrategy;

export interface BulkApiClientOptions {
    salesforceInstance?: string;
    instanceUrl?: string;
    apiVersion?: string;
    pollTime?: number;
    auth?: AuthConfig;
    creds?: AuthConfig;
}

export interface QueryOptions {
    allRows?: boolean;
    pageSize?: number | null;
}

export interface AuthResult {
    accessToken: string;
    instanceUrl: string;
    tokenType: string;
    data?: any;
}

export class BaseAuthStrategy {
    salesforceInstance: string;
    accessToken: string | null;
    instanceUrl: string | null;
    tokenType: string;
    expiresAt: number | null;

    constructor(salesforceInstance?: string);
    authenticate(): Promise<AuthResult>;
    refresh(): Promise<AuthResult>;
    canRefresh(): boolean;
    getAuthorizationHeader(): Promise<string>;
}

export class ClientCredentialsAuth extends BaseAuthStrategy {
    clientId: string;
    clientSecret: string;
    useBasicAuth: boolean;
    constructor(options: ClientCredentialsAuthOptions);
    authenticate(): Promise<AuthResult>;
}

export class JwtBearerAuth extends BaseAuthStrategy {
    clientId: string;
    username: string;
    privateKey: string | Buffer;
    expiresInMinutes: number;
    constructor(options: JwtBearerAuthOptions);
    generateAssertion(): string;
    authenticate(): Promise<AuthResult>;
}

export class RefreshTokenAuth extends BaseAuthStrategy {
    clientId: string;
    clientSecret?: string;
    refreshToken: string;
    constructor(options: RefreshTokenAuthOptions);
    authenticate(): Promise<AuthResult>;
}

export class AccessTokenAuth extends BaseAuthStrategy {
    constructor(options: AccessTokenAuthOptions);
    authenticate(): Promise<AuthResult>;
    refresh(): Promise<AuthResult>;
}

export class UsernamePasswordAuth extends BaseAuthStrategy {
    constructor(options: UsernamePasswordAuthOptions);
    authenticate(): Promise<AuthResult>;
}

export function createAuthStrategy(
    authOptions: AuthConfig,
    defaultSalesforceInstance?: string
): BaseAuthStrategy;

export function generatePkceChallenge(byteLength?: number): {
    codeVerifier: string;
    codeChallenge: string;
    method: 'S256';
};

export function getAuthorizationUrl(options: {
    clientId: string;
    redirectUri: string;
    codeChallenge?: string;
    salesforceInstance?: string;
    scope?: string;
    state?: string;
    prompt?: string;
}): string;

export function exchangeCodeForTokens(options: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier?: string;
    clientSecret?: string;
    salesforceInstance?: string;
}): Promise<any>;

export class SalesforceCredentials {
    type: string;
    username?: string;
    password?: string;
    securityToken?: string;
    clientId?: string;
    clientSecret?: string;

    constructor(
        username?: string,
        password?: string,
        securityToken?: string,
        clientId?: string,
        clientSecret?: string
    );

    static fromClientCredentials(options: ClientCredentialsAuthOptions): ClientCredentialsAuthOptions;
    static fromJwt(options: JwtBearerAuthOptions): JwtBearerAuthOptions;
    static fromRefreshToken(options: RefreshTokenAuthOptions): RefreshTokenAuthOptions;
    static fromAccessToken(options: AccessTokenAuthOptions): AccessTokenAuthOptions;
    static fromPassword(options: UsernamePasswordAuthOptions): UsernamePasswordAuthOptions;
}

export class FetchResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
    constructor(response: any, body: any);
}

export class SalesforceBulkApiClient {
    pollTime: number;

    constructor(options: BulkApiClientOptions);
    constructor(
        salesforceInstance?: string,
        apiVersion?: string,
        creds?: SalesforceCredentials | AuthConfig
    );

    login(creds?: SalesforceCredentials | AuthConfig): Promise<AuthResult>;
    startBulkQuery(query: string, allRows?: boolean): Promise<FetchResponse>;
    checkJobStatus(jobId: string): Promise<FetchResponse>;
    pollJobTillComplete(jobId: string, pollTime?: number | null): Promise<string>;
    bulkQueryAsStream(queryString: string, options?: QueryOptions): Promise<Readable>;
    bulkQueryToFile(queryString: string, filename: string, options?: QueryOptions): Promise<void>;
    bulkQueryAsData(queryString: string, options?: QueryOptions): Promise<string>;
    retrieveJobResults_sequentialStream(jobId: string, pageSize?: number | null): Promise<PassThrough>;
}

export default SalesforceBulkApiClient;
