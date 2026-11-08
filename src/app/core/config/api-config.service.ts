import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

const PRODUCTION_API_ORIGIN = 'https://api.penielapp.com';
const STAGING_PLACEHOLDER = '__RAILWAY_STAGING_API_BASE_URL__';

export interface ApiConfiguration {
  readonly baseUrl: string;
}

@Injectable({ providedIn: 'root' })
export class ApiConfigService {
  private readonly apiBaseUrl = validateApiBaseUrl(environment.apiBaseUrl, environment.production, environment.staging);

  readonly configuration: ApiConfiguration = {
    baseUrl: this.apiBaseUrl,
  };
}

export function validateApiBaseUrl(value: string, production: boolean, staging: boolean): string {
  const normalized = value.trim().replace(/\/$/, '');
  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('The mobile API base URL must be a valid absolute URL.');
  }

  if (parsed.protocol !== 'https:' && (production || staging)) {
    throw new Error('Production and staging mobile builds require an HTTPS API base URL.');
  }
  if (staging && (normalized.includes(STAGING_PLACEHOLDER) || parsed.hostname === new URL(PRODUCTION_API_ORIGIN).hostname)) {
    throw new Error('The staging mobile build requires the confirmed Railway staging API URL.');
  }
  if (!parsed.pathname.endsWith('/api/v1')) {
    throw new Error('The mobile API base URL must end with /api/v1.');
  }

  return normalized;
}
