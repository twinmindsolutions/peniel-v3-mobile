import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { SessionDetailPage } from './session-detail.page';
import { getRecordingUnavailableMessage } from './session-detail.page';
import { AttendanceSession } from '../../../core/attendance/attendance.models';
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
    previewQrCheckIn: vi.fn(() => of({ display_name: 'Member', membership_number: 'P-001', attendance_status: 'not_checked_in' })),
    recordQrCheckIn: vi.fn(() => of({ outcome: 'recorded' })),
  };
  const qrScanner = { scan: vi.fn(), stop: vi.fn() };
  const notifications = { confirm: vi.fn(() => Promise.resolve(false)), warning: vi.fn(), error: vi.fn(), success: vi.fn() };
  const workspaceAuthorization = { refresh: vi.fn(() => Promise.resolve(true)) };

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
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'session-1' } } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SessionDetailPage);
  });

  it('creates a detail view for an authorized workspace', () => {
    expect(fixture.componentInstance.sessionId).toBe('session-1');
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
    qrScanner.scan.mockResolvedValueOnce({ kind: 'success', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    notifications.confirm.mockResolvedValueOnce(true);
    const page = fixture.componentInstance;

    await page.scanQr();

    expect(workspaceAuthorization.refresh).toHaveBeenCalledWith('app-resume');
    expect(api.previewQrCheckIn).toHaveBeenCalledWith('org-1', 'session-1', '11111111-1111-4111-8111-111111111111');
    expect(notifications.confirm).toHaveBeenCalledOnce();
    expect(api.recordQrCheckIn).toHaveBeenCalledOnce();
  });

  it('fails closed when authorization changes while the scanner is returning', async () => {
    qrScanner.scan.mockResolvedValueOnce({ kind: 'success', qrIdentifier: '11111111-1111-4111-8111-111111111111' });
    workspaceAuthorization.refresh.mockImplementationOnce(async () => {
      workspace.selectedBranchId.mockReturnValue('branch-2');
      return true;
    });

    await fixture.componentInstance.scanQr();

    expect(api.previewQrCheckIn).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith('Your attendance authorization changed. Reopen the session before scanning again.');
    expect(api.recordQrCheckIn).not.toHaveBeenCalled();
  });
});
