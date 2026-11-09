import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonButton, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonTitle, IonToolbar } from '@ionic/angular';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-security-page',
  templateUrl: './security.page.html',
  styleUrl: './security.page.scss',
  imports: [IonButton, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonTitle, IonToolbar, ReactiveFormsModule],
})
export class SecurityPage {
  private readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  readonly form = this.formBuilder.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    passwordConfirmation: ['', Validators.required],
  });
  submitting = false;
  message = '';
  error = '';

  async submit(): Promise<void> {
    this.message = '';
    this.error = '';
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const values = this.form.getRawValue();
    if (values.newPassword !== values.passwordConfirmation) { this.error = 'Passwords do not match.'; return; }
    if (values.newPassword === values.currentPassword) { this.error = 'Choose a different password.'; return; }
    this.submitting = true;
    try {
      await this.auth.changePassword(values.currentPassword, values.newPassword, values.passwordConfirmation);
      this.form.reset();
      this.message = 'Password changed. Other sessions have been signed out.';
    } catch { this.error = 'We could not change your password. Check your current password and try again.'; }
    finally { this.submitting = false; }
  }
}
