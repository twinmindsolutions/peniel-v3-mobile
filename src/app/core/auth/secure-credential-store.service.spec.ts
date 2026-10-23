import { TestBed } from '@angular/core/testing';
import {
  CREDENTIAL_STORAGE_ADAPTER,
  CredentialStorageAdapter,
  CredentialStorageError,
  MemoryCredentialStorageAdapter,
  NativeCredentialStorageAdapter,
  SecureCredentialStore,
  createCredentialStorageAdapter,
} from './secure-credential-store.service';
import { StoredRefreshCredential } from './auth.models';

const credential: StoredRefreshCredential = {
  refreshToken: 'refresh-token',
  refreshExpiresAt: '2026-10-30T12:00:00.000Z',
};

describe('SecureCredentialStore', () => {
  let store: SecureCredentialStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SecureCredentialStore,
        { provide: CREDENTIAL_STORAGE_ADAPTER, useClass: MemoryCredentialStorageAdapter },
      ],
    });
    store = TestBed.inject(SecureCredentialStore);
  });

  it('uses memory-only browser storage behavior', async () => {
    await store.write(credential);
    expect(await store.read()).toEqual(credential);
    await store.clear();
    expect(await store.read()).toBeNull();
  });

  it('selects native storage only for native Capacitor execution', () => {
    expect(createCredentialStorageAdapter(false)).toBeInstanceOf(MemoryCredentialStorageAdapter);
    expect(createCredentialStorageAdapter(true)).toBeInstanceOf(NativeCredentialStorageAdapter);
  });

  it('replaces credentials without storing an access token', async () => {
    await store.write(credential);
    const replacement = { ...credential, refreshToken: 'replacement-token' };
    await store.replace(replacement);

    expect(await store.read()).toEqual(replacement);
  });

  it('fails closed when stored data is corrupted', async () => {
    const adapter = TestBed.inject(CREDENTIAL_STORAGE_ADAPTER);
    await adapter.write('{"refreshToken":');

    await expect(store.read()).rejects.toBeInstanceOf(CredentialStorageError);
    expect(await adapter.read()).toBeNull();
  });

  it('clears storage when replacement cannot be verified', async () => {
    class FailingAdapter implements CredentialStorageAdapter {
      async read(): Promise<string | null> { return 'different-value'; }
      async write(): Promise<void> { return; }
      async clear(): Promise<void> { return; }
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        SecureCredentialStore,
        { provide: CREDENTIAL_STORAGE_ADAPTER, useClass: FailingAdapter },
      ],
    });
    const failingStore = TestBed.inject(SecureCredentialStore);

    await expect(failingStore.replace(credential)).rejects.toBeInstanceOf(CredentialStorageError);
  });
});
