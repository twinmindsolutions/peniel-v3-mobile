import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthenticatedShellComponent } from './authenticated-shell.component';

describe('AuthenticatedShellComponent', () => {
  let fixture: ComponentFixture<AuthenticatedShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthenticatedShellComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(AuthenticatedShellComponent);
  });

  it('renders the application brand', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Peniel');
  });
});
