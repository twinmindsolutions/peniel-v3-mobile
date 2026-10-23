import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([]), { provide: AuthService, useValue: { login: vi.fn() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(LoginPage);
  });

  it('renders the reactive sign-in form', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sign in to Peniel');
    expect(fixture.nativeElement.querySelector('input')).toBeTruthy();
  });
});
