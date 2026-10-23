import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AuthApiService } from './auth-api.service';
import { AuthService } from './auth.service';
import { CREDENTIAL_STORAGE_ADAPTER, CredentialStorageAdapter, SecureCredentialStore } from './secure-credential-store.service';
import { WorkspaceStateService } from '../workspace/workspace-state.service';
import { MobileTokenResponse } from './auth.models';

const response: MobileTokenResponse = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'Bearer',
  expires_in: 900,
  refresh_expires_in: 604800,
  access_expires_at: '2026-10-23T12:15:00.000Z',
  refresh_expires_at: '2026-10-30T12:00:00.000Z',
  user: { id: 'user-id', email: 'staff@example.test', can_create_organization: false },
};

class TestCredentialAdapter implements CredentialStorageAdapter {
  value: string | null = null;
  async read(): Promise<string | null> { return this.value; }
  async write(value: string): Promise<void> { this.value = value; }
  async clear(): Promise<void> { this.value = null; }
}

describe('AuthService', () => {
  let service: AuthService;
  let api: { login: ReturnType<typeof vi.fn>; refresh: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };
  let adapter: TestCredentialAdapter;
  let workspace: { clear: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = {
      login: vi.fn(() => of(response)),
      refresh: vi.fn(() => of(response)),
      logout: vi.fn(() => of(void 0)),
    };
    adapter = new TestCredentialAdapter();
    workspace = { clear: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        SecureCredentialStore,
        { provide: AuthApiService, useValue: api },
        { provide: WorkspaceStateService, useValue: workspace },
        { provide: CREDENTIAL_STORAGE_ADAPTER, useValue: adapter },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  it('persists only the refresh credential after login', async () => {
    await service.login('staff@example.test', 'secret');

    expect(service.isAuthenticated()).toBe(true);
    expect(await adapter.read()).toContain('refresh-token');
    expect(await adapter.read()).not.toContain('access-token');
  });

  it('restores a native/browser session through refresh rotation', async () => {
    await adapter.write(JSON.stringify({ refreshToken: 'old-refresh', refreshExpiresAt: response.refresh_expires_at }));
    await service.initialize();

    expect(api.refresh).toHaveBeenCalledWith('old-refresh');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('shares one refresh request between concurrent callers', async () => {
    await service.login('staff@example.test', 'secret');
    let resolveRefresh!: (value: MobileTokenResponse) => void;
    api.refresh.mockReturnValueOnce(new Promise<MobileTokenResponse>((resolve) => { resolveRefresh = resolve; }));

    const first = service.refreshAccessToken();
    const second = service.refreshAccessToken();
    resolveRefresh(response);

    await expect(Promise.all([first, second])).resolves.toEqual(['access-token', 'access-token']);
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('clears local state on logout even when the server is unavailable', async () => {
    await service.login('staff@example.test', 'secret');
    api.logout.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));

    await service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(await adapter.read()).toBeNull();
    expect(workspace.clear).toHaveBeenCalled();
  });

  it('fails closed when refresh credential persistence fails', async () => {
    api.login.mockReturnValueOnce(of(response));
    adapter.write = async () => { throw new Error('storage unavailable'); };

    await expect(service.login('staff@example.test', 'secret')).rejects.toBeTruthy();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('invalidates the session on a confirmed refresh rejection', async () => {
    await service.login('staff@example.test', 'secret');
    api.refresh.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 401 })));

    await expect(service.refreshAccessToken()).rejects.toBeTruthy();
    expect(service.isAuthenticated()).toBe(false);
  });
});
