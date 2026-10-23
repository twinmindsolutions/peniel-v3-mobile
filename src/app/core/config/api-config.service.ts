import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface ApiConfiguration {
  readonly baseUrl: string;
}

@Injectable({ providedIn: 'root' })
export class ApiConfigService {
  readonly configuration: ApiConfiguration = {
    baseUrl: environment.apiBaseUrl,
  };
}
