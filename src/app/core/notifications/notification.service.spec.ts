import { TestBed } from '@angular/core/testing';
import { AlertController, ToastController } from '@ionic/angular';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const toast = {
    present: vi.fn().mockResolvedValue(undefined),
    onDidDismiss: vi.fn().mockResolvedValue({ role: 'cancel' }),
  };
  const alert = {
    present: vi.fn().mockResolvedValue(undefined),
    onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
  };
  const toastController = { create: vi.fn().mockResolvedValue(toast) };
  const alertController = { create: vi.fn().mockResolvedValue(alert) };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        NotificationService,
        { provide: ToastController, useValue: toastController },
        { provide: AlertController, useValue: alertController },
      ],
    });
  });

  it('creates semantic toast variants and suppresses active duplicates', async () => {
    const service = TestBed.inject(NotificationService);

    await service.success('Saved', { title: 'Success' });
    await service.success('Saved', { title: 'Success' });

    expect(toastController.create).toHaveBeenCalledTimes(1);
    expect(toastController.create).toHaveBeenCalledWith(expect.objectContaining({ color: 'success', icon: 'checkmark-circle-outline' }));
  });

  it('returns true only when the confirmation action is explicitly selected', async () => {
    const service = TestBed.inject(NotificationService);

    await expect(service.confirm({ title: 'Remove?', message: 'This cannot be undone.', destructive: true })).resolves.toBe(true);
    expect(alertController.create).toHaveBeenCalledWith(expect.objectContaining({
      cssClass: ['peniel-alert', 'peniel-alert--destructive'],
    }));
  });

  it('returns false when a confirmation is dismissed', async () => {
    alert.onDidDismiss.mockResolvedValueOnce({ role: 'backdrop' });
    const service = TestBed.inject(NotificationService);

    await expect(service.confirm({ title: 'Continue?', message: 'Please confirm.' })).resolves.toBe(false);
  });

  it('acknowledges an alert after it is dismissed', async () => {
    const service = TestBed.inject(NotificationService);

    await expect(service.alert({ title: 'Notice', message: 'Something happened.' })).resolves.toBeUndefined();
    expect(alert.present).toHaveBeenCalled();
  });
});
