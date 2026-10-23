export type NotificationVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastNotificationOptions {
  title?: string;
  duration?: number;
  position?: 'top' | 'middle' | 'bottom';
  id?: string;
}

export interface AlertNotificationOptions {
  title: string;
  message: string;
  acknowledgeLabel?: string;
}

export interface ConfirmNotificationOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}
