import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { WelcomeStateService } from './welcome-state.service';
import { authEntryGuard, launchGuard, welcomeGuard } from './launch.guards';

describe('launch guards', () => {
  const auth = { initialize: vi.fn().mockResolvedValue(undefined), isAuthenticated: vi.fn() };
  const welcome = { hasCompleted: vi.fn() };
  const router = { parseUrl: vi.fn((url: string) => ({ url })) };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: WelcomeStateService, useValue: welcome },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('routes a first unauthenticated launch to welcome', async () => {
    auth.isAuthenticated.mockReturnValue(false);
    welcome.hasCompleted.mockResolvedValue(false);
    await expect(TestBed.runInInjectionContext(() => launchGuard({} as never, {} as never))).resolves.toEqual({ url: '/welcome' });
  });

  it('routes a completed unauthenticated launch to login', async () => {
    auth.isAuthenticated.mockReturnValue(false);
    welcome.hasCompleted.mockResolvedValue(true);
    await expect(TestBed.runInInjectionContext(() => launchGuard({} as never, {} as never))).resolves.toEqual({ url: '/auth/login' });
  });

  it('bypasses welcome and login for an authenticated user', async () => {
    auth.isAuthenticated.mockReturnValue(true);
    await expect(TestBed.runInInjectionContext(() => welcomeGuard({} as never, {} as never))).resolves.toEqual({ url: '/app/home' });
    await expect(TestBed.runInInjectionContext(() => authEntryGuard({} as never, {} as never))).resolves.toEqual({ url: '/app/home' });
  });

  it('redirects direct login navigation to welcome until completed', async () => {
    auth.isAuthenticated.mockReturnValue(false);
    welcome.hasCompleted.mockResolvedValue(false);
    await expect(TestBed.runInInjectionContext(() => authEntryGuard({} as never, {} as never))).resolves.toEqual({ url: '/welcome' });
  });

  it('keeps login accessible after welcome completion', async () => {
    auth.isAuthenticated.mockReturnValue(false);
    welcome.hasCompleted.mockResolvedValue(true);
    await expect(TestBed.runInInjectionContext(() => authEntryGuard({} as never, {} as never))).resolves.toBe(true);
  });
});
