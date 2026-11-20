vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
  BarcodeFormat: { QrCode: 'QR_CODE' },
  BarcodeScanner: {
    isSupported: vi.fn(),
    isGoogleBarcodeScannerModuleAvailable: vi.fn(),
    scan: vi.fn(),
    stopScan: vi.fn(),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
  },
}));

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { extractPenielQrPayload, parsePenielQrPayload, QrScannerService, selectPenielQrPayload, QrScanOutcome } from './qr-scanner.service';

describe('QrScannerService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses one strict parser for canonical UUID payloads and rejects URLs or membership numbers', () => {
    expect(parsePenielQrPayload('  9bf65ada-3822-d24a-8a78-608af3fdc819  ')).toBe('9bf65ada-3822-d24a-8a78-608af3fdc819');
    expect(parsePenielQrPayload('MK-7F3K92QX')).toBeNull();
    expect(parsePenielQrPayload('https://example.com/member/9bf65ada-3822-d24a-8a78-608af3fdc819')).toBeNull();
  });

  it('accepts uppercase UUID hex and uppercase RFC-4122 variant digits', () => {
    expect(parsePenielQrPayload('9BF65ADA-3822-D24A-B78A-608AF3FDC819')).toBe('9BF65ADA-3822-D24A-B78A-608AF3FDC819');
  });

  it('rejects non-hex characters even when the UUID segment lengths look correct', () => {
    expect(parsePenielQrPayload('9BF65ADA-3822-D24A-B78Z-608AF3FDC819')).toBeNull();
  });

  it('accepts the native wrapper when the decoded UUID is exposed as displayValue', () => {
    expect(extractPenielQrPayload({ displayValue: '9bf65ada-3822-d24a-8a78-608af3fdc819' })).toBe('9bf65ada-3822-d24a-8a78-608af3fdc819');
  });

  it('validates rawValue and displayValue independently', () => {
    expect(extractPenielQrPayload({
      rawValue: 'not-a-uuid',
      displayValue: '9BF65ADA-3822-D24A-B78A-608AF3FDC819',
    })).toBe('9BF65ADA-3822-D24A-B78A-608AF3FDC819');
    expect(extractPenielQrPayload({
      rawValue: '9BF65ADA-3822-D24A-B78A-608AF3FDC819',
      displayValue: 'not-a-uuid',
    })).toBe('9BF65ADA-3822-D24A-B78A-608AF3FDC819');
  });

  it('selects a valid QR candidate ahead of unrelated barcode results', () => {
    expect(selectPenielQrPayload([
      { rawValue: '9bf65ada-3822-424a-8a78-608af3fdc819', format: 'CODE_128' },
      { displayValue: '9bf65ada-3822-424a-8a78-608af3fdc819', format: 'QR_CODE' },
    ])).toBe('9bf65ada-3822-424a-8a78-608af3fdc819');
    expect(selectPenielQrPayload([
      { rawValue: '9bf65ada-3822-424a-8a78-608af3fdc819', format: 'CODE_128' },
    ])).toBeNull();
  });

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

  it('accepts a Google scanner result whose raw value is exposed as displayValue', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'isGoogleBarcodeScannerModuleAvailable').mockResolvedValue({ available: true });
    vi.spyOn(BarcodeScanner, 'scan').mockResolvedValue({
      barcodes: [{ displayValue: '9bf65ada-3822-424a-8a78-608af3fdc819' } as never],
    });
    vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove: vi.fn() });

    await expect(new QrScannerService().scan()).resolves.toEqual({
      kind: 'scanned', qrIdentifier: '9bf65ada-3822-424a-8a78-608af3fdc819',
    });
  });

  it('handles multiple returned barcodes deterministically', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'isGoogleBarcodeScannerModuleAvailable').mockResolvedValue({ available: true });
    vi.spyOn(BarcodeScanner, 'scan').mockResolvedValue({
      barcodes: [
        { rawValue: '9bf65ada-3822-424a-8a78-608af3fdc819', format: 'CODE_128' } as never,
        { rawValue: '9bf65ada-3822-424a-8a78-608af3fdc819', format: 'QR_CODE' } as never,
      ],
    });
    vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove: vi.fn() });

    await expect(new QrScannerService().scan()).resolves.toEqual({
      kind: 'scanned', qrIdentifier: '9bf65ada-3822-424a-8a78-608af3fdc819',
    });
  });

  it('accepts existing Peniel QR identifiers with a non-standard version nibble', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'checkPermissions').mockResolvedValue({ camera: 'granted' });
    vi.spyOn(BarcodeScanner, 'scan').mockResolvedValue({
      barcodes: [{ rawValue: '9bf65ada-3822-d24a-8a78-608af3fdc819' } as never],
    });
    vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove: vi.fn() });

    await expect(new QrScannerService().scan()).resolves.toEqual({
      kind: 'scanned', qrIdentifier: '9bf65ada-3822-d24a-8a78-608af3fdc819',
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

    const service = new QrScannerService();
    await expect(service.scan()).resolves.toEqual({ kind: 'invalid_payload' });
  });

  it.each([
    ['a membership number', 'MK-7F3K92QX'],
    ['an unrelated URL', 'https://example.com/member/9bf65ada-3822-d24a-8a78-608af3fdc819'],
    ['a malformed UUID', '9bf65ada-3822-d24a-d24a-608af3fdc819'],
  ])('rejects %s', async (_description, rawValue) => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'checkPermissions').mockResolvedValue({ camera: 'granted' });
    vi.spyOn(BarcodeScanner, 'scan').mockResolvedValue({ barcodes: [{ rawValue } as never] });
    vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove: vi.fn() });

    await expect(new QrScannerService().scan()).resolves.toEqual({ kind: 'invalid_payload' });
  });

  it('reopens the proven Google scanner only after each result is processed', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'isGoogleBarcodeScannerModuleAvailable').mockResolvedValue({ available: true });
    vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) } as never);
    const scan = vi.spyOn(BarcodeScanner, 'scan');
    scan
      .mockResolvedValueOnce({ barcodes: [{ rawValue: '9bf65ada-3822-424a-8a78-608af3fdc819' } as never] })
      .mockResolvedValueOnce({ barcodes: [{ rawValue: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never] })
      .mockResolvedValueOnce({ barcodes: [] });
    const outcomes: QrScanOutcome[] = [];
    const service = new QrScannerService();
    const session = await service.startContinuousScan(async (outcome) => {
      if (outcome.kind !== 'paused') outcomes.push(outcome);
    });

    expect('stop' in session).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(scan).toHaveBeenCalledTimes(3);
    expect(outcomes).toEqual([
      { kind: 'scanned', qrIdentifier: '9bf65ada-3822-424a-8a78-608af3fdc819' },
      { kind: 'scanned', qrIdentifier: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { kind: 'cancelled' },
    ]);
    if ('stop' in session) await session.stop();
    expect(BarcodeScanner.stopScan).toHaveBeenCalled();
  });

  it('continues after an invalid payload without changing the shared parser', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'isGoogleBarcodeScannerModuleAvailable').mockResolvedValue({ available: true });
    vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) } as never);
    const scan = vi.spyOn(BarcodeScanner, 'scan');
    scan
      .mockResolvedValueOnce({ barcodes: [{ rawValue: 'not-a-peniel-qr' } as never] })
      .mockResolvedValueOnce({ barcodes: [{ displayValue: '9bf65ada-3822-424a-8a78-608af3fdc819' } as never] })
      .mockResolvedValueOnce({ barcodes: [] });
    const outcomes: QrScanOutcome[] = [];
    const session = await new QrScannerService().startContinuousScan(async outcome => {
      if (outcome.kind !== 'paused') outcomes.push(outcome);
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(scan).toHaveBeenCalledTimes(3);
    expect(outcomes).toEqual([
      { kind: 'invalid_payload' },
      { kind: 'scanned', qrIdentifier: '9bf65ada-3822-424a-8a78-608af3fdc819' },
      { kind: 'cancelled' },
    ]);
    if ('stop' in session) await session.stop();
  });

  it('does not start a second native scan while the first result is being handled', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'isGoogleBarcodeScannerModuleAvailable').mockResolvedValue({ available: true });
    vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) } as never);
    let release!: () => void;
    const handling = new Promise<void>(resolve => { release = resolve; });
    const scan = vi.spyOn(BarcodeScanner, 'scan');
    scan.mockResolvedValueOnce({ barcodes: [{ rawValue: '9bf65ada-3822-424a-8a78-608af3fdc819' } as never] });
    scan
      .mockResolvedValueOnce({ barcodes: [{ rawValue: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never] })
      .mockResolvedValueOnce({ barcodes: [] });
    const session = await new QrScannerService().startContinuousScan(async () => handling);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(scan).toHaveBeenCalledTimes(1);
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(scan).toHaveBeenCalledTimes(3);
    if ('stop' in session) await session.stop();
  });
});
