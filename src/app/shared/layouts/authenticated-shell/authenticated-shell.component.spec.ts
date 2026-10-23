import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthenticatedShellComponent } from './authenticated-shell.component';
import { AttendancePermissionService } from '../../../core/attendance/attendance-permission.service';

describe('AuthenticatedShellComponent', () => {
  let fixture: ComponentFixture<AuthenticatedShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthenticatedShellComponent],
      providers: [provideRouter([]), {
        provide: AttendancePermissionService,
        useValue: { canViewAttendance: () => true },
      }],
    }).compileComponents();
    fixture = TestBed.createComponent(AuthenticatedShellComponent);
  });

  it('renders the application brand', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Peniel');
  });

  it('shows primary navigation on authenticated feature routes', () => {
    fixture.componentInstance.showNavigation.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Primary navigation"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Home');
    expect(fixture.nativeElement.textContent).toContain('Attendance');
  });

  it('keeps attendance navigation capability-gated', () => {
    const attendance = TestBed.inject(AttendancePermissionService) as unknown as { canViewAttendance: () => boolean };
    vi.spyOn(attendance, 'canViewAttendance').mockReturnValue(false);
    fixture.componentInstance.showNavigation.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Attendance');
  });

  it('hides navigation while workspace is being resolved', () => {
    fixture.componentInstance.showNavigation.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Primary navigation"]')).toBeNull();
  });
});
