import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { SessionDetailPage } from './session-detail.page';
import { getRecordingUnavailableMessage } from './session-detail.page';
import { AttendanceSession } from '../../../core/attendance/attendance.models';
import { AttendanceSessionApiService } from '../../../core/attendance/attendance-session-api.service';
import { AttendancePermissionService } from '../../../core/attendance/attendance-permission.service';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { NotificationService } from '../../../core/notifications/notification.service';

describe('SessionDetailPage', () => {
  let fixture: ComponentFixture<SessionDetailPage>;
  const workspace = { selectedOrganizationId: vi.fn(() => 'org-1'), selectedBranchId: vi.fn(() => 'branch-1') };
  const attendance = { resolved: vi.fn(() => true), canViewAttendance: vi.fn(() => true), canRecordAttendance: vi.fn(() => true) };
  const api = { getSession: vi.fn(() => of(null)), getAttendanceSummary: vi.fn(() => of(null)) };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionDetailPage],
      providers: [
        { provide: WorkspaceStateService, useValue: workspace },
        { provide: AttendancePermissionService, useValue: attendance },
        { provide: AttendanceSessionApiService, useValue: api },
        { provide: NotificationService, useValue: { confirm: vi.fn(() => Promise.resolve(false)) } },
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
});
