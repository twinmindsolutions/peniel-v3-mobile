import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { SessionDetailPage } from './session-detail.page';
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
});
