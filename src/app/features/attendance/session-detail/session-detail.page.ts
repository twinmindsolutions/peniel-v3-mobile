import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Haptics } from '@capacitor/haptics';
import { IonContent, IonHeader, IonIcon, IonInfiniteScroll, IonInfiniteScrollContent, IonItem, IonLabel, IonList, IonSearchbar, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, ellipseOutline, qrCodeOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { AttendancePermissionService } from '../../../core/attendance/attendance-permission.service';
import { AttendanceCheckInQueueItem, AttendanceCheckInQueueService } from '../../../core/attendance/attendance-check-in-queue.service';
import { AttendanceSessionApiService } from '../../../core/attendance/attendance-session-api.service';
import { AttendanceCheckInResponse, AttendanceMemberLookup, AttendanceQrPreviewResponse, AttendanceSession, AttendanceSessionSummary, BulkAttendanceCheckInResult } from '../../../core/attendance/attendance.models';
import { AuthService } from '../../../core/auth/auth.service';
import { QrContinuousScanOutcome, QrContinuousScanSession, QrScanOutcome, QrScannerService } from '../../../core/attendance/qr-scanner.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { WorkspaceAuthorizationService } from '../../../core/workspace/workspace-authorization.service';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { AppFeedbackStateComponent } from '../../../shared/ui/app-feedback-state/app-feedback-state.component';
import { AppPageShellComponent } from '../../../shared/ui/app-page-shell/app-page-shell.component';
import { AppButtonComponent } from '../../../shared/ui/app-button/app-button.component';

@Component({
  selector: 'app-attendance-session-detail',
  templateUrl: './session-detail.page.html',
  styleUrls: ['./session-detail.page.scss'],
  imports: [IonContent, IonHeader, IonIcon, IonInfiniteScroll, IonInfiniteScrollContent, IonItem, IonLabel, IonList, IonSearchbar, IonTitle, IonToolbar, AppFeedbackStateComponent, AppPageShellComponent, AppButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionDetailPage implements OnDestroy {
  private readonly api = inject(AttendanceSessionApiService);
  private readonly auth = inject(AuthService);
  private readonly checkInQueue = inject(AttendanceCheckInQueueService);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);
  private readonly qrScanner = inject(QrScannerService);
  private readonly workspaceAuthorization = inject(WorkspaceAuthorizationService);
  readonly workspace = inject(WorkspaceStateService);
  readonly attendance = inject(AttendancePermissionService);
  readonly session = signal<AttendanceSession | null>(null);
  readonly summary = signal<AttendanceSessionSummary | null>(null);
  readonly members = signal<readonly AttendanceMemberLookup[]>([]);
  readonly selectedMember = signal<AttendanceMemberLookup | null>(null);
  readonly qrPreview = signal<AttendanceQrPreviewResponse | null>(null);
  readonly qrScanInFlight = signal(false);
  readonly scannerMessage = signal<string | null>(null);
  readonly loading = signal(false);
  readonly memberLoading = signal(false);
  readonly memberError = signal(false);
  readonly memberNextPage = signal<number | null>(null);
  readonly error = signal(false);
  readonly checkInInFlight = signal(false);
  readonly searchTerm = signal('');
  readonly bulkMode = signal(false);
  readonly bulkQrScanning = signal(false);
  readonly bulkQrPaused = signal(false);
  readonly bulkQrResolutionInFlight = signal(false);
  readonly bulkReview = signal(false);
  readonly bulkSubmitting = signal(false);
  readonly queueItems = signal<readonly AttendanceCheckInQueueItem[]>([]);
  readonly bulkSubmittedItems = signal<readonly AttendanceCheckInQueueItem[]>([]);
  readonly bulkResults = signal<readonly BulkAttendanceCheckInResult[]>([]);
  readonly sessionId: string;
  private requestVersion = 0;
  private memberRequestVersion = 0;
  private memberSearch = '';
  private lastKey = '';
  private deferredContextLoad = false;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private bulkQrSession: QrContinuousScanSession | undefined;
  private readonly recentQrScans = new Map<string, number>();

  constructor() {
    addIcons({ checkmarkCircle, ellipseOutline, qrCodeOutline });
    this.sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';
    effect(() => {
      const key = `${this.workspace.selectedOrganizationId() ?? ''}:${this.workspace.selectedBranchId() ?? ''}:${this.attendance.canViewAttendance()}:${this.sessionId}`;
      const scanBusy = this.qrScanInFlight() || this.bulkQrScanning() || this.checkInInFlight();
      if (scanBusy) {
        if (key !== this.lastKey && this.bulkQrScanning()) void this.stopBulkQrScan();
        if (key !== this.lastKey) this.deferredContextLoad = true;
        this.lastKey = key;
        return;
      }
      if (this.deferredContextLoad) {
        this.deferredContextLoad = false;
        this.lastKey = key;
        void this.load();
        return;
      }
      if (key === this.lastKey) return;
      this.lastKey = key;
      void this.load();
    });
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    void this.stopBulkQrScan();
    void this.qrScanner.stop();
    this.checkInQueue.clear();
  }

  async load(): Promise<void> {
    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    const version = ++this.requestVersion;
    this.checkInQueue.setContext(
      this.auth.user()?.id ?? '',
      organizationId ?? '',
      branchId ?? '',
      this.sessionId,
    );
    this.syncQueue();
    this.session.set(null);
    this.summary.set(null);
    this.members.set([]);
    this.memberNextPage.set(null);
    this.memberSearch = '';
    const memberVersion = ++this.memberRequestVersion;
    this.selectedMember.set(null);
    this.qrPreview.set(null);
    this.scannerMessage.set(null);
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
      if (membersResult.status === 'fulfilled' && memberVersion === this.memberRequestVersion) {
        this.applyMemberPage(membersResult.value.results, membersResult.value.next ?? null, true);
      } else if (membersResult.status === 'rejected' && memberVersion === this.memberRequestVersion) {
        this.members.set([]);
        this.memberError.set(true);
      }
    } catch {
      if (this.isCurrent(version, organizationId, branchId)) this.error.set(true);
    } finally {
      if (this.isCurrent(version, organizationId, branchId)) this.loading.set(false);
      if (this.isCurrent(version, organizationId, branchId) && memberVersion === this.memberRequestVersion) this.memberLoading.set(false);
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
    const normalizedSearch = value.trim();
    this.memberSearch = normalizedSearch;
    this.memberNextPage.set(null);
    this.members.set([]);
    this.memberLoading.set(true);
    this.memberError.set(false);
    try {
      const response = await firstValueFrom(this.api.searchMembers(organizationId, this.sessionId, normalizedSearch, 1));
      if (version === this.memberRequestVersion && this.workspace.selectedOrganizationId() === organizationId && this.workspace.selectedBranchId() === branchId) {
        this.applyMemberPage(response.results, response.next ?? null, true);
      }
    } catch {
      if (version === this.memberRequestVersion) { this.members.set([]); this.memberError.set(true); }
    } finally {
      if (version === this.memberRequestVersion) this.memberLoading.set(false);
    }
  }

  async loadMoreMembers(event: { target: { complete: () => void } }): Promise<void> {
    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    const nextPage = this.memberNextPage();
    if (!organizationId || !branchId || !this.sessionId || !this.attendance.canViewAttendance() || nextPage === null || this.memberLoading()) {
      event.target.complete();
      return;
    }
    const version = ++this.memberRequestVersion;
    this.memberLoading.set(true);
    this.memberError.set(false);
    try {
      const response = await firstValueFrom(this.api.searchMembers(organizationId, this.sessionId, this.memberSearch, nextPage));
      if (version === this.memberRequestVersion && this.workspace.selectedOrganizationId() === organizationId && this.workspace.selectedBranchId() === branchId) {
        this.applyMemberPage(response.results, response.next ?? null, false);
      }
    } catch {
      if (version === this.memberRequestVersion) this.memberError.set(true);
    } finally {
      if (version === this.memberRequestVersion) this.memberLoading.set(false);
      event.target.complete();
    }
  }

  private applyMemberPage(results: readonly AttendanceMemberLookup[], next: number | null, replace: boolean): void {
    const merged = replace ? [] : [...this.members()];
    const positions = new Map(merged.map((member, index) => [member.id, index]));
    for (const member of results) {
      // The attendance endpoint is authoritative when a concurrent usher has
      // checked a queued member in while this page was open.
      if (member.already_attended) this.checkInQueue.remove(member.id);
      const position = positions.get(member.id);
      if (position === undefined) {
        positions.set(member.id, merged.length);
        merged.push(member);
      } else {
        merged[position] = member;
      }
    }
    this.members.set(merged);
    this.syncQueue();
    this.memberNextPage.set(next);
  }

  selectMember(member: AttendanceMemberLookup): void {
    if (!this.attendance.canRecordAttendance() || this.checkInInFlight() || this.qrScanInFlight() || this.recordingUnavailableMessage()) return;
    if (member.already_attended) return;
    if (this.bulkMode()) {
      if (this.checkInQueue.has(member.id)) this.checkInQueue.remove(member.id);
      else this.checkInQueue.addManual(member);
      this.syncQueue();
      return;
    }
    this.selectedMember.set(member);
  }

  startBulkManualCheckIn(): void {
    if (!this.attendance.canRecordAttendance() || this.recordingUnavailableMessage()) return;
    this.bulkMode.set(true);
    this.bulkReview.set(false);
    this.bulkResults.set([]);
    this.bulkSubmittedItems.set([]);
    this.syncQueue();
  }

  async startBulkQrScan(): Promise<void> {
    if (!this.attendance.canRecordAttendance() || this.recordingUnavailableMessage() || this.bulkSubmitting() || this.qrScanInFlight()) return;
    this.bulkMode.set(true);
    this.bulkReview.set(false);
    this.bulkQrPaused.set(false);
    this.scannerMessage.set(null);
    const result = await this.qrScanner.startContinuousScan((outcome) => void this.handleBulkQrOutcome(outcome));
    if ('stop' in result) {
      this.bulkQrSession = result;
      this.bulkQrScanning.set(true);
      return;
    }
    this.handleBulkQrStartFailure(result);
  }

  async pauseBulkQrScan(): Promise<void> {
    await this.bulkQrSession?.stop();
    this.bulkQrSession = undefined;
    this.bulkQrScanning.set(false);
    this.bulkQrPaused.set(true);
  }

  async resumeBulkQrScan(): Promise<void> {
    if (!this.bulkQrPaused()) return;
    await this.startBulkQrScan();
  }

  async stopBulkQrScan(): Promise<void> {
    await this.bulkQrSession?.stop();
    this.bulkQrSession = undefined;
    this.bulkQrScanning.set(false);
    this.bulkQrPaused.set(false);
  }

  exitBulkManualCheckIn(): void {
    void this.stopBulkQrScan();
    this.bulkMode.set(false);
    this.bulkReview.set(false);
    this.bulkResults.set([]);
    this.checkInQueue.clear();
    this.syncQueue();
  }

  reviewBulkSelection(): void {
    if (this.bulkQrScanning()) void this.pauseBulkQrScan();
    if (this.queueItems().length) this.bulkReview.set(true);
  }

  backToBulkSelection(): void {
    this.bulkReview.set(false);
  }

  removeQueuedMember(memberId: string): void {
    this.checkInQueue.remove(memberId);
    this.syncQueue();
  }

  async confirmBulkCheckIn(): Promise<void> {
    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    const selected = this.queueItems();
    if (!organizationId || !branchId || !selected.length || this.bulkSubmitting() || !this.attendance.canRecordAttendance()) return;
    const version = this.requestVersion;
    this.bulkSubmittedItems.set(selected);
    this.bulkSubmitting.set(true);
    try {
      const response = await firstValueFrom(this.api.recordBulkManualCheckIn(
        organizationId,
        this.sessionId,
        selected.map((item) => ({
          idempotency_key: item.idempotencyKey,
          member_id: item.memberId,
          method: item.source,
        })),
      ));
      if (version !== this.requestVersion || this.workspace.selectedOrganizationId() !== organizationId || this.workspace.selectedBranchId() !== branchId) return;
      this.bulkResults.set(response.results);
      for (const result of response.results) {
        if (result.status === 'checked_in' || result.status === 'already_attended') {
          const item = selected.find((candidate) => candidate.idempotencyKey === result.idempotency_key);
          if (item) this.checkInQueue.remove(item.memberId);
        }
      }
      this.syncQueue();
      const checkedIn = response.results.filter((result) => result.status === 'checked_in').length;
      const failed = response.results.length - checkedIn;
      if (checkedIn) await this.notifications.success(`${checkedIn} member${checkedIn === 1 ? '' : 's'} checked in successfully.`);
      if (failed) await this.notifications.warning(`${failed} member${failed === 1 ? '' : 's'} could not be checked in. Review the results and retry if appropriate.`);
      this.bulkReview.set(true);
      await this.refreshSummary();
    } catch {
      await this.notifications.error('The bulk check-in could not be completed. Your selection was preserved so you can retry.');
    } finally {
      this.bulkSubmitting.set(false);
    }
  }

  isQueued(memberId: string): boolean {
    return this.checkInQueue.has(memberId);
  }

  memberSelectionLabel(member: AttendanceMemberLookup): string {
    const name = `${member.first_name} ${member.last_name}`.trim();
    if (member.already_attended) return `${name}, already attended`;
    return this.isQueued(member.id)
      ? `Remove ${name} from bulk check-in selection`
      : `Select ${name} for bulk check-in`;
  }

  bulkResultFor(item: AttendanceCheckInQueueItem): BulkAttendanceCheckInResult | undefined {
    return this.bulkResults().find((result) => result.idempotency_key === item.idempotencyKey);
  }

  private syncQueue(): void {
    this.queueItems.set(this.checkInQueue.items());
  }

  private handleBulkQrStartFailure(result: QrScanOutcome): void {
    if (result.kind === 'permission_denied') this.scannerMessage.set('Camera access is required for continuous QR scanning.');
    else if (result.kind === 'unsupported') this.scannerMessage.set('Continuous QR scanning is available in the native app.');
    else this.scannerMessage.set('The continuous QR scanner is unavailable on this device.');
  }

  private async handleBulkQrOutcome(outcome: QrContinuousScanOutcome): Promise<void> {
    if (outcome.kind === 'paused') {
      this.bulkQrSession = undefined;
      this.bulkQrScanning.set(false);
      this.bulkQrPaused.set(true);
      return;
    }
    if (outcome.kind === 'invalid_payload') {
      await this.notifications.warning('This is not a valid Peniel membership QR code.', { id: 'bulk-qr-invalid' });
      return;
    }
    if (outcome.kind !== 'scanned' || this.bulkQrResolutionInFlight() || !this.bulkQrScanning()) return;

    const now = Date.now();
    for (const [identifier, timestamp] of this.recentQrScans) {
      if (now - timestamp > 3000) this.recentQrScans.delete(identifier);
    }
    const previousScan = this.recentQrScans.get(outcome.qrIdentifier);
    this.recentQrScans.set(outcome.qrIdentifier, now);
    if (previousScan !== undefined) {
      await this.notifications.info('This QR code was already scanned.');
      return;
    }

    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    if (!organizationId || !branchId || !this.sessionId) return;
    this.bulkQrResolutionInFlight.set(true);
    try {
      const authorized = await this.refreshScanAuthorization(this.requestVersion, organizationId, branchId);
      if (!authorized || !this.bulkQrScanning()) return;
      const preview = await firstValueFrom(this.api.previewQrCheckIn(organizationId, this.sessionId, outcome.qrIdentifier));
      if (!this.bulkQrScanning()) return;
      if (preview.attendance_status === 'already_checked_in') {
        await this.notifications.warning('Already checked in. This member was not added to the queue.');
        return;
      }
      if (this.checkInQueue.has(preview.member_id)) {
        await this.notifications.info('This member is already queued.');
        return;
      }
      this.checkInQueue.addQr({
        id: preview.member_id,
        membership_number: preview.membership_number,
        first_name: preview.display_name,
        last_name: '',
      });
      this.syncQueue();
      await Haptics.vibrate({ duration: 30 }).catch(() => undefined);
      await this.notifications.success(`${preview.display_name} added to the queue.`);
    } catch (error: unknown) {
      await this.handleQrPreviewError(error);
    } finally {
      this.bulkQrResolutionInFlight.set(false);
    }
  }

  async scanQr(): Promise<void> {
    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    if (!organizationId || !branchId || !this.sessionId || !this.attendance.canRecordAttendance()) return;
    if (this.checkInInFlight() || this.qrScanInFlight() || this.recordingUnavailableMessage()) return;

    const version = this.requestVersion;
    this.qrScanInFlight.set(true);
    this.scannerMessage.set(null);
    this.qrPreview.set(null);
    try {
      const scan = await this.qrScanner.scan();
      if (scan.kind === 'cancelled') return;
      if (scan.kind === 'unsupported') {
        this.scannerMessage.set('QR scanning is available in the native app. Use member search in the browser.');
        return;
      }
      if (scan.kind === 'permission_denied') {
        this.scannerMessage.set('Camera access is required to scan a member QR code.');
        return;
      }
      if (scan.kind === 'invalid_payload') {
        await this.notifications.warning('This is not a valid Peniel membership QR code.');
        return;
      }
      if (scan.kind === 'unavailable') {
        this.scannerMessage.set('The QR scanner is unavailable on this device. Use member search instead.');
        return;
      }
      const authorized = await this.refreshScanAuthorization(version, organizationId, branchId);
      if (!authorized) return;

      let preview: AttendanceQrPreviewResponse;
      try {
        preview = await firstValueFrom(this.api.previewQrCheckIn(organizationId, this.sessionId, scan.qrIdentifier));
      } catch (error: unknown) {
        await this.handleQrPreviewError(error);
        return;
      }
      if (!this.isCurrentScan(version, organizationId, branchId)) {
        await this.notifyAuthorizationChanged();
        return;
      }
      if (preview.attendance_status === 'already_checked_in') {
        await this.notifications.warning(`${preview.display_name} is already checked in to this session.`);
        return;
      }
      this.qrPreview.set(preview);
      const sessionName = this.session()?.service_type_name_snapshot || this.session()?.service_type.name || 'this session';
      const sessionDate = this.session() ? this.formatDate(this.session()!.local_occurrence_date) : 'this session';
      const confirmed = await this.notifications.confirm({
        title: 'Confirm QR check-in',
        message: `${preview.display_name} (${preview.membership_number}) will be checked in to ${sessionName} on ${sessionDate}.`,
        confirmLabel: 'Check in',
      });
      if (!confirmed) return;
      if (!this.isCurrentScan(version, organizationId, branchId)) {
        await this.notifyAuthorizationChanged();
        return;
      }

      this.checkInInFlight.set(true);
      const response = await firstValueFrom(this.api.recordQrCheckIn(organizationId, this.sessionId, scan.qrIdentifier));
      if (!this.isCurrentScan(version, organizationId, branchId)) {
        await this.notifications.error('The check-in response was received, but attendance authorization changed. Refresh the session before trying again.');
        return;
      }
      await this.handleCheckInResponse(response);
    } catch (error: unknown) {
      await this.handleCheckInError(error);
    } finally {
      this.qrPreview.set(null);
      this.qrScanInFlight.set(false);
      this.checkInInFlight.set(false);
    }
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
    if (!member || !organizationId || !branchId || !this.attendance.canRecordAttendance() || this.checkInInFlight() || this.qrScanInFlight()) return;
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

  private async handleQrPreviewError(error: unknown): Promise<void> {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 0) {
      await this.notifications.error('We could not connect to attendance verification. Check your connection and try again.');
      return;
    }
    if (status === 401) {
      await this.notifications.error('Your session has expired. Please sign in again.');
      return;
    }
    if (status === 400) {
      await this.notifications.warning('This is not a valid Peniel membership QR code.');
      return;
    }
    if (status === 403 || status === 404) {
      await this.notifications.warning('This QR code could not be verified for this attendance session.');
      return;
    }
    await this.notifications.error('Attendance verification is temporarily unavailable. Please try again.');
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

  private isCurrentScan(version: number, organizationId: string, branchId: string): boolean {
    return this.isCurrent(version, organizationId, branchId) && this.attendance.canRecordAttendance();
  }

  private async refreshScanAuthorization(version: number, organizationId: string, branchId: string): Promise<boolean> {
    const refreshed = await this.workspaceAuthorization.refresh('app-resume');
    if (refreshed && this.isCurrentScan(version, organizationId, branchId)) return true;
    await this.notifyAuthorizationChanged();
    return false;
  }

  private notifyAuthorizationChanged(): Promise<void> {
    return this.notifications.error('Your attendance authorization changed. Reopen the session before scanning again.');
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
