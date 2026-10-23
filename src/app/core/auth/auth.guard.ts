import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { WorkspaceStateService } from '../workspace/workspace-state.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const workspace = inject(WorkspaceStateService);
  const router = inject(Router);
  return auth.initialize().then(async () => {
    if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);
    const userId = auth.user()?.id;
    if (userId) {
      try {
        await workspace.resolveForUser(userId);
      } catch {
        // The workspace route renders the retryable discovery error state.
      }
    }
    return true;
  });
};

export const workspaceGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const workspace = inject(WorkspaceStateService);
  const router = inject(Router);
  return auth.initialize().then(async () => {
    if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);
    const userId = auth.user()?.id;
    if (userId) {
      try {
        await workspace.resolveForUser(userId);
      } catch {
        // Redirect to the workspace route, which owns retry and empty states.
      }
    }
    return workspace.usableWorkspaceResolved() ? true : router.createUrlTree(['/app/workspace']);
  });
};
