import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomePage, greetingForHour } from './home.page';
import { AttendancePermissionService } from '../core/attendance/attendance-permission.service';
import { WorkspaceStateService } from '../core/workspace/workspace-state.service';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [{
        provide: AttendancePermissionService,
        useValue: { resolved: () => false, canViewAttendance: () => false },
      }, {
        provide: WorkspaceStateService,
        useValue: {
          error: () => null,
          authorizationVerified: () => false,
          selectedOrganization: () => null,
          selectedBranch: () => null,
        },
      }],
    });
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it.each([
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [16, 'Good afternoon'],
    [17, 'Good evening'],
    [4, 'Good evening'],
  ])('uses the local-time greeting for hour %s', (hour, expected) => {
    expect(greetingForHour(hour)).toBe(expected);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not display obsolete authentication or workspace setup messaging', () => {
    expect(fixture.nativeElement.textContent).not.toContain('Sign-in and organization selection will be connected');
    expect(fixture.nativeElement.textContent).not.toContain('Your workspace is coming soon');
    expect(fixture.nativeElement.textContent).not.toContain('Your workspace is ready');
  });

  it('shows attendance navigation only when viewing attendance is allowed', () => {
    const attendance = TestBed.inject(AttendancePermissionService) as unknown as { resolved: () => boolean; canViewAttendance: () => boolean };
    vi.spyOn(attendance, 'resolved').mockReturnValue(true);
    vi.spyOn(attendance, 'canViewAttendance').mockReturnValue(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Attendance');
    expect(fixture.nativeElement.querySelector('a[href="/app/attendance"]')).toBeTruthy();
  });

  it('renders the validated organization and branch summary', () => {
    const workspace = TestBed.inject(WorkspaceStateService) as unknown as {
      authorizationVerified: () => boolean;
      selectedOrganization: () => { name: string } | null;
      selectedBranch: () => { name: string } | null;
    };
    vi.spyOn(workspace, 'authorizationVerified').mockReturnValue(true);
    vi.spyOn(workspace, 'selectedOrganization').mockReturnValue({ name: 'Church One' });
    vi.spyOn(workspace, 'selectedBranch').mockReturnValue({ name: 'Main Branch' });
    const attendance = TestBed.inject(AttendancePermissionService) as unknown as {
      resolved: () => boolean;
      canViewAttendance: () => boolean;
    };
    vi.spyOn(attendance, 'resolved').mockReturnValue(true);
    vi.spyOn(attendance, 'canViewAttendance').mockReturnValue(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Church One');
    expect(fixture.nativeElement.textContent).toContain('Main Branch');
    expect(fixture.nativeElement.querySelector('a[aria-label="Change workspace"]')).toBeTruthy();
  });

  it('uses the native home content hierarchy', () => {
    const workspace = TestBed.inject(WorkspaceStateService) as unknown as {
      authorizationVerified: () => boolean;
      selectedOrganization: () => { name: string } | null;
      selectedBranch: () => { name: string } | null;
    };
    vi.spyOn(workspace, 'authorizationVerified').mockReturnValue(true);
    vi.spyOn(workspace, 'selectedOrganization').mockReturnValue({ name: 'Church One' });
    vi.spyOn(workspace, 'selectedBranch').mockReturnValue({ name: 'Main Branch' });
    const attendance = TestBed.inject(AttendancePermissionService) as unknown as {
      resolved: () => boolean;
      canViewAttendance: () => boolean;
    };
    vi.spyOn(attendance, 'resolved').mockReturnValue(true);
    vi.spyOn(attendance, 'canViewAttendance').mockReturnValue(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.welcome-panel')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.brand-lockup img')?.getAttribute('src')).toBe('assets/peniel-church.svg');
    expect(fixture.nativeElement.textContent).toContain('Church Management');
    expect(fixture.nativeElement.textContent).toContain('Good morning');
    expect(fixture.nativeElement.textContent).toContain('Church tools');
    expect(fixture.nativeElement.textContent).toContain('Sessions and member check-in');
    expect(fixture.nativeElement.textContent).not.toContain('Peniel mobile');
  });
});
