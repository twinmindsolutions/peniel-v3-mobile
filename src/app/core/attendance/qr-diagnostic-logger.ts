import { Capacitor, registerPlugin } from '@capacitor/core';
import { environment } from '../../../environments/environment';

export type PenielQrLogValue = string | number | boolean | null;

interface PenielDiagnosticsPlugin {
  log(options: Readonly<Record<string, PenielQrLogValue>>): Promise<void>;
}

const nativeDiagnostics = registerPlugin<PenielDiagnosticsPlugin>('PenielDiagnostics');

/** Staging/development-only structured logging for QR diagnostics. */
export function logPenielQrDiagnostic(
  enabled: boolean,
  event: string,
  metadata: Readonly<Record<string, PenielQrLogValue>> = {},
): void {
  if (!enabled || environment.production) return;
  const record = { event, timestamp: new Date().toISOString(), ...metadata };
  console.debug('[peniel-qr]', JSON.stringify(record));
  if (Capacitor.isNativePlatform()) {
    void nativeDiagnostics.log(record).catch(() => undefined);
  }
}
