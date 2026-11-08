/**
 * Replace this build-time value with the exact Railway staging API origin.
 * Keep the `/api/v1` path and do not commit the real deployment-specific value
 * until the staging hostname has been confirmed by the operator.
 */
export const environment = {
  production: false,
  staging: true,
  apiBaseUrl: 'https://peniel-v3-api-staging.up.railway.app/api/v1',
};
