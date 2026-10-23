import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonItem, IonLabel, IonList, IonTitle, IonToolbar } from '@ionic/angular';
import { AttendancePermissionService } from '../../../core/attendance/attendance-permission.service';
import { AttendanceSessionApiService } from '../../../core/attendance/attendance-session-api.service';
import { AttendanceSession, AttendanceSessionListResponse } from '../../../core/attendance/attendance.models';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { AppPageShellComponent } from '../../../shared/ui/app-page-shell/app-page-shell.component';
import { AppFeedbackStateComponent } from '../../../shared/ui/app-feedback-state/app-feedback-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-attendance-session-list',
  templateUrl: './session-list.page.html',
  styleUrls: ['./session-list.page.scss'],
  imports: [IonContent, IonHeader, IonItem, IonLabel, IonList, IonTitle, IonToolbar, RouterLink, AppPageShellComponent, AppFeedbackStateComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionListPage {
  private readonly api = inject(AttendanceSessionApiService);
  readonly workspace = inject(WorkspaceStateService);
  readonly attendance = inject(AttendancePermissionService);
  readonly sessions = signal<readonly AttendanceSession[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  private requestVersion = 0;
  private lastKey = '';

  constructor() {
    effect(() => {
      const key = `${this.workspace.selectedOrganizationId() ?? ''}:${this.workspace.selectedBranchId() ?? ''}:${this.attendance.canViewAttendance()}`;
      if (key === this.lastKey) return;
      this.lastKey = key;
      void this.load();
    });
  }

  load(): Promise<void> {
    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    const version = ++this.requestVersion;
    this.error.set(false);
    if (!organizationId || !branchId || !this.attendance.canViewAttendance()) {
      this.sessions.set([]);
      this.loading.set(false);
      return Promise.resolve();
    }
    this.loading.set(true);
    return new Promise((resolve) => this.api.getSessions(organizationId).subscribe({
      next: (response: AttendanceSessionListResponse) => {
        if (version === this.requestVersion && this.workspace.selectedOrganizationId() === organizationId && this.workspace.selectedBranchId() === branchId) {
          this.sessions.set(response.results);
        }
        resolve();
      },
      error: () => { if (version === this.requestVersion) { this.sessions.set([]); this.error.set(true); this.loading.set(false); } resolve(); },
      complete: () => { if (version === this.requestVersion) this.loading.set(false); },
    }));
  }

  sessionTitle(session: AttendanceSession): string {
    return session.service_type_name_snapshot || session.service_type.name;
  }

  formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)); }
  formatTime(value: string): string { return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(value)); }
}
