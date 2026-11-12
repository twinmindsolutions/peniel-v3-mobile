import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { extractPenielQrPayload, parsePenielQrPayload, QrScannerService } from './qr-scanner.service';

describe('QrScannerService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses one strict parser for canonical UUID payloads and rejects URLs or membership numbers', () => {
    expect(parsePenielQrPayload('  9bf65ada-3822-d24a-8a78-608af3fdc819  ')).toBe('9bf65ada-3822-d24a-8a78-608af3fdc819');
    expect(parsePenielQrPayload('MK-7F3K92QX')).toBeNull();
    expect(parsePenielQrPayload('https://example.com/member/9bf65ada-3822-d24a-8a78-608af3fdc819')).toBeNull();
  });

  it('accepts the native wrapper when the decoded UUID is exposed as displayValue', () => {
    expect(extractPenielQrPayload({ displayValue: '9bf65ada-3822-d24a-8a78-608af3fdc819' })).toBe('9bf65ada-3822-d24a-8a78-608af3fdc819');
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

    await expect(new QrScannerService().scan()).resolves.toEqual({ kind: 'invalid_payload' });
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

  it('starts an event-based continuous scan and stops its listeners cleanly', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'checkPermissions').mockResolvedValue({ camera: 'granted' });
    vi.spyOn(BarcodeScanner, 'startScan').mockResolvedValue();
    vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    const remove = vi.fn().mockResolvedValue();
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove } as never);
    let listener: ((event: { barcodes: Array<{ rawValue?: string }> }) => void) | undefined;
    vi.spyOn(BarcodeScanner, 'addListener').mockImplementation(async (event, callback) => {
      if (event === 'barcodesScanned') listener = callback as typeof listener;
      return { remove } as never;
    });

    const outcomes: QrScanOutcome[] = [];
    const session = await new QrScannerService().startContinuousScan((outcome) => {
      if (outcome.kind !== 'paused') outcomes.push(outcome);
    });

    expect('stop' in session).toBe(true);
    listener?.({ barcodes: [{ rawValue: '9bf65ada-3822-424a-8a78-608af3fdc819' }] });
    expect(outcomes).toEqual([{ kind: 'scanned', qrIdentifier: '9bf65ada-3822-424a-8a78-608af3fdc819' }]);
    if ('stop' in session) await session.stop();
    expect(remove).toHaveBeenCalledTimes(3);
    expect(BarcodeScanner.stopScan).toHaveBeenCalled();
  });

  it('passes continuous displayValue results through the same parser', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'checkPermissions').mockResolvedValue({ camera: 'granted' });
    vi.spyOn(BarcodeScanner, 'startScan').mockResolvedValue();
    vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove: vi.fn().mockResolvedValue() } as never);
    let listener: ((event: { barcodes: Array<{ displayValue?: string }> }) => void) | undefined;
    vi.spyOn(BarcodeScanner, 'addListener').mockImplementation(async (event, callback) => {
      if (event === 'barcodesScanned') listener = callback as typeof listener;
      return { remove: vi.fn().mockResolvedValue() } as never;
    });
    const outcomes: QrScanOutcome[] = [];
    const session = await new QrScannerService().startContinuousScan(outcome => {
      if (outcome.kind !== 'paused') outcomes.push(outcome);
    });

    listener?.({ barcodes: [{ displayValue: '9bf65ada-3822-424a-8a78-608af3fdc819' }] });
    expect(outcomes).toEqual([{ kind: 'scanned', qrIdentifier: '9bf65ada-3822-424a-8a78-608af3fdc819' }]);
    if ('stop' in session) await session.stop();
  });

  it('registers the barcode listener before starting native scanning', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'checkPermissions').mockResolvedValue({ camera: 'granted' });
    vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    const order: string[] = [];
    vi.spyOn(BarcodeScanner, 'addListener').mockImplementation(async () => {
      order.push('listener');
      return { remove: vi.fn().mockResolvedValue() } as never;
    });
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove: vi.fn().mockResolvedValue() } as never);
    vi.spyOn(BarcodeScanner, 'startScan').mockImplementation(async () => {
      order.push('native-start');
    });

    await new QrScannerService().startContinuousScan(() => undefined);

    expect(order).toEqual(['listener', 'listener', 'native-start']);
  });

  it('surfaces a native scan error and releases the continuous scanner', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(BarcodeScanner, 'isSupported').mockResolvedValue({ supported: true });
    vi.spyOn(BarcodeScanner, 'checkPermissions').mockResolvedValue({ camera: 'granted' });
    vi.spyOn(BarcodeScanner, 'startScan').mockResolvedValue();
    const stopScan = vi.spyOn(BarcodeScanner, 'stopScan').mockResolvedValue();
    let scanError: (() => void) | undefined;
    vi.spyOn(BarcodeScanner, 'addListener').mockImplementation(async (event, callback) => {
      if (event === 'scanError') scanError = callback as () => void;
      return { remove: vi.fn().mockResolvedValue() } as never;
    });
    vi.spyOn(App, 'addListener').mockResolvedValue({ remove: vi.fn().mockResolvedValue() } as never);
    const outcomes: QrScanOutcome[] = [];
    await new QrScannerService().startContinuousScan(outcome => {
      if (outcome.kind !== 'paused') outcomes.push(outcome);
    });

    scanError?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(outcomes).toEqual([{ kind: 'unavailable' }]);
    expect(stopScan).toHaveBeenCalled();
  });
});
