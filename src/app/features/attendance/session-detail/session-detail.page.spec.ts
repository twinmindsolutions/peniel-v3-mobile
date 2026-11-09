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
  let fixture: ComponentFixture<SessionDetailPage>;
  const workspace = { selectedOrganizationId: vi.fn(() => 'org-1'), selectedBranchId: vi.fn(() => 'branch-1') };
  const attendance = { resolved: vi.fn(() => true), canViewAttendance: vi.fn(() => true), canRecordAttendance: vi.fn(() => true) };
  const api = {
    getSession: vi.fn(() => of(null)),
    getAttendanceSummary: vi.fn(() => of(null)),
    searchMembers: vi.fn(() => of({ results: [] })),
    recordBulkManualCheckIn: vi.fn(() => of({ results: [] })),
    previewQrCheckIn: vi.fn(() => of({ display_name: 'Member', membership_number: 'P-001', attendance_status: 'not_checked_in' })),
    recordQrCheckIn: vi.fn(() => of({ outcome: 'recorded' })),
  };
  const qrScanner = { scan: vi.fn(), stop: vi.fn() };
  const notifications = { confirm: vi.fn(() => Promise.resolve(false)), warning: vi.fn(), error: vi.fn(), success: vi.fn() };
  const workspaceAuthorization = { refresh: vi.fn(() => Promise.resolve(true)) };
  const auth = { user: vi.fn(() => ({ id: 'user-1' })) };

  beforeEach(async () => {
    vi.clearAllMocks();
    workspace.selectedOrganizationId.mockReturnValue('org-1');
    workspace.selectedBranchId.mockReturnValue('branch-1');
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
    page.reviewBulkSelection();
    await page.confirmBulkCheckIn();
    expect(api.recordBulkManualCheckIn).toHaveBeenCalledOnce();
  });

  it('keeps the bulk selection count when the visible search page changes', async () => {
    const page = fixture.componentInstance;
    const member = { id: 'member-1', membership_number: 'P-001', first_name: 'Ada', last_name: 'Lovelace' };
    page.startBulkManualCheckIn();
    page.selectMember(member);

    await page.searchMembers('Grace');

    expect(page.queueItems()).toHaveLength(1);
    expect(page.isQueued('member-1')).toBe(true);
    expect(page.memberSelectionLabel(member)).toBe('Remove Ada Lovelace from bulk check-in selection');
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
