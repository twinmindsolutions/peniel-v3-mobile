import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { AuthService } from '../auth/auth.service';
import { WorkspaceStateService } from './workspace-state.service';

export type WorkspaceRefreshReason = 'app-resume' | 'workspace-entry' | 'authorization-failure';

/** Coordinates bounded workspace authorization refreshes without replaying failed requests. */
@Injectable({ providedIn: 'root' })
export class WorkspaceAuthorizationService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceStateService);
  private readonly router = inject(Router);
  private initialized = false;
  private refreshInFlight: Promise<boolean> | undefined;

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void this.refresh('app-resume');
    });
  }

  async refresh(_reason: WorkspaceRefreshReason): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;
    if (!this.auth.isAuthenticated() || !this.auth.user()?.id) return false;

    const refresh = this.workspace.refreshAuthorization()
      .then(async () => {
        if (!this.workspace.usableWorkspaceResolved()) {
          await this.router.navigateByUrl('/app/workspace');
        }
        return true;
      })
      .catch(() => false)
      .finally(() => {
        if (this.refreshInFlight === refresh) this.refreshInFlight = undefined;
      });
    this.refreshInFlight = refresh;
    return refresh;
  }
}
