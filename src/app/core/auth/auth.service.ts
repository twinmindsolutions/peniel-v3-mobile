import { computed, Injectable, signal, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { WorkspaceStateService } from '../workspace/workspace-state.service';
import { AuthApiService } from './auth-api.service';
import {
  MobileTokenResponse,
  MobileUser,
  StoredRefreshCredential,
} from './auth.models';
import {
  CredentialStorageError,
  SecureCredentialStore,
} from './secure-credential-store.service';

export type AuthenticationStatus = 'initializing' | 'unauthenticated' | 'authenticated';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthApiService);
  private readonly credentialStore = inject(SecureCredentialStore);
  private readonly workspace = inject(WorkspaceStateService);
  private readonly statusSignal = signal<AuthenticationStatus>('initializing');
  private readonly userSignal = signal<MobileUser | null>(null);
  private accessToken: string | null = null;
  private sessionVersion = 0;
  private initializationPromise: Promise<void> | undefined;
  private refreshInFlight: Promise<string | null> | undefined;

  readonly status = this.statusSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticatedSignal = computed(() => this.status() === 'authenticated');

  initialize(): Promise<void> {
    this.initializationPromise ??= this.restoreSession();
    return this.initializationPromise;
  }

  isAuthenticated(): boolean {
    return this.statusSignal() === 'authenticated' && this.accessToken !== null;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async login(email: string, password: string): Promise<void> {
    await this.clearLocalSession();
    this.statusSignal.set('initializing');
    try {
      const response = await firstValueFrom(this.api.login(email, password));
      await this.persistRefreshCredential(response);
      this.setAuthenticated(response);
      await this.resolveWorkspace(response.user.id);
    } catch (error: unknown) {
      this.accessToken = null;
      this.userSignal.set(null);
      this.statusSignal.set('unauthenticated');
      if (error instanceof CredentialStorageError) {
        await this.clearLocalSession();
      }
      throw error;
    }
  }

  async refreshAccessToken(): Promise<string | null> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    const version = this.sessionVersion;
    this.refreshInFlight = this.performRefresh(version).finally(() => {
      this.refreshInFlight = undefined;
    });
    return this.refreshInFlight;
  }

  async logout(): Promise<void> {
    const version = ++this.sessionVersion;
    let credential: StoredRefreshCredential | null = null;
    try {
      credential = await this.credentialStore.read();
      if (credential && version === this.sessionVersion) {
        await firstValueFrom(this.api.logout(credential.refreshToken));
      }
    } catch {
      // Local credentials are cleared even when the server is unreachable.
    } finally {
      await this.clearLocalSession(false);
    }
  }

  private async restoreSession(): Promise<void> {
    try {
      const credential = await this.credentialStore.read();
      if (!credential) {
        this.statusSignal.set('unauthenticated');
        return;
      }
      await this.performRefresh(this.sessionVersion, credential);
      if (!this.isAuthenticated()) {
        this.statusSignal.set('unauthenticated');
      } else {
        await this.resolveWorkspace(this.userSignal()?.id ?? '');
      }
    } catch {
      this.accessToken = null;
      this.userSignal.set(null);
      this.statusSignal.set('unauthenticated');
    }
  }

  private async performRefresh(
    version: number,
    existingCredential?: StoredRefreshCredential,
  ): Promise<string | null> {
    const credential = existingCredential ?? await this.credentialStore.read();
    if (!credential || version !== this.sessionVersion) {
      return null;
    }
    try {
      const response = await firstValueFrom(this.api.refresh(credential.refreshToken));
      if (version !== this.sessionVersion) {
        return null;
      }
      await this.persistRefreshCredential(response);
      if (version !== this.sessionVersion) {
        return null;
      }
      this.setAuthenticated(response);
      return response.access_token;
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        await this.clearLocalSession();
      }
      if (error instanceof CredentialStorageError) {
        await this.clearLocalSession();
      }
      throw error;
    }
  }

  private async persistRefreshCredential(response: MobileTokenResponse): Promise<void> {
    await this.credentialStore.replace({
      refreshToken: response.refresh_token,
      refreshExpiresAt: response.refresh_expires_at,
    });
  }

  private setAuthenticated(response: MobileTokenResponse): void {
    this.accessToken = response.access_token;
    this.userSignal.set(response.user);
    this.statusSignal.set('authenticated');
  }

  private async resolveWorkspace(userId: string): Promise<void> {
    if (!userId) return;
    try {
      await this.workspace.resolveForUser(userId);
    } catch {
      // Authentication remains valid; the protected workspace flow exposes retryable discovery errors.
    }
  }

  private async clearLocalSession(incrementVersion = true): Promise<void> {
    if (incrementVersion) {
      this.sessionVersion += 1;
    }
    this.accessToken = null;
    this.userSignal.set(null);
    this.statusSignal.set('unauthenticated');
    this.workspace.clear();
    try {
      await this.credentialStore.clear();
    } catch {
      // The store remains fail-closed; no in-memory credential is retained.
    }
  }
}
