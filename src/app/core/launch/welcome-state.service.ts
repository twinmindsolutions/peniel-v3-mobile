import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const WELCOME_COMPLETED_KEY = 'peniel.welcome.completed';

@Injectable({ providedIn: 'root' })
export class WelcomeStateService {
  private completedForCurrentSession = false;

  async hasCompleted(): Promise<boolean> {
    if (this.completedForCurrentSession) {
      return true;
    }
    try {
      const result = await Preferences.get({ key: WELCOME_COMPLETED_KEY });
      return result.value === 'true';
    } catch {
      // A preference failure must never prevent the user from reaching login.
      return false;
    }
  }

  async complete(): Promise<void> {
    // Allow this session to continue even if persistence is unavailable. A future
    // launch will still show welcome because the durable flag was not written.
    this.completedForCurrentSession = true;
    try {
      await Preferences.set({ key: WELCOME_COMPLETED_KEY, value: 'true' });
    } catch {
      // The flag is non-sensitive and can be retried on the next launch.
    }
  }
}
