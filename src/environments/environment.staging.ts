/**
 * Replace this build-time value with the exact Railway staging API origin.
 * Keep the `/api/v1` path and do not commit the real deployment-specific value
 * until the staging hostname has been confirmed by the operator.
 */
export const environment = {
  production: false,
  staging: true,
  apiBaseUrl: '__RAILWAY_STAGING_API_BASE_URL__/api/v1',
};
