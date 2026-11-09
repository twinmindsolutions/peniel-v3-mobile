import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SessionListPage } from './session-list.page';
import { AttendanceSessionApiService } from '../../../core/attendance/attendance-session-api.service';
import { AttendancePermissionService } from '../../../core/attendance/attendance-permission.service';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { of } from 'rxjs';

describe('SessionListPage', () => {
  let fixture: ComponentFixture<SessionListPage>;
  const workspace = { selectedOrganizationId: vi.fn(() => 'org-1'), selectedBranchId: vi.fn(() => 'branch-1') };
  const attendance = { resolved: vi.fn(() => true), canViewAttendance: vi.fn(() => true) };
  const api = { getSessions: vi.fn(() => of({ count: 0, results: [] })) };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionListPage],
      providers: [
        { provide: WorkspaceStateService, useValue: workspace },
        { provide: AttendancePermissionService, useValue: attendance },
        { provide: AttendanceSessionApiService, useValue: api },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SessionListPage);
    fixture.detectChanges();
  });

  it('renders the empty authorized-session state', () => {
    expect(fixture.nativeElement.textContent).toContain('No attendance sessions');
  });

  it('does not show sessions when the workspace capability is denied', () => {
    attendance.canViewAttendance.mockReturnValue(false);
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Attendance is unavailable');
  });

  it('renders authorized sessions returned by the canonical list response', () => {
    api.getSessions.mockReturnValue(of({
      count: 1,
      results: [{
        id: 'session-1',
        organization: 'org-1',
        branch: { id: 'branch-1', name: 'Miracle Temple' },
        service_type: { id: 'service-1', code: 'sunday', name: 'Sunday Service' },
        group: null,
        source: 'ad_hoc',
        recurring_schedule: null,
        local_occurrence_date: '2026-11-08',
        scheduled_start: '2026-11-08T10:00:00Z',
        scheduled_end: '2026-11-08T12:00:00Z',
        timezone: 'Europe/London',
        service_type_name_snapshot: 'Sunday Service',
        service_type_resets_absence_timer_snapshot: false,
        closure_after_hours_snapshot: 24,
        schedule_revision_snapshot: null,
        is_customized: false,
        status: 'scheduled',
        revision: 1,
        created_at: '2026-11-08T09:00:00Z',
        updated_at: '2026-11-08T09:00:00Z',
      }],
    }));
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sunday Service');
    expect(fixture.nativeElement.textContent).toContain('Miracle Temple');
    expect(fixture.nativeElement.textContent).toContain('All members');
  });
});
