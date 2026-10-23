import { Capacitor } from '@capacitor/core';
import { Injectable, InjectionToken, inject } from '@angular/core';
import {
  KeychainAccess,
  SecureStorage,
  StorageError,
} from '@aparajita/capacitor-secure-storage';
import { StoredRefreshCredential } from './auth.models';

const REFRESH_CREDENTIAL_KEY = 'refresh-credential';
const STORAGE_PREFIX = 'peniel-auth-';

export interface CredentialStorageAdapter {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}

export class CredentialStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CredentialStorageError';
  }
}

export class MemoryCredentialStorageAdapter implements CredentialStorageAdapter {
  private value: string | null = null;

  read(): Promise<string | null> {
    return Promise.resolve(this.value);
  }

  write(value: string): Promise<void> {
    this.value = value;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.value = null;
    return Promise.resolve();
  }
}

export class NativeCredentialStorageAdapter implements CredentialStorageAdapter {
  private configuration: Promise<void> | undefined;

  private configure(): Promise<void> {
    this.configuration ??= (async () => {
      await SecureStorage.setKeyPrefix(STORAGE_PREFIX);
      await SecureStorage.setSynchronize(false);
      await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
    })().catch((error: unknown) => {
      this.configuration = undefined;
      throw new CredentialStorageError('Native credential storage is unavailable.', { cause: error });
    });
    return this.configuration;
  }

  async read(): Promise<string | null> {
    await this.configure();
    try {
      const value = await SecureStorage.get(REFRESH_CREDENTIAL_KEY, false, false);
      return typeof value === 'string' ? value : null;
    } catch (error: unknown) {
      throw new CredentialStorageError('Native credential storage could not be read.', { cause: error });
    }
  }

  async write(value: string): Promise<void> {
    await this.configure();
    try {
      await SecureStorage.set(REFRESH_CREDENTIAL_KEY, value, false, false);
    } catch (error: unknown) {
      throw new CredentialStorageError('Native credential storage could not be written.', { cause: error });
    }
  }

  async clear(): Promise<void> {
    await this.configure();
    try {
      await SecureStorage.remove(REFRESH_CREDENTIAL_KEY, false);
    } catch (error: unknown) {
      throw new CredentialStorageError('Native credential storage could not be cleared.', { cause: error });
    }
  }
}

export const CREDENTIAL_STORAGE_ADAPTER = new InjectionToken<CredentialStorageAdapter>(
  'PENIEL_CREDENTIAL_STORAGE_ADAPTER',
  {
    providedIn: 'root',
    factory: () => createCredentialStorageAdapter(),
  },
);

export function createCredentialStorageAdapter(
  native = Capacitor.isNativePlatform(),
): CredentialStorageAdapter {
  return native ? new NativeCredentialStorageAdapter() : new MemoryCredentialStorageAdapter();
}

@Injectable({ providedIn: 'root' })
export class SecureCredentialStore {
  private readonly adapter = inject(CREDENTIAL_STORAGE_ADAPTER);

  async read(): Promise<StoredRefreshCredential | null> {
    let raw: string | null = null;
    try {
      raw = await this.adapter.read();
    } catch (error: unknown) {
      await this.clearAfterFailure(error);
    }
    if (raw === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!this.isStoredCredential(parsed)) {
        throw new Error('Invalid credential shape.');
      }
      return parsed;
    } catch (error: unknown) {
      await this.clearAfterFailure(error);
      throw new CredentialStorageError('Stored refresh credential is invalid.', { cause: error });
    }
  }

  async write(credential: StoredRefreshCredential): Promise<void> {
    await this.replace(credential);
  }

  async replace(credential: StoredRefreshCredential): Promise<void> {
    if (!this.isStoredCredential(credential)) {
      throw new CredentialStorageError('Refresh credential is invalid.');
    }
    const serialized = JSON.stringify(credential);
    try {
      await this.adapter.write(serialized);
      const stored = await this.adapter.read();
      if (stored !== serialized) {
        throw new Error('Credential replacement could not be verified.');
      }
    } catch (error: unknown) {
      await this.clearAfterFailure(error);
      throw new CredentialStorageError('Refresh credential replacement failed closed.', { cause: error });
    }
  }

  async clear(): Promise<void> {
    await this.adapter.clear();
  }

  private async clearAfterFailure(cause: unknown): Promise<never> {
    try {
      await this.adapter.clear();
    } catch (clearError: unknown) {
      throw new CredentialStorageError('Credential storage could not fail closed.', {
        cause: { cause, clearError },
      });
    }
    throw new CredentialStorageError('Credential storage failed closed.', { cause });
  }

  private isStoredCredential(value: unknown): value is StoredRefreshCredential {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate['refreshToken'] === 'string' &&
      candidate['refreshToken'].length > 0 &&
      typeof candidate['refreshExpiresAt'] === 'string' &&
      candidate['refreshExpiresAt'].length > 0
    );
  }
}

export function isNativeCredentialStorageError(error: unknown): boolean {
  return error instanceof CredentialStorageError || error instanceof StorageError;
}
