import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SessionDetailPage } from './session-detail.page';
import { AuthService } from '../../../core/auth/auth.service';
import { getRecordingUnavailableMessage } from './session-detail.page';
import { AttendanceMemberLookup, AttendanceSession } from '../../../core/attendance/attendance.models';
import { AttendanceSessionApiService } from '../../../core/attendance/attendance-session-api.service';
import { AttendancePermissionService } from '../../../core/attendance/attendance-permission.service';
import { QrScannerService } from '../../../core/attendance/qr-scanner.service';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { WorkspaceAuthorizationService } from '../../../core/workspace/workspace-authorization.service';

describe('SessionDetailPage', () => {
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  let fixture: ComponentFixture<SessionDetailPage>;
  const workspace = {
    selectedOrganizationId: vi.fn(() => 'org-1'),
    selectedBranchId: vi.fn(() => 'branch-1'),
    authorizationState: vi.fn(() => 'allowed' as 'unknown' | 'loading' | 'allowed' | 'denied'),
    authorizationVerified: vi.fn(() => true),
    attendanceCapabilities: vi.fn(() => ({
      organization_id: 'org-1',
      can_view_attendance: true,
      can_create_ad_hoc_session: true,
      can_manage_attendance_sessions: false,
      can_manage_recurring_schedules: false,
      can_generate_annual_sessions: false,
      can_manage_attendance_settings: false,
      can_manage_service_types: false,
      can_manage_organization_service_types: false,
      view_branch_ids: ['branch-1'],
      session_management_branch_ids: [],
      recurring_schedule_management_branch_ids: [],
      service_type_management_branch_ids: [],
      ad_hoc_scopes: [{ branch_id: 'branch-1', group_scope: 'selected_groups', group_ids: ['group-2', 'group-1'] }],
    })),
  };
  const attendance = { resolved: vi.fn(() => true), canViewAttendance: vi.fn(() => true), canRecordAttendance: vi.fn(() => true) };
  const api: any = {
    getSession: vi.fn(() => of(null)),
    getAttendanceSummary: vi.fn(() => of(null)),
    searchMembers: vi.fn(() => of({ results: [] })),
    recordBulkManualCheckIn: vi.fn(() => of({ results: [] })),
    previewQrCheckIn: vi.fn(() => of({ display_name: 'Member', membership_number: 'P-001', attendance_status: 'not_checked_in' })),
    recordQrCheckIn: vi.fn(() => of({ outcome: 'recorded' })),
  };
  const qrScanner = { scan: vi.fn(), startContinuousScan: vi.fn(), stop: vi.fn() };
  const notifications = { confirm: vi.fn(() => Promise.resolve(false)), warning: vi.fn(), error: vi.fn(), success: vi.fn() };
  const workspaceAuthorization = { refresh: vi.fn(() => Promise.resolve(true)) };
  const auth = { user: vi.fn(() => ({ id: 'user-1' })) };

  beforeEach(async () => {
    vi.clearAllMocks();
    workspace.selectedOrganizationId.mockReturnValue('org-1');
    workspace.selectedBranchId.mockReturnValue('branch-1');
    workspace.authorizationState.mockReturnValue('allowed');
    workspace.authorizationVerified.mockReturnValue(true);
    attendance.canViewAttendance.mockReturnValue(true);
    attendance.canRecordAttendance.mockReturnValue(true);
    await TestBed.configureTestingModule({
      imports: [SessionDetailPage],
      providers: [
        { provide: WorkspaceStateService, useValue: workspace },
        { provide: AttendancePermissionService, useValue: attendance },
        { provide: AttendanceSessionApiService, useValue: api },
        { provide: QrScannerService, useValue: qrScanner },
        { provide: NotificationService, useValue: notifications },
        { provide: WorkspaceAuthorizationService, useValue: workspaceAuthorization },
        { provide: AuthService, useValue: auth },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'session-1' } } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SessionDetailPage);
  });

  it('creates a detail view for an authorized workspace', () => {
    expect(fixture.componentInstance.sessionId).toBe('session-1');
  });

  it('keeps individual check-in collapsed until explicitly opened', () => {
    const page = fixture.componentInstance;
    expect(page.individualCheckInExpanded()).toBe(false);
    page.toggleIndividualCheckIn();
    expect(page.individualCheckInExpanded()).toBe(true);
    page.toggleIndividualCheckIn();
    expect(page.individualCheckInExpanded()).toBe(false);
  });

  it('loads member-search pages, deduplicates overlaps, and exposes the next page', async () => {
    api.searchMembers
      .mockReturnValueOnce(of({
        count: 28, next: 2, previous: null,
        results: [{ id: 'member-1', membership_number: 'A', first_name: 'Ada', last_name: 'Lovelace' }],
      }))
      .mockReturnValueOnce(of({
        count: 28, next: null, previous: 1,
        results: [
          { id: 'member-1', membership_number: 'A', first_name: 'Ada', last_name: 'Lovelace' },
          { id: 'member-2', membership_number: 'B', first_name: 'Grace', last_name: 'Hopper' },
        ],
      }));
    const page = fixture.componentInstance;
    await page.searchMembers('');
    expect(page.memberNextPage()).toBe(2);
    const event = { target: { complete: vi.fn() } };
    await page.loadMoreMembers(event);
    expect(page.members().map((member) => member.id)).toEqual(['member-1', 'member-2']);
    expect(page.memberNextPage()).toBe(null);
    expect(event.target.complete).toHaveBeenCalledOnce();
  });

  it('queues selected members without recording until bulk confirmation', async () => {
    const page = fixture.componentInstance;
    const member = { id: 'member-1', membership_number: 'P-001', first_name: 'Ada', last_name: 'Lovelace' };
    await page.searchMembers('');
    page.startBulkManualCheckIn();
    page.selectMember(member);
    expect(page.queueItems()).toHaveLength(1);
    expect(api.recordBulkManualCheckIn).not.toHaveBeenCalled();
    await page.reviewBulkSelection();
    await page.confirmBulkCheckIn();
    expect(api.recordBulkManualCheckIn).toHaveBeenCalledOnce();
  });

  it('does not open scanner review with an empty queue and opens it after selection', async () => {
    const page = fixture.componentInstance;
    page.startBulkManualCheckIn();
    await page.reviewBulkSelection();
    expect(page.bulkReview()).toBe(false);

    page.selectMember({ id: 'member-1', membership_number: 'P-001', first_name: 'Ada', last_name: 'Lovelace' });
    page.bulkQrScanning.set(true);
    await page.reviewBulkSelection();
    expect(page.bulkReview()).toBe(true);
    expect(page.bulkQrPaused()).toBe(true);
  });

  it('clears the queue only after explicit discard confirmation', async () => {
    const page = fixture.componentInstance;
    page.startBulkManualCheckIn();
    page.selectMember({ id: 'member-1', membership_number: 'P-001', first_name: 'Ada', last_name: 'Lovelace' });

    notifications.confirm.mockResolvedValueOnce(false);
    await page.discardBulkSelection();
    expect(page.queueItems()).toHaveLength(1);

    notifications.confirm.mockResolvedValueOnce(true);
    await page.discardBulkSelection();
    expect(page.queueItems()).toHaveLength(0);
  });

  it('keeps the bulk selection count when the visible search page changes', async () => {
    const page = fixture.componentInstance;
    const member = { id: 'member-1', membership_number: 'P-001', first_name: 'Ada', last_name: 'Lovelace' };
    page.startBulkManualCheckIn();
    page.selectMember(member);

    await page.searchMembers('Grace');

    expect(page.queueItems()).toHaveLength(1);
    expect(page.isQueued('member-1')).toBe(true);
    expect(page.memberSelectionLabel(member)).toBe('Remove Ada Lovelace from manual check-in selection');
  });

  it('preserves the QR queue when the session reloads for the same workspace context', async () => {
    api.getSession.mockReturnValue(of({ id: 'session-1', branch: { id: 'branch-1' } }));
    api.getAttendanceSummary.mockReturnValue(of({}));
    const page = fixture.componentInstance;
    page.startBulkManualCheckIn();
    page.selectMember({ id: 'member-1', membership_number: 'P-001', first_name: 'Ada', last_name: 'Lovelace' });

    await page.load();

    expect(page.queueItems()).toEqual([expect.objectContaining({ memberId: 'member-1' })]);
  });

  it('locks existing attendance records and submits only new selections', async () => {
    const page = fixture.componentInstance;
    const present = { id: 'member-1', membership_number: 'P-001', first_name: 'Ada', last_name: 'Lovelace', already_attended: true };
    const selected = { id: 'member-2', membership_number: 'P-002', first_name: 'Grace', last_name: 'Hopper' };
    page.startBulkManualCheckIn();
    page.selectMember(present);
    page.selectMember(selected);

    expect(page.queueItems().map((item) => item.memberId)).toEqual(['member-2']);
    await page.confirmBulkCheckIn();
    expect(api.recordBulkManualCheckIn).toHaveBeenCalledWith('org-1', 'session-1', [expect.objectContaining({ member_id: 'member-2' })]);
  });

  it('queues an authorized QR preview without recording attendance before confirmation', async () => {
    let onOutcome: ((outcome: { kind: 'scanned'; qrIdentifier: string }) => void) | undefined;
    qrScanner.startContinuousScan.mockImplementationOnce(async (callback: typeof onOutcome) => {
      onOutcome = callback;
      return { stop: vi.fn().mockResolvedValue(undefined) };
    });
    api.previewQrCheckIn.mockReturnValueOnce(of({
      member_id: 'member-qr', display_name: 'Grace Hopper', membership_number: 'P-002',
      session_id: 'session-1', attendance_status: 'not_checked_in',
    }));
    const page = fixture.componentInstance;
    await page.startBulkQrScan();
    expect(page.bulkQrScanning()).toBe(true);
    await onOutcome?.({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    await settle();

    expect(page.queueItems()).toEqual([expect.objectContaining({ memberId: 'member-qr', source: 'qr' })]);
    expect(page.queueItems()[0].qrIdentifier).toBe('11111111-1111-4111-8111-111111111111');
    expect(api.recordBulkManualCheckIn).not.toHaveBeenCalled();
  });

  it('submits manually selected members through the manual bulk contract and clears confirmed items', async () => {
    api.recordBulkManualCheckIn.mockImplementationOnce((_organizationId: string, _sessionId: string, items: readonly { idempotency_key: string }[]) => of({
      results: items.map((item) => ({ idempotency_key: item.idempotency_key, member_id: 'member-qr', status: 'checked_in' })),
    }));
    const page = fixture.componentInstance;
    page.startBulkManualCheckIn();
    page.selectMember({ id: 'member-qr', membership_number: 'P-002', first_name: 'Grace', last_name: 'Hopper' });
    const queued = page.queueItems()[0];
    await page.confirmBulkCheckIn();

    expect(api.recordBulkManualCheckIn).toHaveBeenCalledWith('org-1', 'session-1', [{
      idempotency_key: queued.idempotencyKey,
      member_id: 'member-qr',
      method: 'manual',
    }]);
    expect(page.queueItems()).toHaveLength(0);
  });

  it('submits QR-selected members with QR provenance and clears confirmed items', async () => {
    api.recordBulkManualCheckIn.mockImplementationOnce((_organizationId: string, _sessionId: string, items: readonly { idempotency_key: string }[]) => of({
      results: items.map((item) => ({ idempotency_key: item.idempotency_key, member_id: 'member-qr', status: 'checked_in' })),
    }));
    let onOutcome: ((outcome: { kind: 'scanned'; qrIdentifier: string }) => void) | undefined;
    qrScanner.startContinuousScan.mockImplementationOnce(async (callback: typeof onOutcome) => {
      onOutcome = callback;
      return { stop: vi.fn().mockResolvedValue(undefined) };
    });
    api.previewQrCheckIn.mockReturnValueOnce(of({
      member_id: 'member-qr', display_name: 'Grace Hopper', membership_number: 'P-002',
      session_id: 'session-1', attendance_status: 'not_checked_in',
    }));
    const page = fixture.componentInstance;
    await page.startBulkQrScan();
    await onOutcome?.({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    await settle();
    const queued = page.queueItems()[0];
    await page.confirmBulkCheckIn();

    expect(api.recordBulkManualCheckIn).toHaveBeenCalledWith('org-1', 'session-1', [{
      idempotency_key: queued.idempotencyKey,
      qr_identifier: '11111111-1111-4111-8111-111111111111',
      method: 'qr',
    }]);
    expect(page.queueItems()).toHaveLength(0);
  });

  it('preserves the queue when bulk confirmation is rejected', async () => {
    api.recordBulkManualCheckIn.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
    const page = fixture.componentInstance;
    page.startBulkManualCheckIn();
    page.selectMember({ id: 'member-1', membership_number: 'P-001', first_name: 'Ada', last_name: 'Lovelace' });

    await page.confirmBulkCheckIn();

    expect(page.queueItems()).toHaveLength(1);
  });

  it('preserves all queued QR members when the native scanner is cancelled', async () => {
    let onOutcome: ((outcome: { kind: 'scanned'; qrIdentifier: string }) => void) | undefined;
    qrScanner.startContinuousScan.mockImplementationOnce(async (callback: typeof onOutcome) => {
      onOutcome = callback;
      return { stop: vi.fn().mockResolvedValue(undefined) };
    });
    api.previewQrCheckIn.mockImplementation((_organizationId: string, _sessionId: string, qrIdentifier: string) => of({
      member_id: `member-${qrIdentifier.slice(-1)}`,
      display_name: 'Queued Member',
      membership_number: `P-${qrIdentifier.slice(-1)}`,
      session_id: 'session-1',
      attendance_status: 'not_checked_in',
    }));
    const page = fixture.componentInstance;
    await page.startBulkQrScan();
    for (const suffix of ['1', '2', '3', '4']) {
      await onOutcome?.({ kind: 'scanned', qrIdentifier: `11111111-1111-4111-8111-11111111111${suffix}` });
      await settle();
    }

    await page.stopBulkQrScan();

    expect(page.queueItems()).toHaveLength(4);
    expect(api.recordBulkManualCheckIn).not.toHaveBeenCalled();
  });

  it('clears queued members only through explicit bulk discard', () => {
    const page = fixture.componentInstance;
    page.startBulkManualCheckIn();
    page.selectMember({ id: 'member-1', membership_number: 'P-001', first_name: 'Ada', last_name: 'Lovelace' });

    page.exitBulkManualCheckIn();

    expect(page.queueItems()).toHaveLength(0);
  });

  it('does not duplicate a member selected manually when their QR is scanned', async () => {
    let onOutcome: ((outcome: { kind: 'scanned'; qrIdentifier: string }) => void) | undefined;
    qrScanner.startContinuousScan.mockImplementationOnce(async (callback: typeof onOutcome) => {
      onOutcome = callback;
      return { stop: vi.fn().mockResolvedValue(undefined) };
    });
    api.previewQrCheckIn.mockReturnValueOnce(of({
      member_id: 'member-1', display_name: 'Ada Lovelace', membership_number: 'P-001',
      session_id: 'session-1', attendance_status: 'not_checked_in',
    }));
    const page = fixture.componentInstance;
    page.startBulkManualCheckIn();
    page.selectMember({ id: 'member-1', membership_number: 'P-001', first_name: 'Ada', last_name: 'Lovelace' });
    await page.startBulkQrScan();
    await onOutcome?.({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    await settle();

    expect(page.queueItems()).toHaveLength(1);
    expect(page.queueItems()[0].source).toBe('manual');
  });

  it('accepts a decode callback emitted before native scanner startup resolves', async () => {
    let resolveStart!: (session: { stop: () => Promise<void> }) => void;
    let onOutcome: ((outcome: { kind: 'scanned'; qrIdentifier: string }) => void) | undefined;
    qrScanner.startContinuousScan.mockImplementationOnce((callback: typeof onOutcome) => {
      onOutcome = callback;
      return new Promise(resolve => { resolveStart = resolve; });
    });
    api.previewQrCheckIn.mockReturnValueOnce(of({
      member_id: 'member-early', display_name: 'Early Decode', membership_number: 'P-003',
      session_id: 'session-1', attendance_status: 'not_checked_in',
    }));
    const page = fixture.componentInstance;
    const start = page.startBulkQrScan();
    onOutcome?.({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    resolveStart({ stop: vi.fn().mockResolvedValue(undefined) });
    await start;
    await settle();

    expect(page.queueItems()).toEqual([expect.objectContaining({ memberId: 'member-early', source: 'qr' })]);
  });

  it('removes a newly attended member from the queue when refreshed data is authoritative', () => {
    const page = fixture.componentInstance;
    const member = { id: 'member-1', membership_number: 'P-001', first_name: 'Ada', last_name: 'Lovelace' };
    page.startBulkManualCheckIn();
    page.selectMember(member);
    expect(page.queueItems()).toHaveLength(1);

    (page as unknown as { applyMemberPage: (rows: readonly AttendanceMemberLookup[], next: number | null, replace: boolean) => void })
      .applyMemberPage([{ ...member, already_attended: true }], null, true);

    expect(page.queueItems()).toHaveLength(0);
    expect(page.memberSelectionLabel({ ...member, already_attended: true })).toBe('Ada Lovelace, already attended');
  });

  it('recognizes a session whose recording deadline has passed', () => {
    const session = {
      status: 'scheduled',
      scheduled_start: '2026-10-16T21:00:00Z',
      scheduled_end: '2026-10-16T22:30:00Z',
      closure_after_hours_snapshot: 24,
    };
    expect(getRecordingUnavailableMessage(session as unknown as AttendanceSession, Date.parse('2026-10-23T12:00:00Z'))).toBe('The attendance recording deadline has passed.');
  });

  it('recognizes the not-open and closed recording windows', () => {
    const session = {
      status: 'scheduled',
      scheduled_start: '2026-10-23T21:00:00Z',
      scheduled_end: '2026-10-23T22:30:00Z',
      closure_after_hours_snapshot: 24,
    };
    expect(getRecordingUnavailableMessage(session as unknown as AttendanceSession, Date.parse('2026-10-23T20:00:00Z'))).toBe('Attendance recording has not opened for this session.');
    expect(getRecordingUnavailableMessage({ ...session, status: 'closed' } as unknown as AttendanceSession, Date.parse('2026-10-23T20:00:00Z'))).toBe('This session is cancelled or closed for normal attendance recording.');
  });

  it('waits for the scanner-return authorization refresh before requesting QR preview', async () => {
    qrScanner.scan.mockResolvedValueOnce({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    notifications.confirm.mockResolvedValueOnce(true);
    const page = fixture.componentInstance;

    await page.scanQr();

    expect(workspaceAuthorization.refresh).toHaveBeenCalledWith('app-resume');
    expect(api.previewQrCheckIn).toHaveBeenCalledWith('org-1', 'session-1', '11111111-1111-4111-8111-111111111111');
    expect(notifications.confirm).toHaveBeenCalledOnce();
    expect(api.recordQrCheckIn).toHaveBeenCalledOnce();
  });

  it('fails closed when authorization changes while the scanner is returning', async () => {
    qrScanner.scan.mockResolvedValueOnce({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    workspaceAuthorization.refresh.mockImplementationOnce(async () => {
      workspace.selectedBranchId.mockReturnValue('branch-2');
      return true;
    });

    await fixture.componentInstance.scanQr();

    expect(api.previewQrCheckIn).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith('Your attendance authorization changed. Reopen the session before scanning again.');
    expect(api.recordQrCheckIn).not.toHaveBeenCalled();
  });

  it('does not misclassify a failed authorization refresh as a permission change', async () => {
    qrScanner.scan.mockResolvedValueOnce({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    workspaceAuthorization.refresh.mockResolvedValueOnce(false);

    await fixture.componentInstance.scanQr();

    expect(api.previewQrCheckIn).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith('We could not refresh your attendance authorization. Check your connection and try again.');
    expect(notifications.error).not.toHaveBeenCalledWith('Your attendance authorization changed. Reopen the session before scanning again.');
  });

  it('keeps a pending multi-scan alive while authorization refresh is loading', async () => {
    let onOutcome: ((outcome: { kind: 'scanned'; qrIdentifier: string }) => void) | undefined;
    qrScanner.startContinuousScan.mockImplementationOnce(async (callback: typeof onOutcome) => {
      onOutcome = callback;
      return { stop: vi.fn().mockResolvedValue(undefined) };
    });
    workspaceAuthorization.refresh.mockImplementationOnce(async () => {
      attendance.canRecordAttendance.mockReturnValue(false);
      workspace.authorizationState.mockReturnValue('loading');
      await Promise.resolve();
      attendance.canRecordAttendance.mockReturnValue(true);
      workspace.authorizationState.mockReturnValue('allowed');
      return true;
    });
    api.previewQrCheckIn.mockReturnValueOnce(of({
      member_id: 'member-qr', display_name: 'Grace Hopper', membership_number: 'P-002',
      session_id: 'session-1', attendance_status: 'not_checked_in',
    }));
    const page = fixture.componentInstance;
    await page.startBulkQrScan();
    await onOutcome?.({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    await settle();

    expect(page.queueItems()).toEqual([expect.objectContaining({ memberId: 'member-qr', source: 'qr' })]);
    expect(notifications.error).not.toHaveBeenCalledWith('Your attendance authorization changed. Reopen the session before scanning again.');
  });

  it('accepts equivalent refreshed group scope when the API returns IDs in a different order', async () => {
    qrScanner.scan.mockResolvedValueOnce({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    notifications.confirm.mockResolvedValueOnce(false);
    workspaceAuthorization.refresh.mockImplementationOnce(async () => {
      workspace.attendanceCapabilities.mockReturnValueOnce({
        ...workspace.attendanceCapabilities(),
        ad_hoc_scopes: [{ branch_id: 'branch-1', group_scope: 'selected_groups', group_ids: ['group-1', 'group-2'] }],
      });
      return true;
    });

    await fixture.componentInstance.scanQr();

    expect(api.previewQrCheckIn).toHaveBeenCalledOnce();
    expect(notifications.error).not.toHaveBeenCalledWith('Your attendance authorization changed. Reopen the session before scanning again.');
  });

  it('blocks QR preview when the refreshed effective scope is genuinely different', async () => {
    qrScanner.scan.mockResolvedValueOnce({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    workspaceAuthorization.refresh.mockImplementationOnce(async () => {
      workspace.attendanceCapabilities.mockReturnValueOnce({
        ...workspace.attendanceCapabilities(),
        ad_hoc_scopes: [{ branch_id: 'branch-1', group_scope: 'selected_groups', group_ids: ['group-3'] }],
      });
      return true;
    });

    await fixture.componentInstance.scanQr();

    expect(api.previewQrCheckIn).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith('Your attendance authorization changed. Reopen the session before scanning again.');
  });

  it('distinguishes a locally malformed QR payload', async () => {
    qrScanner.scan.mockResolvedValueOnce({ kind: 'invalid_payload' });

    await fixture.componentInstance.scanQr();

    expect(notifications.warning).toHaveBeenCalledWith('This is not a valid Peniel membership QR code.');
    expect(api.previewQrCheckIn).not.toHaveBeenCalled();
  });

  it('uses a non-disclosing verification message for an unknown or out-of-scope QR', async () => {
    qrScanner.scan.mockResolvedValueOnce({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    api.previewQrCheckIn.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 })));

    await fixture.componentInstance.scanQr();

    expect(notifications.warning).toHaveBeenCalledWith('This QR code could not be verified for this attendance session.');
    expect(notifications.warning).not.toHaveBeenCalledWith(expect.stringContaining('Member'));
  });

  it('reports malformed preview requests separately from verification failures', async () => {
    qrScanner.scan.mockResolvedValueOnce({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    api.previewQrCheckIn.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 400 })));

    await fixture.componentInstance.scanQr();

    expect(notifications.warning).toHaveBeenCalledWith('This is not a valid Peniel membership QR code.');
  });

  it('reports preview connectivity failures distinctly', async () => {
    qrScanner.scan.mockResolvedValueOnce({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    api.previewQrCheckIn.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));

    await fixture.componentInstance.scanQr();

    expect(notifications.error).toHaveBeenCalledWith('We could not connect to attendance verification. Check your connection and try again.');
  });

  it('reports preview connectivity and server failures without exposing QR details', async () => {
    qrScanner.scan.mockResolvedValueOnce({ kind: 'scanned', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    api.previewQrCheckIn.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));

    await fixture.componentInstance.scanQr();

    expect(notifications.error).toHaveBeenCalledWith('Attendance verification is temporarily unavailable. Please try again.');
  });
});
