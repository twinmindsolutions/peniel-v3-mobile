import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { WelcomeStateService } from './welcome-state.service';

describe('WelcomeStateService', () => {
  let service: WelcomeStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [WelcomeStateService] });
    service = TestBed.inject(WelcomeStateService);
    vi.spyOn(Preferences, 'get').mockResolvedValue({ value: null });
    vi.spyOn(Preferences, 'set').mockResolvedValue();
  });

  it('reads and writes only the non-sensitive completion flag', async () => {
    await service.complete();
    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'peniel.welcome.completed',
      value: 'true',
    });
    await expect(service.hasCompleted()).resolves.toBe(false);
  });

  it('fails open to login when preferences are unavailable', async () => {
    vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.hasCompleted()).resolves.toBe(false);
    vi.mocked(Preferences.set).mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.complete()).resolves.toBeUndefined();
    await expect(service.hasCompleted()).resolves.toBe(true);
  });
});
