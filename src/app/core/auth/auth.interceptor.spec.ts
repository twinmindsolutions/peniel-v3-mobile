import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { ApiConfigService } from '../config/api-config.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  const auth = {
    getAccessToken: vi.fn(() => 'access-token'),
    refreshAccessToken: vi.fn(() => Promise.resolve('rotated-access-token')),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: ApiConfigService, useValue: { configuration: { baseUrl: 'https://api.test/api/v1' } } },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    vi.clearAllMocks();
  });

  afterEach(() => controller.verify());

  it('adds Bearer credentials and refreshes a protected request once after 401', async () => {
    const result = firstValueFrom(http.get('https://api.test/api/v1/organizations/'));
    const initial = controller.expectOne('https://api.test/api/v1/organizations/');
    expect(initial.request.headers.get('Authorization')).toBe('Bearer access-token');
    initial.flush({}, { status: 401, statusText: 'Unauthorized' });

    const retry = controller.expectOne('https://api.test/api/v1/organizations/');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer rotated-access-token');
    retry.flush({});
    await expect(result).resolves.toEqual({});
    expect(auth.refreshAccessToken).toHaveBeenCalledOnce();
  });

  it('does not attach or refresh credentials for unrelated origins', async () => {
    const result = firstValueFrom(http.get('https://other.test/resource'));
    const request = controller.expectOne('https://other.test/resource');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
  });
});
