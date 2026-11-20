import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { IonContent, IonHeader, IonIcon, IonInfiniteScroll, IonInfiniteScrollContent, IonItem, IonLabel, IonList, IonSearchbar, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, ellipseOutline, peopleOutline, qrCodeOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { AttendancePermissionService } from '../../../core/attendance/attendance-permission.service';
import { AttendanceCheckInQueueItem, AttendanceCheckInQueueService } from '../../../core/attendance/attendance-check-in-queue.service';
import { AttendanceSessionApiService } from '../../../core/attendance/attendance-session-api.service';
import { AttendanceCheckInResponse, AttendanceMemberLookup, AttendanceQrPreviewResponse, AttendanceSession, AttendanceSessionSummary, BulkAttendanceCheckInResult } from '../../../core/attendance/attendance.models';
import { AuthService } from '../../../core/auth/auth.service';
import { QrContinuousScanOutcome, QrContinuousScanSession, QrContinuousScanStopReason, QrScanOutcome, QrScannerService } from '../../../core/attendance/qr-scanner.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { WorkspaceAuthorizationService } from '../../../core/workspace/workspace-authorization.service';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { AppFeedbackStateComponent } from '../../../shared/ui/app-feedback-state/app-feedback-state.component';
import { AppPageShellComponent } from '../../../shared/ui/app-page-shell/app-page-shell.component';
import { AppButtonComponent } from '../../../shared/ui/app-button/app-button.component';

interface ScanAuthorizationSnapshot {
  readonly userId: string | null;
  readonly organizationId: string | null;
  readonly branchId: string | null;
  readonly canRecord: boolean;
  readonly capabilityFingerprint: string;
}

type QrFeedbackKind = 'success' | 'info' | 'warning' | 'error';
interface QrFeedback {
  readonly kind: QrFeedbackKind;
  readonly message: string;
}

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
  // A newly created page has not attempted its first load yet. Starting in
  // loading prevents the template from interpreting the initial null session
  // as a confirmed unavailable result during native scanner re-entry.
  readonly loading = signal(true);
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
  readonly scanAuthorizationRefreshing = signal(false);
  readonly qrFeedback = signal<QrFeedback | null>(null);
  readonly bulkReview = signal(false);
  readonly individualCheckInExpanded = signal(false);
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
  private bulkQrContextKey: string | null = null;
  private componentAlive = true;
  private appForeground = true;
  private appStateListener: PluginListenerHandle | undefined;
  private readonly recentQrScans = new Map<string, number>();
  private scanAuthorizationSnapshot: ScanAuthorizationSnapshot | null = null;
  private qrFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
  private loadedSessionContext: { organizationId: string; branchId: string; sessionId: string } | null = null;

  constructor() {
    addIcons({ checkmarkCircle, ellipseOutline, peopleOutline, qrCodeOutline });
    this.sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        this.appForeground = isActive;
      }).then((handle) => {
        if (this.componentAlive) this.appStateListener = handle;
        else void handle.remove();
      }).catch(() => undefined);
    }
    effect(() => {
      const organizationId = this.workspace.selectedOrganizationId();
      const branchId = this.workspace.selectedBranchId();
      const key = `${organizationId ?? ''}:${branchId ?? ''}:${this.attendance.canViewAttendance()}:${this.sessionId}`;
      const scanBusy = this.qrScanInFlight() || this.bulkQrScanning() || this.checkInInFlight();
      if (scanBusy) {
        if (key !== this.lastKey && this.bulkQrScanning()) {
          const organizationId = this.workspace.selectedOrganizationId();
          const branchId = this.workspace.selectedBranchId();
          const contextIsTemporarilyUnavailable = !organizationId || !branchId;
          const contextChanged = this.bulkQrContextKey !== `${organizationId ?? ''}:${branchId ?? ''}`;
          const authorizationState = this.workspace.authorizationState();
          const authorizationResolved = authorizationState === 'allowed' || authorizationState === 'denied';
          // WorkspaceAuthorizationService refreshes authorization on Android
          // resume. Its reload briefly clears the selected context before
          // restoring the same authorized organization/branch. Do not kill a
          // queued QR sequence during that transient state; a real context
          // change or capability loss still stops it immediately.
          if (!contextIsTemporarilyUnavailable && contextChanged) {
            void this.stopBulkQrScan('context_changed');
          } else if (!contextIsTemporarilyUnavailable && authorizationResolved && !this.attendance.canRecordAttendance()) {
            void this.stopBulkQrScan('authorization_revoked');
          }
        }
        if (key !== this.lastKey) this.deferredContextLoad = true;
        this.lastKey = key;
        return;
      }
      if (this.deferredContextLoad) {
        this.deferredContextLoad = false;
        this.lastKey = key;
        if (this.workspace.authorizationState() === 'loading' && (!organizationId || !branchId) && this.session()) return;
        void this.load();
        return;
      }
      if (key === this.lastKey) return;
      this.lastKey = key;
      if (this.workspace.authorizationState() === 'loading' && (!organizationId || !branchId) && this.session()) return;
      void this.load();
    });
  }

  ngOnDestroy(): void {
    this.componentAlive = false;
    void this.appStateListener?.remove();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.qrFeedbackTimer) clearTimeout(this.qrFeedbackTimer);
    void this.stopBulkQrScan('component_destroyed');
    void this.qrScanner.stop();
    this.scanAuthorizationSnapshot = null;
  }

  async load(): Promise<void> {
    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    const version = ++this.requestVersion;
    const authorizationState = this.workspace.authorizationState();
    const authorizationPending = authorizationState === 'unknown'
      || authorizationState === 'loading'
      || (authorizationState !== 'denied' && !this.workspace.authorizationVerified());
    const sameLoadedContext = Boolean(
      this.loadedSessionContext
      && this.loadedSessionContext.sessionId === this.sessionId
      && (!organizationId || this.loadedSessionContext.organizationId === organizationId)
      && (!branchId || this.loadedSessionContext.branchId === branchId),
    );
    // Authorization refreshes can briefly clear the selected workspace.
    // Do not turn that incomplete state into a new queue context.
    if (organizationId && branchId && this.sessionId) {
      this.checkInQueue.setContext(
        this.auth.user()?.id ?? '',
        organizationId,
        branchId,
        this.sessionId,
      );
    }
    this.syncQueue();
    this.memberError.set(false);
    if (!organizationId || !branchId || !this.sessionId || authorizationPending || authorizationState === 'denied' || !this.attendance.canViewAttendance()) {
      // Returning from the native scanner can briefly leave the workspace
      // context incomplete while authorization is refreshed. Keep the last
      // verified session visible during that interval; interactive controls
      // remain guarded by the live attendance permission signals.
      if (authorizationPending && sameLoadedContext && this.session()) {
        this.loading.set(false);
        this.error.set(false);
        return;
      }
      this.session.set(null);
      this.summary.set(null);
      this.loadedSessionContext = null;
      this.loading.set(authorizationPending);
      this.error.set(!authorizationPending && Boolean(this.sessionId));
      return;
    }
    // A same-context refresh must not discard a verified session while its
    // replacement is still in flight. The backend response remains decisive.
    if (!sameLoadedContext) {
      this.session.set(null);
      this.summary.set(null);
      this.loadedSessionContext = null;
    }
    this.members.set([]);
    this.memberNextPage.set(null);
    this.memberSearch = '';
    const memberVersion = ++this.memberRequestVersion;
    this.selectedMember.set(null);
    this.qrPreview.set(null);
    this.scannerMessage.set(null);
    this.qrFeedback.set(null);
    this.error.set(false);
    this.loading.set(true);
    try {
      const session = await firstValueFrom(this.api.getSession(organizationId, this.sessionId));
      if (!this.isCurrent(version, organizationId, branchId)) {
        return;
      }
      this.session.set(session);
      this.loadedSessionContext = { organizationId, branchId, sessionId: this.sessionId };
      const showMemberSearch = this.bulkMode() || this.individualCheckInExpanded();
      if (showMemberSearch) this.memberLoading.set(true);
      const [summaryResult, membersResult] = await Promise.allSettled([
        firstValueFrom(this.api.getAttendanceSummary(organizationId, this.sessionId)),
        showMemberSearch ? firstValueFrom(this.api.searchMembers(organizationId, this.sessionId)) : Promise.resolve(null),
      ]);
      if (!this.isCurrent(version, organizationId, branchId)) return;
      if (summaryResult.status === 'rejected') throw summaryResult.reason;
      this.summary.set(summaryResult.value);
      if (membersResult.status === 'fulfilled' && membersResult.value && memberVersion === this.memberRequestVersion) {
        this.applyMemberPage(membersResult.value.results, membersResult.value.next ?? null, true);
      } else if (membersResult.status === 'rejected' && memberVersion === this.memberRequestVersion) {
        this.members.set([]);
        this.memberError.set(true);
      }
    } catch {
      if (this.isCurrent(version, organizationId, branchId)) {
        this.session.set(null);
        this.summary.set(null);
        this.loadedSessionContext = null;
        this.error.set(true);
      }
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
    this.ensureQueueContext();
    this.individualCheckInExpanded.set(false);
    this.bulkMode.set(true);
    this.bulkReview.set(false);
    this.bulkResults.set([]);
    this.bulkSubmittedItems.set([]);
    this.syncQueue();
    void this.searchMembers();
  }

  async startBulkQrScan(): Promise<void> {
    if (!this.attendance.canRecordAttendance() || this.recordingUnavailableMessage() || this.bulkSubmitting() || this.qrScanInFlight()) return;
    this.ensureQueueContext();
    this.individualCheckInExpanded.set(false);
    this.bulkMode.set(true);
    this.bulkReview.set(false);
    this.bulkQrPaused.set(false);
    this.scannerMessage.set(null);
    this.qrFeedback.set(null);
    // Mark the page active before opening the native scanner. Android can
    // deliver the first decode callback before startContinuousScan resolves.
    this.bulkQrScanning.set(true);
    this.scanAuthorizationSnapshot = this.captureScanAuthorization();
    this.bulkQrContextKey = `${this.workspace.selectedOrganizationId() ?? ''}:${this.workspace.selectedBranchId() ?? ''}`;
    const result = await this.qrScanner.startContinuousScan((outcome) => this.handleBulkQrOutcome(outcome));
    if ('stop' in result) {
      this.bulkQrSession = result;
      return;
    }
    this.bulkQrScanning.set(false);
    this.bulkQrPaused.set(false);
    this.bulkQrContextKey = null;
    this.handleBulkQrStartFailure(result);
  }

  toggleIndividualCheckIn(): void {
    const expanded = !this.individualCheckInExpanded();
    this.individualCheckInExpanded.set(expanded);
    if (expanded) void this.searchMembers();
  }

  async pauseBulkQrScan(): Promise<void> {
    await this.bulkQrSession?.stop('paused');
    this.bulkQrSession = undefined;
    this.bulkQrScanning.set(false);
    this.bulkQrPaused.set(true);
    this.bulkQrContextKey = null;
  }

  async resumeBulkQrScan(): Promise<void> {
    if (!this.bulkQrPaused()) return;
    await this.startBulkQrScan();
  }

  async stopBulkQrScan(reason: QrContinuousScanStopReason = 'operator'): Promise<void> {
    await this.bulkQrSession?.stop(reason);
    this.bulkQrSession = undefined;
    this.bulkQrScanning.set(false);
    this.bulkQrPaused.set(false);
    this.bulkQrContextKey = null;
    this.scanAuthorizationSnapshot = null;
  }

  exitBulkManualCheckIn(): void {
    void this.stopBulkQrScan();
    this.bulkMode.set(false);
    this.bulkReview.set(false);
    this.bulkResults.set([]);
    this.checkInQueue.clear();
    this.syncQueue();
  }

  async reviewBulkSelection(): Promise<void> {
    if (this.bulkQrScanning()) await this.pauseBulkQrScan();
    if (this.queueItems().length) this.bulkReview.set(true);
  }

  async discardBulkSelection(): Promise<void> {
    if (!this.queueItems().length) {
      this.exitBulkManualCheckIn();
      return;
    }
    const confirmed = await this.notifications.confirm({
      title: 'Discard selection?',
      message: 'The selected members will be removed from this pending check-in.',
      confirmLabel: 'Discard selection',
      destructive: true,
    });
    if (confirmed) this.exitBulkManualCheckIn();
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
          ...(item.source === 'qr'
            ? { qr_identifier: item.qrIdentifier, method: 'qr' as const }
            : { member_id: item.memberId, method: 'manual' as const }),
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
    } catch (error: unknown) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      const message = status === 409
        ? 'This session is no longer accepting attendance. Your selection was preserved.'
        : status === 401
          ? 'Your session expired. Sign in again before retrying.'
          : status === 0
            ? 'The check-in request could not reach the server. Check your connection and retry.'
            : 'The check-in request was rejected. Your selection was preserved so you can retry.';
      await this.notifications.error(message);
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
      ? `Remove ${name} from manual check-in selection`
      : `Select ${name} for manual check-in`;
  }

  bulkResultFor(item: AttendanceCheckInQueueItem): BulkAttendanceCheckInResult | undefined {
    return this.bulkResults().find((result) => result.idempotency_key === item.idempotencyKey);
  }

  private syncQueue(): void {
    this.queueItems.set(this.checkInQueue.items());
  }

  private ensureQueueContext(): void {
    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    if (!organizationId || !branchId || !this.sessionId) return;
    this.checkInQueue.setContext(
      this.auth.user()?.id ?? '',
      organizationId,
      branchId,
      this.sessionId,
    );
    this.syncQueue();
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
      this.bulkQrContextKey = null;
      this.scanAuthorizationSnapshot = null;
      return;
    }
    if (outcome.kind === 'cancelled') {
      this.bulkQrSession = undefined;
      this.bulkQrScanning.set(false);
      this.bulkQrPaused.set(true);
      this.bulkQrContextKey = null;
      this.scanAuthorizationSnapshot = null;
      return;
    }
    if (outcome.kind === 'unsupported' || outcome.kind === 'permission_denied' || outcome.kind === 'unavailable') {
      this.bulkQrSession = undefined;
      this.bulkQrScanning.set(false);
      this.bulkQrPaused.set(true);
      this.bulkQrContextKey = null;
      this.scanAuthorizationSnapshot = null;
      this.handleBulkQrStartFailure(outcome);
      return;
    }
    if (outcome.kind === 'invalid_payload') {
      this.setQrFeedback('Invalid membership QR code.', 'warning');
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
      this.setQrFeedback('Already scanned. Try another member card.', 'info');
      return;
    }

    const organizationId = this.workspace.selectedOrganizationId();
    const branchId = this.workspace.selectedBranchId();
    if (!organizationId || !branchId || !this.sessionId) return;
    this.bulkQrResolutionInFlight.set(true);
    try {
      const authorized = await this.refreshScanAuthorization(this.scanAuthorizationSnapshot);
      if (!authorized || !this.bulkQrScanning()) return;
      const preview = await firstValueFrom(this.api.previewQrCheckIn(organizationId, this.sessionId, outcome.qrIdentifier));
      if (!this.bulkQrScanning()) return;
      if (!this.scanAuthorizationMatches(this.scanAuthorizationSnapshot)) {
        await this.notifyAuthorizationChanged(true);
        return;
      }
      if (preview.attendance_status === 'already_checked_in') {
        this.setQrFeedback('Already checked in. Not added to selection.', 'warning');
        return;
      }
      if (this.checkInQueue.has(preview.member_id)) {
        this.setQrFeedback('Already selected. Try another member card.', 'info');
        return;
      }
      this.checkInQueue.addQr({
        id: preview.member_id,
        membership_number: preview.membership_number,
        first_name: preview.display_name,
        last_name: '',
      }, outcome.qrIdentifier);
      this.syncQueue();
      await Haptics.vibrate({ duration: 30 }).catch(() => undefined);
      this.setQrFeedback(`Member added. ${this.queueItems().length} selected.`, 'success');
    } catch (error: unknown) {
      await this.handleQrPreviewError(error, true);
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
    const authorizationSnapshot = this.captureScanAuthorization();
    this.scanAuthorizationSnapshot = authorizationSnapshot;
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
      const authorized = await this.refreshScanAuthorization(authorizationSnapshot);
      if (!authorized) return;

      let preview: AttendanceQrPreviewResponse;
      try {
        preview = await firstValueFrom(this.api.previewQrCheckIn(organizationId, this.sessionId, scan.qrIdentifier));
      } catch (error: unknown) {
        await this.handleQrPreviewError(error);
        return;
      }
      if (!this.isCurrentScan(version, organizationId, branchId, authorizationSnapshot)) {
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
      if (!this.isCurrentScan(version, organizationId, branchId, authorizationSnapshot)) {
        await this.notifyAuthorizationChanged();
        return;
      }

      this.checkInInFlight.set(true);
      const response = await firstValueFrom(this.api.recordQrCheckIn(organizationId, this.sessionId, scan.qrIdentifier));
      if (!this.isCurrentScan(version, organizationId, branchId, authorizationSnapshot)) {
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
      this.scanAuthorizationSnapshot = null;
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
    if (!confirmed || this.workspace.selectedOrganizationId() !== organizationId || this.workspace.selectedBranchId() !== branchId || !this.attendance.canRecordAttendance()) return;
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

  private async handleQrPreviewError(error: unknown, bulk = false): Promise<void> {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (bulk) {
      const message = status === 0
        ? 'Could not connect. Try scanning again.'
        : status === 400
          ? 'Invalid membership QR code.'
          : status === 401
            ? 'Session expired. Sign in again.'
            : status === 403 || status === 404
              ? 'QR code could not be verified for this session.'
              : 'Verification unavailable. Try again.';
      this.setQrFeedback(message, status === 0 || status >= 500 ? 'error' : 'warning');
      return;
    }
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

  private setQrFeedback(message: string, kind: QrFeedbackKind): void {
    if (this.qrFeedbackTimer) clearTimeout(this.qrFeedbackTimer);
    this.qrFeedback.set({ message, kind });
    this.qrFeedbackTimer = setTimeout(() => {
      this.qrFeedback.set(null);
      this.qrFeedbackTimer = undefined;
    }, 2200);
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
      && this.workspace.selectedBranchId() === branchId
      && this.workspace.authorizationState() === 'allowed'
      && this.workspace.authorizationVerified()
      && this.attendance.canViewAttendance();
  }

  private isCurrentScan(
    _version: number,
    organizationId: string,
    branchId: string,
    snapshot: ScanAuthorizationSnapshot | null = this.scanAuthorizationSnapshot,
  ): boolean {
    return this.workspace.selectedOrganizationId() === organizationId
      && this.workspace.selectedBranchId() === branchId
      && this.attendance.canRecordAttendance()
      && this.scanAuthorizationMatches(snapshot);
  }

  private async refreshScanAuthorization(snapshot: ScanAuthorizationSnapshot | null): Promise<boolean> {
    this.scanAuthorizationRefreshing.set(true);
    try {
      const refreshed = await this.workspaceAuthorization.refresh('app-resume');
      if (!refreshed) {
        if (this.bulkQrScanning()) this.setQrFeedback('Could not refresh access. Try scanning again.', 'error');
        else await this.notifications.error('We could not refresh your attendance authorization. Check your connection and try again.');
        return false;
      }
      const current = this.captureScanAuthorization();
      const differences = this.authorizationDifferences(snapshot, current);
      if (!differences.length && this.scanAuthorizationMatches(snapshot)) return true;
      await this.notifyAuthorizationChanged(this.bulkQrScanning());
      return false;
    } finally {
      this.scanAuthorizationRefreshing.set(false);
    }
  }

  private captureScanAuthorization(): ScanAuthorizationSnapshot {
    const capabilities = this.workspace.attendanceCapabilities();
    const sorted = (values: readonly string[] | undefined): string[] => [...(values ?? [])].sort();
    const scopes = (capabilities?.ad_hoc_scopes ?? [])
      .map(scope => ({
        branchId: scope.branch_id,
        groupScope: scope.group_scope,
        groupIds: sorted(scope.group_ids),
      }))
      .sort((left, right) => left.branchId.localeCompare(right.branchId));
    return {
      userId: this.auth.user()?.id ?? null,
      organizationId: this.workspace.selectedOrganizationId(),
      branchId: this.workspace.selectedBranchId(),
      canRecord: this.attendance.canRecordAttendance(),
      capabilityFingerprint: JSON.stringify({
        organizationId: capabilities?.organization_id ?? null,
        canViewAttendance: capabilities?.can_view_attendance ?? false,
        canCreateAdHocSession: capabilities?.can_create_ad_hoc_session ?? false,
        canManageAttendanceSessions: capabilities?.can_manage_attendance_sessions ?? false,
        viewBranchIds: sorted(capabilities?.view_branch_ids),
        sessionManagementBranchIds: sorted(capabilities?.session_management_branch_ids),
        adHocScopes: scopes,
      }),
    };
  }

  private scanAuthorizationMatches(snapshot: ScanAuthorizationSnapshot | null): boolean {
    return snapshot !== null && this.authorizationDifferences(snapshot, this.captureScanAuthorization()).length === 0;
  }

  private authorizationDifferences(
    before: ScanAuthorizationSnapshot | null,
    after: ScanAuthorizationSnapshot,
  ): string[] {
    if (!before) return ['snapshot'];
    const differences: string[] = [];
    if (before.userId !== after.userId) differences.push('user');
    if (before.organizationId !== after.organizationId) differences.push('organization');
    if (before.branchId !== after.branchId) differences.push('branch');
    if (before.canRecord !== after.canRecord) differences.push('record_permission');
    if (before.capabilityFingerprint !== after.capabilityFingerprint) differences.push('attendance_scope');
    return differences;
  }

  private notifyAuthorizationChanged(bulk = false): Promise<void> {
    if (bulk) {
      this.setQrFeedback('Attendance access changed. Scanning stopped.', 'error');
      return Promise.resolve();
    }
    return this.notifications.error('Your attendance authorization changed. Reopen the session before scanning again.');
  }

  formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)); }
  formatTime(value: string): string { return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(value)); }
}

export function getRecordingUnavailableMessage(session: AttendanceSession, now: number): string | null {
  if (session.archived_at) {
    return 'This attendance session is archived and cannot accept new attendance.';
  }
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
