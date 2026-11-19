import { Capacitor } from '@capacitor/core';
import { Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { environment } from '../../../environments/environment';
import { logPenielQrDiagnostic, type PenielQrLogValue } from './qr-diagnostic-logger';

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

export interface SingleQrDiagnosticEntry {
  readonly attempt: number;
  readonly event: string;
  readonly summary: string;
}

export interface ContinuousQrDiagnosticEntry {
  readonly sequence: number;
  readonly attemptId: number;
  readonly event: string;
  readonly summary: string;
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

interface SafeDecodedValueMetadata {
  readonly length: number;
  readonly trimmedLength: number;
  readonly asciiCount: number;
  readonly unicodeCount: number;
  readonly controlCount: number;
  readonly leadingOrTrailingWhitespace: boolean;
  readonly hiddenControl: boolean;
  readonly segmentLengths: string;
  readonly canonicalHyphenLayout: boolean;
  readonly versionNibble: string;
  readonly versionValid: boolean;
  readonly variantNibble: string;
  readonly variantValid: boolean;
  readonly uuidShapeValid: boolean;
}

function inspectDecodedValue(value: unknown): SafeDecodedValueMetadata {
  if (typeof value !== 'string') {
    return {
      length: 0,
      trimmedLength: 0,
      asciiCount: 0,
      unicodeCount: 0,
      controlCount: 0,
      leadingOrTrailingWhitespace: false,
      hiddenControl: false,
      segmentLengths: 'none',
      canonicalHyphenLayout: false,
      versionNibble: 'none',
      versionValid: false,
      variantNibble: 'none',
      variantValid: false,
      uuidShapeValid: false,
    };
  }
  const trimmed = value.trim();
  const codePoints = [...value];
  const controlCount = codePoints.filter((character) => /[\u0000-\u001f\u007f-\u009f]/u.test(character)).length;
  const segments = trimmed.split('-');
  const canonicalHyphenLayout = segments.length === 5 && segments.map((segment) => segment.length).join('-') === '8-4-4-4-12';
  const versionNibble = canonicalHyphenLayout ? trimmed[14]?.toLowerCase() || 'none' : 'none';
  const variantNibble = canonicalHyphenLayout ? trimmed[19]?.toLowerCase() || 'none' : 'none';
  return {
    length: codePoints.length,
    trimmedLength: [...trimmed].length,
    asciiCount: codePoints.filter((character) => character.codePointAt(0)! <= 0x7f).length,
    unicodeCount: codePoints.filter((character) => character.codePointAt(0)! > 0x7f).length,
    controlCount,
    leadingOrTrailingWhitespace: value !== trimmed,
    hiddenControl: controlCount > 0,
    segmentLengths: segments.length === 5 ? segments.map((segment) => segment.length).join('-') : `${segments.length}-segments`,
    canonicalHyphenLayout,
    versionNibble,
    versionValid: /^[0-9a-f]$/i.test(versionNibble),
    variantNibble,
    variantValid: /^[89ab]$/i.test(variantNibble),
    uuidShapeValid: parsePenielQrPayload(value) !== null,
  };
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
  private singleScanAttempt = 0;
  private singleScanStartedAt = 0;
  readonly singleScanDiagnostics = signal<readonly SingleQrDiagnosticEntry[]>([]);
  private continuousScanAttempt = 0;
  private continuousDiagnosticSequence = 0;
  private activeContinuousAttempt: number | null = null;
  readonly continuousScanDiagnostics = signal<readonly ContinuousQrDiagnosticEntry[]>([]);

  async stop(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      this.scannerDiagnostic('scanner_stopped');
      await BarcodeScanner.stopScan().catch(() => undefined);
    }
  }

  async scan(): Promise<QrScanOutcome> {
    if (!Capacitor.isNativePlatform()) return { kind: 'unsupported' };
    if (this.singleScanInFlight) return { kind: 'unavailable' };
    this.singleScanInFlight = true;
    this.singleScanAttempt += 1;
    this.singleScanStartedAt = Date.now();
    let finalOutcome = 'unavailable';
    this.singleScanDiagnostic('single_scan_started', 'scanner requested');
    this.scannerDiagnostic('single_scan_started');

    try {
      const support = await BarcodeScanner.isSupported();
      if (!support.supported) {
        finalOutcome = 'unsupported';
        return { kind: 'unavailable' };
      }

      if (Capacitor.getPlatform() === 'android') {
        const module = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
        if (!module.available) {
          finalOutcome = 'unavailable';
          return { kind: 'unavailable' };
        }
      }

      if (Capacitor.getPlatform() !== 'android') {
        const permission = await BarcodeScanner.checkPermissions();
        const camera = permission.camera === 'prompt'
          ? (await BarcodeScanner.requestPermissions()).camera
          : permission.camera;
        if (camera !== 'granted' && camera !== 'limited') {
          finalOutcome = 'permission_denied';
          return { kind: 'permission_denied' };
        }
      }

      let active = true;
      const appStateHandle = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive && active) void BarcodeScanner.stopScan().catch(() => undefined);
      });
      try {
        this.singleScanDiagnostic('scanner_native_started', 'native scan started');
        const result = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode], autoZoom: true });
        active = false;
        const barcodes = result.barcodes ?? [];
        const qrFormatCount = barcodes.filter(isQrBarcode).length;
        const analysis = analyzePenielQrCandidates(barcodes);
        const formatCategories = [...new Set(analysis.candidates.map((candidate) => candidate.format))].join(', ') || 'none';
        this.singleScanDiagnostic(
          'single_scan_result_received',
          `${barcodes.length} barcode${barcodes.length === 1 ? '' : 's'}; formats: ${formatCategories}; raw ${analysis.rawValueCount}; display ${analysis.displayValueCount}; QR formats ${qrFormatCount}`,
          {
            barcode_count: barcodes.length,
            barcode_format_categories: formatCategories,
            raw_value_present: analysis.rawValueCount > 0,
            display_value_present: analysis.displayValueCount > 0,
            qr_format_count: qrFormatCount,
          },
        );
        this.scannerDiagnostic('single_scan_result_received', {
          returnedBarcodeCount: barcodes.length,
          qrFormatCount,
        });
        for (const candidate of analysis.candidates) {
          this.singleScanDiagnostic(
            'single_scan_candidate_evaluated',
            `candidate index ${candidate.index}; format ${candidate.format}; raw length ${candidate.raw.length}/${candidate.raw.trimmedLength}; display length ${candidate.display.length}/${candidate.display.trimmedLength}; segments raw ${candidate.raw.segmentLengths}; UUID shape ${candidate.uuidShapeValid}; variant raw ${candidate.raw.variantValid}`,
            {
              candidate_index: candidate.index,
              barcode_format: candidate.format,
              raw_value_present: candidate.rawValuePresent,
              display_value_present: candidate.displayValuePresent,
              uuid_shape_valid: candidate.uuidShapeValid,
              raw_length: candidate.raw.length,
              raw_trimmed_length: candidate.raw.trimmedLength,
              display_length: candidate.display.length,
              display_trimmed_length: candidate.display.trimmedLength,
              ascii_count: candidate.raw.asciiCount,
              unicode_count: candidate.raw.unicodeCount,
              control_count: candidate.raw.controlCount,
              display_ascii_count: candidate.display.asciiCount,
              display_unicode_count: candidate.display.unicodeCount,
              display_control_count: candidate.display.controlCount,
              leading_or_trailing_whitespace: candidate.raw.leadingOrTrailingWhitespace,
              hidden_control: candidate.raw.hiddenControl,
              display_leading_or_trailing_whitespace: candidate.display.leadingOrTrailingWhitespace,
              display_hidden_control: candidate.display.hiddenControl,
              segment_lengths: candidate.raw.segmentLengths,
              display_segment_lengths: candidate.display.segmentLengths,
              canonical_hyphen_layout: candidate.raw.canonicalHyphenLayout,
              display_canonical_hyphen_layout: candidate.display.canonicalHyphenLayout,
              version_nibble: candidate.raw.versionNibble,
              version_valid: candidate.raw.versionValid,
              variant_nibble: candidate.raw.variantNibble,
              variant_valid: candidate.raw.variantValid,
              display_version_nibble: candidate.display.versionNibble,
              display_version_valid: candidate.display.versionValid,
              display_variant_nibble: candidate.display.variantNibble,
              display_variant_valid: candidate.display.variantValid,
              raw_display_equal: candidate.rawDisplayEqual,
            },
          );
        }
        const hasValue = barcodes.some(barcode => typeof barcode.rawValue === 'string' || typeof barcode.displayValue === 'string');
        if (!hasValue) {
          finalOutcome = 'cancelled';
          this.singleScanDiagnostic('single_scan_cancelled', 'no decoded value returned');
          this.scannerDiagnostic('single_scan_cancelled');
          return { kind: 'cancelled' };
        }
        const value = selectPenielQrPayload(barcodes);
        if (!value) {
          finalOutcome = 'invalid_payload';
          this.singleScanDiagnostic('single_scan_payload_invalid', `local validation failed; valid UUID candidates ${analysis.validCandidateCount}; selected index none`, {
            uuid_shape_valid: false,
            candidate_index: null,
            rejection_category: 'no_valid_peniel_uuid',
          });
          this.scannerDiagnostic('single_scan_payload_invalid');
          return { kind: 'invalid_payload' };
        }
        finalOutcome = 'scanned';
        this.singleScanDiagnostic('single_scan_payload_valid', `local validation passed; valid UUID candidates ${analysis.validCandidateCount}; selected index ${analysis.selectedIndex}`, {
          uuid_shape_valid: true,
          candidate_index: analysis.selectedIndex,
        });
        this.scannerDiagnostic('single_scan_payload_valid');
        return { kind: 'scanned', qrIdentifier: value };
      } finally {
        active = false;
        await appStateHandle.remove();
        await BarcodeScanner.stopScan().catch(() => undefined);
      }
    } catch {
      this.singleScanDiagnostic('scanner_native_error', 'native scan failed', { error_category: 'scanner_failure' });
      if (this.activeContinuousAttempt !== null) {
        this.continuousDiagnostic('native_scan_rejected', this.activeContinuousAttempt, 'scanner failure', { error_category: 'scanner_failure' });
      }
      return { kind: 'unavailable' };
    } finally {
      this.singleScanDiagnostic('single_scan_finished', 'single scan finished', { final_outcome: finalOutcome });
      this.singleScanInFlight = false;
    }
  }

  recordSingleScanDiagnostic(event: string, summary: string, metadata: Readonly<Record<string, PenielQrLogValue>> = {}): void {
    this.singleScanDiagnostic(event, summary, metadata);
  }

  async startContinuousScan(onOutcome: (outcome: QrContinuousScanOutcome) => void | Promise<void>): Promise<QrContinuousScanSession | QrScanOutcome> {
    if (!Capacitor.isNativePlatform()) return { kind: 'unsupported' };

    let closed = false;
    const attemptId = ++this.continuousScanAttempt;
    this.continuousDiagnostic('multi_scan_started', attemptId, 'multi-member scan started');
    const close = async (reason: QrContinuousScanStopReason): Promise<void> => {
      if (closed) return;
      closed = true;
      this.activeContinuousAttempt = null;
      // scan() owns the native Google scanner activity. Calling stopScan here
      // is harmless when it has already returned, and cancels an active scan
      // when the page is left or the operator stops the sequence.
      await BarcodeScanner.stopScan().catch(() => undefined);
      this.scannerDiagnostic(reason === 'paused' ? 'scanner_paused' : 'scanner_stopped');
      this.continuousDiagnostic('multi_scan_stopped', attemptId, `scanner stopped: ${reason}`, { termination_reason: reason });
      if (reason === 'paused') onOutcome({ kind: 'paused' });
    };

    try {
      this.scannerDiagnostic('scanner_start_requested');
      const support = await BarcodeScanner.isSupported();
      if (!support.supported) {
        this.continuousDiagnostic('multi_scan_stopped', attemptId, 'scanner unsupported');
        return { kind: 'unavailable' };
      }

      const session: QrContinuousScanSession = { stop: (reason = 'operator') => close(reason) };
      this.activeContinuousAttempt = attemptId;
      // Google’s ready-made scanner closes after each result. Keep the next
      // scan behind the async outcome callback so preview/queue processing has
      // completed before another native activity is opened.
      void (async () => {
        let scanNumber = 0;
        while (!closed) {
          scanNumber += 1;
          if (scanNumber > 1) this.continuousDiagnostic('next_scan_invoked', attemptId, `sequence scan ${scanNumber}`);
          this.continuousDiagnostic('native_scan_invoked', attemptId, 'Google scanner invoked');
          let outcome: QrScanOutcome;
          try {
            outcome = await this.scan();
          } catch {
            this.continuousDiagnostic('native_scan_rejected', attemptId, 'scanner promise rejected');
            throw new Error('continuous_scan_rejected');
          }
          this.continuousDiagnostic('native_scan_resolved', attemptId, `outcome: ${outcome.kind}`);
          if (outcome.kind === 'cancelled') this.continuousDiagnostic('native_scan_cancelled', attemptId, 'scanner returned without a decoded value');
          if (closed) return;

          await onOutcome(outcome);
          if (closed || outcome.kind === 'cancelled') {
            closed = true;
            this.activeContinuousAttempt = null;
            this.scannerDiagnostic('scanner_stopped', { reason: outcome.kind });
            this.continuousDiagnostic('multi_scan_stopped', attemptId, `scanner outcome: ${outcome.kind}`);
            return;
          }
          if (outcome.kind !== 'scanned' && outcome.kind !== 'invalid_payload') {
            closed = true;
            this.activeContinuousAttempt = null;
            this.scannerDiagnostic('scanner_stopped', { reason: outcome.kind });
            this.continuousDiagnostic('multi_scan_stopped', attemptId, `scanner outcome: ${outcome.kind}`);
            return;
          }
          this.continuousDiagnostic('next_scan_scheduled', attemptId, 'previous result processing completed');
        }
      })().catch(() => {
        if (!closed) {
          closed = true;
          this.activeContinuousAttempt = null;
          this.scannerDiagnostic('scanner_error', { category: 'scan_sequence_failure' });
          this.continuousDiagnostic('next_scan_failed', attemptId, 'scan sequence failed');
          this.continuousDiagnostic('multi_scan_stopped', attemptId, 'scan sequence failure');
          void onOutcome({ kind: 'unavailable' });
        }
      });

      return session;
    } catch (error: unknown) {
      this.scannerDiagnostic('scanner_start_failed', { category: error instanceof Error ? 'native_start_error' : 'unknown_error' });
      closed = true;
      this.activeContinuousAttempt = null;
      this.continuousDiagnostic('next_scan_failed', attemptId, 'scanner startup failed');
      this.continuousDiagnostic('multi_scan_stopped', attemptId, 'scanner startup failure');
      await BarcodeScanner.stopScan().catch(() => undefined);
      return { kind: 'unavailable' };
    }
  }

  private scannerDiagnostic(event: string, details: Record<string, unknown> = {}): void {
    if (!environment.production) console.debug('[qr-scanner]', event, details);
  }

  recordContinuousScanDiagnostic(
    event: string,
    summary: string,
    metadata: Readonly<Record<string, PenielQrLogValue>> = {},
    attemptId?: number,
  ): void {
    if (environment.production) return;
    this.continuousDiagnostic(event, attemptId ?? this.continuousScanAttempt, summary, metadata);
  }

  private continuousDiagnostic(
    event: string,
    attemptId: number,
    summary: string,
    metadata: Readonly<Record<string, PenielQrLogValue>> = {},
  ): void {
    if (environment.production) return;
    this.continuousDiagnosticSequence += 1;
    this.continuousScanDiagnostics.update((entries) => [
      ...entries,
      { sequence: this.continuousDiagnosticSequence, attemptId, event, summary },
    ].slice(-80));
    console.debug('[qr-scanner]', event, {
      sequence: this.continuousDiagnosticSequence,
      attemptId,
      summary,
    });
    logPenielQrDiagnostic(true, event, {
      sequence: this.continuousDiagnosticSequence,
      attempt_id: attemptId,
      summary,
      ...metadata,
    });
  }

  private singleScanDiagnostic(event: string, summary: string, metadata: Readonly<Record<string, PenielQrLogValue>> = {}): void {
    if (environment.production) return;
    this.singleScanDiagnostics.update((entries) => [
      ...entries,
      { attempt: this.singleScanAttempt, event, summary },
    ].slice(-40));
    logPenielQrDiagnostic(true, event, {
      attempt_id: this.singleScanAttempt,
      elapsed_ms: this.singleScanStartedAt ? Date.now() - this.singleScanStartedAt : 0,
      ...metadata,
    });
  }
}

function analyzePenielQrCandidates(barcodes: readonly NativeQrBarcodeValue[]): {
  readonly rawValueCount: number;
  readonly displayValueCount: number;
  readonly validCandidateCount: number;
  readonly selectedIndex: number | null;
  readonly candidates: readonly {
    readonly index: number;
    readonly format: string;
    readonly rawValuePresent: boolean;
    readonly displayValuePresent: boolean;
    readonly uuidShapeValid: boolean;
    readonly raw: SafeDecodedValueMetadata;
    readonly display: SafeDecodedValueMetadata;
    readonly rawDisplayEqual: boolean | null;
  }[];
} {
  const qrIndices = barcodes.map((barcode, index) => isQrBarcode(barcode) ? index : -1).filter((index) => index >= 0);
  const untypedIndices = barcodes.map((barcode, index) => typeof barcode.format !== 'string' || !barcode.format.trim() ? index : -1).filter((index) => index >= 0);
  const candidateIndices = qrIndices.length ? qrIndices : untypedIndices;
  const validIndices = candidateIndices.filter((index) => extractPenielQrPayload(barcodes[index]) !== null);
  const candidates = barcodes.map((barcode, index) => ({
    index,
    format: safeBarcodeFormat(barcode.format),
    rawValuePresent: typeof barcode.rawValue === 'string',
    displayValuePresent: typeof barcode.displayValue === 'string',
    uuidShapeValid: extractPenielQrPayload(barcode) !== null,
    raw: inspectDecodedValue(barcode.rawValue),
    display: inspectDecodedValue(barcode.displayValue),
    rawDisplayEqual: typeof barcode.rawValue === 'string' && typeof barcode.displayValue === 'string'
      ? barcode.rawValue === barcode.displayValue
      : null,
  }));
  return {
    rawValueCount: barcodes.filter((barcode) => typeof barcode.rawValue === 'string').length,
    displayValueCount: barcodes.filter((barcode) => typeof barcode.displayValue === 'string').length,
    validCandidateCount: validIndices.length,
    selectedIndex: validIndices[0] ?? null,
    candidates,
  };
}

function safeBarcodeFormat(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'UNDECLARED';
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 32) || 'UNDECLARED';
}
