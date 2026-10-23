import { Injectable, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  informationCircleOutline,
  warningOutline,
} from 'ionicons/icons';
import {
  AlertNotificationOptions,
  ConfirmNotificationOptions,
  NotificationVariant,
  ToastNotificationOptions,
} from './notification.models';

const DEFAULT_DURATIONS: Record<NotificationVariant, number> = {
  success: 2600,
  info: 3200,
  warning: 4200,
  error: 5600,
};

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly activeToastKeys = new Set<string>();

  constructor() {
    addIcons({ alertCircleOutline, checkmarkCircleOutline, informationCircleOutline, warningOutline });
  }

  success(message: string, options: ToastNotificationOptions = {}): Promise<void> {
    return this.showToast('success', message, options);
  }

  error(message: string, options: ToastNotificationOptions = {}): Promise<void> {
    return this.showToast('error', message, options);
  }

  warning(message: string, options: ToastNotificationOptions = {}): Promise<void> {
    return this.showToast('warning', message, options);
  }

  info(message: string, options: ToastNotificationOptions = {}): Promise<void> {
    return this.showToast('info', message, options);
  }

  async alert(options: AlertNotificationOptions): Promise<void> {
    const alert = await this.alertController.create({
      header: options.title,
      message: options.message,
      buttons: [{ text: options.acknowledgeLabel ?? 'OK', role: 'confirm' }],
      cssClass: 'peniel-alert',
    });
    await alert.present();
    await alert.onDidDismiss();
  }

  async confirm(options: ConfirmNotificationOptions): Promise<boolean> {
    const alert = await this.alertController.create({
      header: options.title,
      message: options.message,
      cssClass: ['peniel-alert', ...(options.destructive ? ['peniel-alert--destructive'] : [])],
      buttons: [
        { text: options.cancelLabel ?? 'Cancel', role: 'cancel' },
        {
          text: options.confirmLabel ?? 'Confirm',
          role: 'confirm',
          cssClass: options.destructive ? 'peniel-alert__confirm--destructive' : undefined,
        },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    return result.role === 'confirm';
  }

  private async showToast(
    variant: NotificationVariant,
    message: string,
    options: ToastNotificationOptions,
  ): Promise<void> {
    const key = options.id ?? `${variant}:${options.title ?? ''}:${message}`;
    if (this.activeToastKeys.has(key)) {
      return;
    }

    this.activeToastKeys.add(key);
    try {
      const toast = await this.toastController.create({
        message: options.title ? `${options.title}\n${message}` : message,
        duration: options.duration ?? DEFAULT_DURATIONS[variant],
        position: options.position ?? 'bottom',
        color: this.toastColor(variant),
        icon: this.toastIcon(variant),
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        cssClass: ['peniel-toast', `peniel-toast--${variant}`],
        layout: 'baseline',
      });
      void toast.onDidDismiss().then(() => this.activeToastKeys.delete(key));
      await toast.present();
    } catch (error: unknown) {
      this.activeToastKeys.delete(key);
      throw error;
    }
  }

  private toastColor(variant: NotificationVariant): string {
    return variant === 'error' ? 'danger' : variant === 'warning' ? 'warning' : variant === 'success' ? 'success' : 'primary';
  }

  private toastIcon(variant: NotificationVariant): string {
    return variant === 'error'
      ? 'alert-circle-outline'
      : variant === 'warning'
        ? 'warning-outline'
        : variant === 'success'
          ? 'checkmark-circle-outline'
          : 'information-circle-outline';
  }
}
