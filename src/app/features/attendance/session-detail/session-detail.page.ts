import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonHeader, IonItem, IonLabel, IonList, IonSearchbar, IonTitle, IonToolbar } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AttendancePermissionService } from '../../../core/attendance/attendance-permission.service';
import { AttendanceSessionApiService } from '../../../core/attendance/attendance-session-api.service';
import { AttendanceCheckInResponse, AttendanceMemberLookup, AttendanceSession, AttendanceSessionSummary } from '../../../core/attendance/attendance.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { AppFeedbackStateComponent } from '../../../shared/ui/app-feedback-state/app-feedback-state.component';
import { AppPageShellComponent } from '../../../shared/ui/app-page-shell/app-page-shell.component';
import { AppButtonComponent } from '../../../shared/ui/app-button/app-button.component';

@Component({
  selector: 'app-attendance-session-detail',
  templateUrl: './session-detail.page.html',
  styleUrls: ['./session-detail.page.scss'],
  imports: [IonContent, IonHeader, IonItem, IonLabel, IonList, IonSearchbar, IonTitle, IonToolbar, AppFeedbackStateComponent, AppPageShellComponent, AppButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionDetailPage {
  private readonly api = inject(AttendanceSessionApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);
  readonly workspace = inject(WorkspaceStateService);
  readonly attendance = inject(AttendancePermissionService);
  readonly session = signal<AttendanceSession | null>(null);
  readonly summary = signal<AttendanceSessionSummary | null>(null);
  readonly members = signal<readonly AttendanceMemberLookup[]>([]);
  readonly selectedMember = signal<AttendanceMemberLookup | null>(null);
  readonly loading = signal(false);
  readonly memberLoading = signal(false);
  readonly memberError = signal(false);
  readonly error = signal(false);
  readonly checkInInFlight = signal(false);
  readonly searchTerm = signal('');
  readonly sessionId: string;
  private requestVersion = 0;
  private memberRequestVersion = 0;
  private lastKey = '';
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';
    effect(() => {
      const key = `${this.workspace.selectedOrganizationId() ?? ''}:${this.workspace.selectedBranchId() ?? ''}:${this.attendance.canViewAttendance()}:${this.sessionId}`;
      if (key === this.lastKey) return;
      this.lastKey = key;
      void this.load();
    });
  }

  async load(): Promise<void> {
    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    const version = ++this.requestVersion;
    this.session.set(null);
    this.summary.set(null);
    this.members.set([]);
    this.selectedMember.set(null);
    this.error.set(false);
    this.memberError.set(false);
    if (!organizationId || !branchId || !this.sessionId || !this.attendance.canViewAttendance()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const session = await firstValueFrom(this.api.getSession(organizationId, this.sessionId));
      if (!this.isCurrent(version, organizationId, branchId)) return;
      this.session.set(session);
      this.memberLoading.set(true);
      const [summaryResult, membersResult] = await Promise.allSettled([
        firstValueFrom(this.api.getAttendanceSummary(organizationId, this.sessionId)),
        firstValueFrom(this.api.searchMembers(organizationId, this.sessionId)),
      ]);
      if (!this.isCurrent(version, organizationId, branchId)) return;
      if (summaryResult.status === 'rejected') throw summaryResult.reason;
      this.summary.set(summaryResult.value);
      if (membersResult.status === 'fulfilled') {
        this.members.set(membersResult.value.results);
      } else {
        this.members.set([]);
        this.memberError.set(true);
      }
    } catch {
      if (this.isCurrent(version, organizationId, branchId)) this.error.set(true);
    } finally {
      if (this.isCurrent(version, organizationId, branchId)) this.loading.set(false);
      if (this.isCurrent(version, organizationId, branchId)) this.memberLoading.set(false);
    }
  }

  onSearch(event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value ?? '';
    this.searchTerm.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.searchMembers(value), 300);
  }

  async searchMembers(value = this.searchTerm()): Promise<void> {
    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    if (!organizationId || !branchId || !this.sessionId || !this.attendance.canViewAttendance()) return;
    const version = ++this.memberRequestVersion;
    this.memberLoading.set(true);
    this.memberError.set(false);
    try {
      const response = await firstValueFrom(this.api.searchMembers(organizationId, this.sessionId, value));
      if (version === this.memberRequestVersion && this.workspace.selectedOrganizationId() === organizationId && this.workspace.selectedBranchId() === branchId) {
        this.members.set(response.results);
      }
    } catch {
      if (version === this.memberRequestVersion) { this.members.set([]); this.memberError.set(true); }
    } finally {
      if (version === this.memberRequestVersion) this.memberLoading.set(false);
    }
  }

  selectMember(member: AttendanceMemberLookup): void {
    if (!this.attendance.canRecordAttendance() || this.checkInInFlight() || this.recordingUnavailableMessage()) return;
    this.selectedMember.set(member);
  }

  recordingUnavailableMessage(): string | null {
    const currentSession = this.session();
    return currentSession ? getRecordingUnavailableMessage(currentSession, Date.now()) : null;
  }

  async confirmSelectedMember(): Promise<void> {
    const member = this.selectedMember();
    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    const unavailableMessage = this.recordingUnavailableMessage();
    if (unavailableMessage) {
      await this.notifications.warning(unavailableMessage);
      return;
    }
    if (!member || !organizationId || !branchId || !this.attendance.canRecordAttendance() || this.checkInInFlight()) return;
    const confirmed = await this.notifications.confirm({
      title: 'Confirm check-in',
      message: `${member.first_name} ${member.last_name} will be checked in to this session.`,
      confirmLabel: 'Check in',
    });
    if (!confirmed || this.workspace.selectedOrganizationId() !== organizationId || this.workspace.selectedBranchId() !== branchId) return;
    const version = this.requestVersion;
    this.checkInInFlight.set(true);
    try {
      const response = await firstValueFrom(this.api.recordManualCheckIn(organizationId, this.sessionId, member.id));
      if (version !== this.requestVersion || this.workspace.selectedOrganizationId() !== organizationId || this.workspace.selectedBranchId() !== branchId) return;
      await this.handleCheckInResponse(response);
    } catch (error: unknown) {
      await this.handleCheckInError(error);
    } finally {
      this.checkInInFlight.set(false);
    }
  }

  private async handleCheckInResponse(response: AttendanceCheckInResponse): Promise<void> {
    if (response.outcome === 'already_checked_in') {
      await this.notifications.warning('This member was already checked in. The original attendance record was preserved.');
    } else {
      await this.notifications.success('Member checked in successfully.');
    }
    await this.refreshSummary();
    this.selectedMember.set(null);
  }

  private async handleCheckInError(error: unknown): Promise<void> {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 0) {
      await this.notifications.error('The check-in result could not be confirmed. Refresh the session summary before trying again.');
      await this.refreshSummary();
      return;
    }
    if (status === 401) {
      await this.notifications.error('Your session has expired. Please sign in again.');
    } else if (status === 403 || status === 404) {
      await this.notifications.error('This session is no longer available for attendance recording.');
    } else if (status === 409) {
      await this.notifications.warning(this.safeBackendDetail(error) ?? 'Attendance recording is unavailable for this session.');
      await this.refreshSummary();
    } else {
      await this.notifications.error('We could not record this check-in. Please try again when the session is available.');
    }
  }

  private safeBackendDetail(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse)) return null;
    const detail = error.error?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : null;
  }

  async refreshSummary(): Promise<void> {
    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    if (!organizationId || !branchId || !this.sessionId) return;
    const version = this.requestVersion;
    try {
      const summary = await firstValueFrom(this.api.getAttendanceSummary(organizationId, this.sessionId));
      if (version === this.requestVersion && this.workspace.selectedOrganizationId() === organizationId && this.workspace.selectedBranchId() === branchId) this.summary.set(summary);
    } catch {
      // Keep the last known summary; the write result remains visible to the operator.
    }
  }

  private isCurrent(version: number, organizationId: string, branchId: string): boolean {
    return version === this.requestVersion
      && this.workspace.selectedOrganizationId() === organizationId
      && this.workspace.selectedBranchId() === branchId;
  }

  formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)); }
  formatTime(value: string): string { return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(value)); }
}

export function getRecordingUnavailableMessage(session: AttendanceSession, now: number): string | null {
  if (session.status !== 'scheduled') {
    return 'This session is cancelled or closed for normal attendance recording.';
  }
  const start = Date.parse(session.scheduled_start);
  const end = Date.parse(session.scheduled_end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (now < start) return 'Attendance recording has not opened for this session.';
  const deadline = end + session.closure_after_hours_snapshot * 60 * 60 * 1000;
  if (now >= deadline) return 'The attendance recording deadline has passed.';
  return null;
}
