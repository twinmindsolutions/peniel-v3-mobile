import { describe, expect, it } from 'vitest';
import { validateApiBaseUrl } from './api-config.service';

describe('validateApiBaseUrl', () => {
  it('accepts the local HTTP development URL', () => {
    expect(validateApiBaseUrl('http://127.0.0.1:8000/api/v1', false, false)).toBe(
      'http://127.0.0.1:8000/api/v1',
    );
  });

  it('requires HTTPS for staging and rejects the unresolved placeholder', () => {
    expect(() => validateApiBaseUrl('__RAILWAY_STAGING_API_BASE_URL__/api/v1', false, true)).toThrow();
    expect(() => validateApiBaseUrl('http://staging.example/api/v1', false, true)).toThrow();
  });

  it('does not allow staging to point at production', () => {
    expect(() => validateApiBaseUrl('https://api.penielapp.com/api/v1', false, true)).toThrow();
  });

  it('requires the API version path', () => {
    expect(() => validateApiBaseUrl('https://staging.example', false, true)).toThrow();
  });
});
