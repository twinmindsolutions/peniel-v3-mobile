import { Capacitor } from '@capacitor/core';
import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { BarcodeFormat, BarcodeScanner, type BarcodesScannedEvent } from '@capacitor-mlkit/barcode-scanning';
import type { PluginListenerHandle } from '@capacitor/core';

export type QrScanOutcome =
  | { readonly kind: 'scanned'; readonly qrIdentifier: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'permission_denied' }
  | { readonly kind: 'invalid_payload' }
  | { readonly kind: 'unavailable' };

export type QrContinuousScanOutcome = QrScanOutcome | { readonly kind: 'paused' };

export interface QrContinuousScanSession {
  stop(): Promise<void>;
}

// Peniel QR identifiers are UUID-shaped opaque values. The version nibble is
// intentionally not restricted: existing records include non-RFC UUID version
// values, while the variant nibble and canonical UUID syntax remain strict.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable({ providedIn: 'root' })
export class QrScannerService {
  async stop(): Promise<void> {
    if (Capacitor.isNativePlatform()) await BarcodeScanner.stopScan().catch(() => undefined);
  }

  async scan(): Promise<QrScanOutcome> {
    if (!Capacitor.isNativePlatform()) return { kind: 'unsupported' };

    try {
      const support = await BarcodeScanner.isSupported();
      if (!support.supported) return { kind: 'unavailable' };

      if (Capacitor.getPlatform() === 'android') {
        const module = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
        if (!module.available) return { kind: 'unavailable' };
      }

      if (Capacitor.getPlatform() !== 'android') {
        const permission = await BarcodeScanner.checkPermissions();
        const camera = permission.camera === 'prompt'
          ? (await BarcodeScanner.requestPermissions()).camera
          : permission.camera;
        if (camera !== 'granted' && camera !== 'limited') return { kind: 'permission_denied' };
      }

      let active = true;
      const appStateHandle = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive && active) void BarcodeScanner.stopScan().catch(() => undefined);
      });
      try {
        const result = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode], autoZoom: true });
        active = false;
        const value = result.barcodes[0]?.rawValue?.trim();
        if (!value) return { kind: 'cancelled' };
        if (!UUID_PATTERN.test(value)) return { kind: 'invalid_payload' };
        return { kind: 'scanned', qrIdentifier: value };
      } finally {
        active = false;
        await appStateHandle.remove();
        await BarcodeScanner.stopScan().catch(() => undefined);
      }
    } catch {
      return { kind: 'unavailable' };
    }
  }

  async startContinuousScan(onOutcome: (outcome: QrContinuousScanOutcome) => void): Promise<QrContinuousScanSession | QrScanOutcome> {
    if (!Capacitor.isNativePlatform()) return { kind: 'unsupported' };

    try {
      const support = await BarcodeScanner.isSupported();
      if (!support.supported) return { kind: 'unavailable' };

      const permission = await BarcodeScanner.checkPermissions();
      const camera = permission.camera === 'prompt'
        ? (await BarcodeScanner.requestPermissions()).camera
        : permission.camera;
      if (camera !== 'granted' && camera !== 'limited') return { kind: 'permission_denied' };

      let closed = false;
      let barcodeListener: PluginListenerHandle | undefined;
      let appStateListener: PluginListenerHandle | undefined;
      const removeScannerUi = () => document.querySelector('body')?.classList.remove('barcode-scanner-active');
      const close = async (paused: boolean): Promise<void> => {
        if (closed) return;
        closed = true;
        removeScannerUi();
        await barcodeListener?.remove().catch(() => undefined);
        await appStateListener?.remove().catch(() => undefined);
        await BarcodeScanner.stopScan().catch(() => undefined);
        if (paused) onOutcome({ kind: 'paused' });
      };

      document.querySelector('body')?.classList.add('barcode-scanner-active');
      barcodeListener = await BarcodeScanner.addListener('barcodesScanned', (event: BarcodesScannedEvent) => {
        if (closed) return;
        const value = event.barcodes[0]?.rawValue?.trim();
        if (!value) return;
        onOutcome(UUID_PATTERN.test(value) ? { kind: 'scanned', qrIdentifier: value } : { kind: 'invalid_payload' });
      });
      appStateListener = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) void close(true);
      });
      await BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode] });

      return { stop: () => close(false) };
    } catch {
      document.querySelector('body')?.classList.remove('barcode-scanner-active');
      await BarcodeScanner.stopScan().catch(() => undefined);
      return { kind: 'unavailable' };
    }
  }
}
