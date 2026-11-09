import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiConfigService } from '../config/api-config.service';
import { AuthApiService } from './auth-api.service';

describe('AuthApiService', () => {
  it('posts the canonical username-or-email login contract', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ApiConfigService, useValue: { configuration: { baseUrl: 'http://api.test' } } },
      ],
    });

    const service = TestBed.inject(AuthApiService);
    const http = TestBed.inject(HttpTestingController);
    service.login('john.mensah@miracle-temple', 'secret').subscribe();

    const request = http.expectOne('http://api.test/api/v1/auth/mobile/login/');
    expect(request.request.body).toEqual({
      login_identifier: 'john.mensah@miracle-temple',
      password: 'secret',
    });
    request.flush({
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_expires_in: 604800,
      access_expires_at: '2026-11-09T12:15:00.000Z',
      refresh_expires_at: '2026-11-16T12:00:00.000Z',
      user: { id: 'user-id', email: null, login_identifier: 'john.mensah@miracle-temple', can_create_organization: false },
    });
  });
});
