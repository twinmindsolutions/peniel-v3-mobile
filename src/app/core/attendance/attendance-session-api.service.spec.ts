import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AttendanceSessionApiService } from './attendance-session-api.service';
import { ApiConfigService } from '../config/api-config.service';

describe('AttendanceSessionApiService', () => {
  let service: AttendanceSessionApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AttendanceSessionApiService,
        ApiConfigService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AttendanceSessionApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the typed session collection contract', () => {
    service.getSessions('org/one').subscribe((response) => expect(response.count).toBe(1));
    const request = http.expectOne((item) => item.url.includes('/organizations/org%2Fone/attendance/sessions/'));
    expect(request.request.method).toBe('GET');
    request.flush({ count: 1, results: [] });
  });

  it('builds detail and summary URLs', () => {
    service.getSession('org', 'session').subscribe();
    expect(http.expectOne('/api/v1/organizations/org/attendance/sessions/session/').request.method).toBe('GET');
    service.getAttendanceSummary('org', 'session').subscribe();
    expect(http.expectOne('/api/v1/organizations/org/attendance/sessions/session/attendance-summary/').request.method).toBe('GET');
  });

  it('uses server-backed member search and manual check-in contracts', () => {
    service.searchMembers('org', 'session', 'Ada Lovelace').subscribe((response) => expect(response.results).toHaveLength(1));
    const search = http.expectOne((item) => item.url.endsWith('/members/') && item.params.get('search') === 'Ada Lovelace');
    expect(search.request.method).toBe('GET');
    search.flush({ results: [{ id: 'member', membership_number: 'ABC', first_name: 'Ada', last_name: 'Lovelace' }] });

    service.recordManualCheckIn('org', 'session', 'member').subscribe((response) => expect(response.outcome).toBe('already_checked_in'));
    const checkIn = http.expectOne('/api/v1/organizations/org/attendance/sessions/session/check-in/manual/');
    expect(checkIn.request.body).toEqual({ member_id: 'member' });
    checkIn.flush({ outcome: 'already_checked_in' });
  });

  it('uses the QR preview and recording contracts without transforming responses', () => {
    service.previewQrCheckIn('org', 'session', 'qr-id').subscribe((response) => expect(response.attendance_status).toBe('not_checked_in'));
    const preview = http.expectOne('/api/v1/organizations/org/attendance/sessions/session/check-in/qr/preview/');
    expect(preview.request.method).toBe('POST');
    expect(preview.request.body).toEqual({ qr_identifier: 'qr-id' });
    preview.flush({
      member_id: 'member', display_name: 'Ada Lovelace', membership_number: 'ABC',
      session_id: 'session', attendance_status: 'not_checked_in',
    });

    service.recordQrCheckIn('org', 'session', 'qr-id').subscribe((response) => expect(response.outcome).toBe('already_checked_in'));
    const recording = http.expectOne('/api/v1/organizations/org/attendance/sessions/session/check-in/qr/');
    expect(recording.request.method).toBe('POST');
    expect(recording.request.body).toEqual({ qr_identifier: 'qr-id' });
    recording.flush({ outcome: 'already_checked_in' });
  });
});
