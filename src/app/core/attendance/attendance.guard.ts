import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { AttendancePermissionService } from './attendance-permission.service';
import { WorkspaceStateService } from '../workspace/workspace-state.service';

export const attendanceGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const workspace = inject(WorkspaceStateService);
  const permissions = inject(AttendancePermissionService);
  const router = inject(Router);

  return auth.initialize().then(async () => {
    if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);
    const userId = auth.user()?.id;
    if (userId) {
      try { await workspace.resolveForUser(userId); } catch { /* page owns safe retry state */ }
    }
    if (!workspace.usableWorkspaceResolved()) return router.createUrlTree(['/app/workspace']);
    return permissions.canViewAttendance()
      ? true
      : router.createUrlTree(['/app/home']);
  });
};
