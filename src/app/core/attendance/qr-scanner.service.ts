import { Capacitor } from '@capacitor/core';
import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

export type QrScanOutcome =
  | { readonly kind: 'scanned'; readonly qrIdentifier: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'permission_denied' }
  | { readonly kind: 'invalid_payload' }
  | { readonly kind: 'unavailable' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
}
