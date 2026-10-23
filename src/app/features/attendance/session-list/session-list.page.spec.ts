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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionListPage],
      providers: [
        { provide: WorkspaceStateService, useValue: workspace },
        { provide: AttendancePermissionService, useValue: attendance },
        { provide: AttendanceSessionApiService, useValue: { getSessions: vi.fn(() => of({ count: 0, results: [] })) } },
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
});
