import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { QrScannerService } from './qr-scanner.service';

describe('QrScannerService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not invoke the scanner in browser development', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const scan = vi.spyOn(BarcodeScanner, 'scan');

    await expect(new QrScannerService().scan()).resolves.toEqual({ kind: 'unsupported' });
    expect(scan).not.toHaveBeenCalled();
  });

  it('returns only a validated UUID from a native QR result', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'checkPermissions').mockResolvedValue({ camera: 'granted' });
    vi.spyOn(BarcodeScanner, 'scan').mockResolvedValue({
      barcodes: [{ rawValue: '9bf65ada-3822-424a-8a78-608af3fdc819' } as never],
    });
    vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove: vi.fn() });

    await expect(new QrScannerService().scan()).resolves.toEqual({
      kind: 'scanned', qrIdentifier: '9bf65ada-3822-424a-8a78-608af3fdc819',
    });
  });

  it('rejects non-UUID payloads without exposing them', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'checkPermissions').mockResolvedValue({ camera: 'granted' });
    vi.spyOn(BarcodeScanner, 'scan').mockResolvedValue({ barcodes: [{ rawValue: 'not-a-peniel-qr' } as never] });
    vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove: vi.fn() });

    await expect(new QrScannerService().scan()).resolves.toEqual({ kind: 'invalid_payload' });
  });
});
