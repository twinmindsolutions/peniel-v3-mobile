import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let auth: { login: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    auth = { login: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: NotificationService, useValue: { error: vi.fn().mockResolvedValue(undefined) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LoginPage);
  });

  it('renders the reactive sign-in form', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sign in to your workspace');
    expect(fixture.nativeElement.textContent).toContain('Church Management');
    expect(fixture.nativeElement.textContent).toContain('Username or email');
    expect(fixture.nativeElement.querySelector('.login-brand')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.login-footer')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Enter your Peniel staff credentials');
    expect(fixture.nativeElement.querySelector('input')).toBeTruthy();
  });

  it('accepts a generated username without email-domain validation', async () => {
    auth.login.mockResolvedValue(undefined);
    fixture.componentInstance.form.setValue({
      loginIdentifier: 'john.mensah@miracle-temple',
      password: 'secret',
    });

    await fixture.componentInstance.submit();

    expect(auth.login).toHaveBeenCalledWith('john.mensah@miracle-temple', 'secret');
  });

  it('does not submit an empty login identifier', async () => {
    await fixture.componentInstance.submit();

    expect(auth.login).not.toHaveBeenCalled();
    expect(fixture.componentInstance.form.controls.loginIdentifier.touched).toBe(true);
  });
});
