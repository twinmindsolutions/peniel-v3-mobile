import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule, Validators, FormBuilder } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonInput } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AppButtonComponent } from '../../../shared/ui/app-button/app-button.component';
import { AppFeedbackStateComponent } from '../../../shared/ui/app-feedback-state/app-feedback-state.component';
import { AppFormFieldComponent } from '../../../shared/ui/app-form-field/app-form-field.component';
import { AppPageShellComponent } from '../../../shared/ui/app-page-shell/app-page-shell.component';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
  imports: [
    ReactiveFormsModule,
    IonContent,
    IonIcon,
    IonInput,
    AppButtonComponent,
    AppFeedbackStateComponent,
    AppFormFieldComponent,
    AppPageShellComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  showPassword = false;
  submitting = false;
  errorMessage = '';

  constructor() {
    addIcons({ eyeOutline, eyeOffOutline, shieldCheckmarkOutline });
  }

  async submit(): Promise<void> {
    if (this.submitting) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting = true;
    this.errorMessage = '';
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email.trim(), password);
      await this.router.navigateByUrl('/app/home');
    } catch (error: unknown) {
      const message = this.messageFor(error);
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.errorMessage = message;
      } else {
        void this.notifications.error(message, { title: 'Sign-in unavailable' }).catch(() => undefined);
      }
    } finally {
      this.submitting = false;
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  private messageFor(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      return 'Unable to sign in with those credentials.';
    }
    if (error instanceof HttpErrorResponse && error.status >= 500) {
      return 'Peniel is temporarily unavailable. Please try again.';
    }
    return 'We could not sign you in. Check your connection and try again.';
  }

  get emailError(): string {
    return this.form.controls.email.touched && this.form.controls.email.invalid
      ? 'Enter a valid email address.'
      : '';
  }

  get passwordError(): string {
    return this.form.controls.password.touched && this.form.controls.password.invalid
      ? 'Enter your password.'
      : '';
  }
}
