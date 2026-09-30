import { BaseAuthStrategy } from './BaseAuthStrategy.js';
import { ClientCredentialsAuth } from './ClientCredentialsAuth.js';
import { JwtBearerAuth } from './JwtBearerAuth.js';
import { RefreshTokenAuth } from './RefreshTokenAuth.js';
import { AccessTokenAuth } from './AccessTokenAuth.js';
import { UsernamePasswordAuth } from './UsernamePasswordAuth.js';

/**
 * Creates and configures the appropriate authentication strategy based on provided credentials.
 * @param {object|BaseAuthStrategy} authOptions - Auth options, credentials object, or strategy instance.
 * @param {string} [defaultSalesforceInstance='https://login.salesforce.com'] - Default login instance URL.
 * @returns {BaseAuthStrategy}
 */
export function createAuthStrategy(authOptions, defaultSalesforceInstance = 'https://login.salesforce.com') {
    if (!authOptions) {
        throw new Error('No authentication options or credentials provided.');
    }

    // Already an AuthStrategy instance
    if (authOptions instanceof BaseAuthStrategy) {
        return authOptions;
    }

    const config = {
        salesforceInstance: defaultSalesforceInstance,
        ...authOptions,
    };

    const type = (config.type || config.grant_type || config.grantType || '').toLowerCase();

    // 1. Explicit Strategy Types
    if (type === 'client_credentials') {
        return new ClientCredentialsAuth(config);
    }
    if (type === 'jwt_bearer' || type === 'jwt') {
        return new JwtBearerAuth(config);
    }
    if (type === 'refresh_token') {
        return new RefreshTokenAuth(config);
    }
    if (type === 'access_token' || type === 'token' || type === 'session') {
        return new AccessTokenAuth(config);
    }
    if (type === 'password' || type === 'username_password') {
        return new UsernamePasswordAuth(config);
    }

    // 2. Automatic Detection based on property signatures
    if (config.accessToken) {
        return new AccessTokenAuth(config);
    }
    if (config.privateKey || config.privateKeyPath) {
        return new JwtBearerAuth(config);
    }
    if (config.refreshToken) {
        return new RefreshTokenAuth(config);
    }
    if (config.username && config.password) {
        return new UsernamePasswordAuth(config);
    }
    if (config.clientId && config.clientSecret) {
        // Modern server-to-server default when credentials are only client id & secret
        return new ClientCredentialsAuth(config);
    }

    throw new Error(
        'Unable to determine OAuth authentication strategy from provided options. ' +
        'Please specify auth.type ("client_credentials", "jwt_bearer", "refresh_token", "access_token", or "password").'
    );
}

export default createAuthStrategy;
