import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomePage } from './home.page';
import { AttendancePermissionService } from '../core/attendance/attendance-permission.service';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [{
        provide: AttendancePermissionService,
        useValue: { resolved: () => false, canViewAttendance: () => false },
      }],
    });
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not display obsolete authentication or workspace setup messaging', () => {
    expect(fixture.nativeElement.textContent).not.toContain('Sign-in and organization selection will be connected');
  });
});
