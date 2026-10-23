import { TestBed } from '@angular/core/testing';
import { WorkspaceAuthorizationService } from './workspace-authorization.service';
import { AuthService } from '../auth/auth.service';
import { WorkspaceStateService } from './workspace-state.service';
import { provideRouter } from '@angular/router';

describe('WorkspaceAuthorizationService', () => {
  let service: WorkspaceAuthorizationService;
  const auth = { isAuthenticated: vi.fn(() => true), user: vi.fn(() => ({ id: 'user-1' })) };
  const workspace = { refreshAuthorization: vi.fn(() => Promise.resolve()), usableWorkspaceResolved: vi.fn(() => true) };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        WorkspaceAuthorizationService,
        { provide: AuthService, useValue: auth },
        { provide: WorkspaceStateService, useValue: workspace },
        provideRouter([]),
      ],
    });
    service = TestBed.inject(WorkspaceAuthorizationService);
  });

  it('shares one refresh operation between concurrent callers', async () => {
    let resolveRefresh!: () => void;
    workspace.refreshAuthorization.mockReturnValueOnce(new Promise<void>((resolve) => { resolveRefresh = resolve; }));
    const first = service.refresh('authorization-failure');
    const second = service.refresh('workspace-entry');
    resolveRefresh();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(workspace.refreshAuthorization).toHaveBeenCalledOnce();
  });

  it('fails closed when refresh cannot verify authorization', async () => {
    workspace.refreshAuthorization.mockRejectedValueOnce(new Error('network'));
    await expect(service.refresh('app-resume')).resolves.toBe(false);
  });

  it('does not refresh without an authenticated user', async () => {
    auth.isAuthenticated.mockReturnValueOnce(false);
    await expect(service.refresh('authorization-failure')).resolves.toBe(false);
    expect(workspace.refreshAuthorization).not.toHaveBeenCalled();
  });
});
