import { Capacitor } from '@capacitor/core';
import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { BarcodeFormat, BarcodeScanner, type BarcodesScannedEvent, type ScanErrorEvent } from '@capacitor-mlkit/barcode-scanning';
import type { PluginListenerHandle } from '@capacitor/core';
import { environment } from '../../../environments/environment';

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

export interface NativeQrBarcodeValue {
  readonly rawValue?: unknown;
  readonly displayValue?: unknown;
}

/**
 * Returns only Peniel's opaque QR identity. Membership numbers, URLs and
 * arbitrary barcode text are intentionally rejected before the API call.
 */
export function parsePenielQrPayload(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

/** Native plugin versions expose the decoded value under either field. */
export function extractPenielQrPayload(barcode: NativeQrBarcodeValue | undefined): string | null {
  return parsePenielQrPayload(barcode?.rawValue) ?? parsePenielQrPayload(barcode?.displayValue);
}

@Injectable({ providedIn: 'root' })
export class QrScannerService {
  async stop(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      this.scannerDiagnostic('scanner_stopped');
      await BarcodeScanner.stopScan().catch(() => undefined);
    }
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
        const barcode = result.barcodes[0];
        const hasValue = typeof barcode?.rawValue === 'string' || typeof barcode?.displayValue === 'string';
        if (!hasValue) return { kind: 'cancelled' };
        const value = extractPenielQrPayload(barcode);
        if (!value) return { kind: 'invalid_payload' };
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
      this.scannerDiagnostic('scanner_start_requested');
      const support = await BarcodeScanner.isSupported();
      if (!support.supported) return { kind: 'unavailable' };

      const permission = await BarcodeScanner.checkPermissions();
      const camera = permission.camera === 'prompt'
        ? (await BarcodeScanner.requestPermissions()).camera
        : permission.camera;
      if (camera !== 'granted' && camera !== 'limited') return { kind: 'permission_denied' };

      let closed = false;
      let barcodeListener: PluginListenerHandle | undefined;
      let scanErrorListener: PluginListenerHandle | undefined;
      let appStateListener: PluginListenerHandle | undefined;
      const removeScannerUi = () => document.querySelector('body')?.classList.remove('barcode-scanner-active');
      const close = async (paused: boolean): Promise<void> => {
        if (closed) return;
        closed = true;
        removeScannerUi();
        await barcodeListener?.remove().catch(() => undefined);
        await scanErrorListener?.remove().catch(() => undefined);
        await appStateListener?.remove().catch(() => undefined);
        await BarcodeScanner.stopScan().catch(() => undefined);
        this.scannerDiagnostic(paused ? 'scanner_paused' : 'scanner_stopped');
        if (paused) onOutcome({ kind: 'paused' });
      };

      document.querySelector('body')?.classList.add('barcode-scanner-active');
      barcodeListener = await BarcodeScanner.addListener('barcodesScanned', (event: BarcodesScannedEvent) => {
        if (closed) return;
        this.scannerDiagnostic('qr_decode_received', { barcodeCount: event.barcodes.length });
        const value = extractPenielQrPayload(event.barcodes[0]);
        if (!value) {
          if (event.barcodes[0]) onOutcome({ kind: 'invalid_payload' });
          return;
        }
        onOutcome({ kind: 'scanned', qrIdentifier: value });
      });
      this.scannerDiagnostic('scanner_listener_registered');
      scanErrorListener = await BarcodeScanner.addListener('scanError', (_event: ScanErrorEvent) => {
        if (closed) return;
        this.scannerDiagnostic('scanner_error', { category: 'native_scan_error' });
        void close(false).then(() => onOutcome({ kind: 'unavailable' }));
      });
      appStateListener = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) void close(true);
      });
      await BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode] });
      this.scannerDiagnostic('scanner_native_started');

      return { stop: () => close(false) };
    } catch (error: unknown) {
      this.scannerDiagnostic('scanner_start_failed', { category: error instanceof Error ? 'native_start_error' : 'unknown_error' });
      document.querySelector('body')?.classList.remove('barcode-scanner-active');
      await BarcodeScanner.stopScan().catch(() => undefined);
      return { kind: 'unavailable' };
    }
  }

  private scannerDiagnostic(event: string, details: Record<string, unknown> = {}): void {
    if (!environment.production) console.debug('[qr-scanner]', event, details);
  }
}
