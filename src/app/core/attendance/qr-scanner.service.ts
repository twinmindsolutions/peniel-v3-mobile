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

export type QrContinuousScanOutcome = QrScanOutcome | { readonly kind: 'paused' };

export interface QrContinuousScanSession {
  stop(reason?: QrContinuousScanStopReason): Promise<void>;
}

export type QrContinuousScanStopReason = 'operator' | 'paused' | 'authorization_revoked' | 'context_changed' | 'component_destroyed';

// Peniel QR identifiers are UUID-shaped opaque values. The version nibble is
// intentionally not restricted: existing records include non-RFC UUID version
// values, while the variant nibble and canonical UUID syntax remain strict.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface NativeQrBarcodeValue {
  readonly rawValue?: unknown;
  readonly displayValue?: unknown;
  readonly format?: unknown;
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

function isQrBarcode(barcode: NativeQrBarcodeValue): boolean {
  const format = typeof barcode.format === 'string' ? barcode.format.trim().toUpperCase() : '';
  return format === 'QR_CODE' || format === 'QRCODE' || format === 'QR-CODE';
}

/** Prefer explicitly QR-formatted candidates; never treat a typed non-QR code as a member QR. */
export function selectPenielQrPayload(barcodes: readonly NativeQrBarcodeValue[]): string | null {
  const qrCandidates = barcodes.filter(isQrBarcode);
  const untypedCandidates = barcodes.filter(barcode => typeof barcode.format !== 'string' || !barcode.format.trim());
  const candidates = qrCandidates.length ? qrCandidates : untypedCandidates;
  return candidates.map(extractPenielQrPayload).find((value): value is string => value !== null) ?? null;
}

@Injectable({ providedIn: 'root' })
export class QrScannerService {
  private singleScanInFlight = false;

  async stop(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await BarcodeScanner.stopScan().catch(() => undefined);
    }
  }

  async scan(): Promise<QrScanOutcome> {
    if (!Capacitor.isNativePlatform()) return { kind: 'unsupported' };
    if (this.singleScanInFlight) return { kind: 'unavailable' };
    this.singleScanInFlight = true;
    try {
      const support = await BarcodeScanner.isSupported();
      if (!support.supported) {
        return { kind: 'unavailable' };
      }

      if (Capacitor.getPlatform() === 'android') {
        const module = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
        if (!module.available) {
          return { kind: 'unavailable' };
        }
      }

      if (Capacitor.getPlatform() !== 'android') {
        const permission = await BarcodeScanner.checkPermissions();
        const camera = permission.camera === 'prompt'
          ? (await BarcodeScanner.requestPermissions()).camera
          : permission.camera;
        if (camera !== 'granted' && camera !== 'limited') {
          return { kind: 'permission_denied' };
        }
      }

      let active = true;
      const appStateHandle = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive && active) void BarcodeScanner.stopScan().catch(() => undefined);
      });
      try {
        const result = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode], autoZoom: true });
        active = false;
        const barcodes = result.barcodes ?? [];
        const hasValue = barcodes.some(barcode => typeof barcode.rawValue === 'string' || typeof barcode.displayValue === 'string');
        if (!hasValue) {
          return { kind: 'cancelled' };
        }
        const value = selectPenielQrPayload(barcodes);
        if (!value) {
          return { kind: 'invalid_payload' };
        }
        return { kind: 'scanned', qrIdentifier: value };
      } finally {
        active = false;
        await appStateHandle.remove();
        await BarcodeScanner.stopScan().catch(() => undefined);
      }
    } catch {
      return { kind: 'unavailable' };
    } finally {
      this.singleScanInFlight = false;
    }
  }

  async startContinuousScan(onOutcome: (outcome: QrContinuousScanOutcome) => void | Promise<void>): Promise<QrContinuousScanSession | QrScanOutcome> {
    if (!Capacitor.isNativePlatform()) return { kind: 'unsupported' };

    let closed = false;
    const close = async (reason: QrContinuousScanStopReason): Promise<void> => {
      if (closed) return;
      closed = true;
      // scan() owns the native Google scanner activity. Calling stopScan here
      // is harmless when it has already returned, and cancels an active scan
      // when the page is left or the operator stops the sequence.
      await BarcodeScanner.stopScan().catch(() => undefined);
      if (reason === 'paused') onOutcome({ kind: 'paused' });
    };

    try {
      const support = await BarcodeScanner.isSupported();
      if (!support.supported) {
        return { kind: 'unavailable' };
      }

      const session: QrContinuousScanSession = { stop: (reason = 'operator') => close(reason) };
      // Google’s ready-made scanner closes after each result. Keep the next
      // scan behind the async outcome callback so preview/queue processing has
      // completed before another native activity is opened.
      void (async () => {
        while (!closed) {
          let outcome: QrScanOutcome;
          try {
            outcome = await this.scan();
          } catch {
            throw new Error('continuous_scan_rejected');
          }
          if (closed) return;

          await onOutcome(outcome);
          if (closed || outcome.kind === 'cancelled') {
            closed = true;
            return;
          }
          if (outcome.kind !== 'scanned' && outcome.kind !== 'invalid_payload') {
            closed = true;
            return;
          }
        }
      })().catch(() => {
        if (!closed) {
          closed = true;
          void onOutcome({ kind: 'unavailable' });
        }
      });

      return session;
    } catch (error: unknown) {
      closed = true;
      await BarcodeScanner.stopScan().catch(() => undefined);
      return { kind: 'unavailable' };
    }
  }
}
