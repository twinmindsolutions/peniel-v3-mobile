import { environment } from '../../../environments/environment';
import { logPenielQrDiagnostic } from './qr-diagnostic-logger';

describe('logPenielQrDiagnostic', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes a searchable structured record with sanitized metadata when enabled', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    logPenielQrDiagnostic(true, 'single_scan_payload_invalid', {
      attempt_id: 3,
      candidate_index: null,
      uuid_shape_valid: false,
      rejection_category: 'no_valid_peniel_uuid',
    });

    expect(debug).toHaveBeenCalledWith('[peniel-qr]', expect.stringContaining('"event":"single_scan_payload_invalid"'));
    expect(debug).toHaveBeenCalledWith('[peniel-qr]', expect.not.stringContaining('raw-qr-value'));
  });

  it('does not write diagnostic records in production', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const originalProduction = environment.production;
    environment.production = true;

    try {
      logPenielQrDiagnostic(true, 'single_scan_started', { attempt_id: 1 });
      expect(debug).not.toHaveBeenCalled();
    } finally {
      environment.production = originalProduction;
    }
  });
});
