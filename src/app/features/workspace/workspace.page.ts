import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { businessOutline, checkmarkCircle, gitBranchOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceStateService } from '../../core/workspace/workspace-state.service';
import { AppButtonComponent } from '../../shared/ui/app-button/app-button.component';
import { AppFeedbackStateComponent } from '../../shared/ui/app-feedback-state/app-feedback-state.component';
import { AppPageShellComponent } from '../../shared/ui/app-page-shell/app-page-shell.component';

@Component({
  selector: 'app-workspace',
  templateUrl: './workspace.page.html',
  styleUrl: './workspace.page.scss',
  imports: [IonContent, IonIcon, AppButtonComponent, AppFeedbackStateComponent, AppPageShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspacePage implements OnInit {
  readonly workspace = inject(WorkspaceStateService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ businessOutline, checkmarkCircle, gitBranchOutline });
  }

  ngOnInit(): void {
    void this.resolve();
  }

  async resolve(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      await this.router.navigateByUrl('/auth/login');
      return;
    }
    try {
      await this.workspace.resolveForUser(userId);
      if (this.workspace.usableWorkspaceResolved()) {
        await this.router.navigateByUrl('/app/home');
      }
    } catch {
      // The state service exposes a safe retryable error state.
    }
  }

  async chooseOrganization(organizationId: string): Promise<void> {
    try {
      await this.workspace.selectOrganization(organizationId);
      if (this.workspace.usableWorkspaceResolved()) {
        await this.router.navigateByUrl('/app/home');
      }
    } catch {
      // The list is backend-authorized; state remains the source of safe errors.
    }
  }

  chooseBranch(branchId: string): void {
    try {
      this.workspace.selectBranch(branchId);
    } catch {
      // Ignore invalid UI events rather than exposing authorization details.
    }
  }

  async continueToHome(): Promise<void> {
    if (this.workspace.usableWorkspaceResolved()) {
      await this.router.navigateByUrl('/app/home');
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/auth/login');
  }
}
