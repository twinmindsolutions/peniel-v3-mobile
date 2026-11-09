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

  it('requests member-search pages and preserves pagination metadata', () => {
    service.searchMembers('org', 'session', '', 2, 3).subscribe((response) => {
      expect(response.count).toBe(28);
      expect(response.next).toBe(null);
      expect(response.results).toHaveLength(3);
    });
    const request = http.expectOne((item) => item.url.endsWith('/members/'));
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('page_size')).toBe('3');
    request.flush({ count: 28, next: null, previous: 1, results: [
      { id: 'member-1', membership_number: 'ABC', first_name: 'Ada', last_name: 'Lovelace' },
      { id: 'member-2', membership_number: 'DEF', first_name: 'Grace', last_name: 'Hopper' },
      { id: 'member-3', membership_number: 'GHI', first_name: 'Katherine', last_name: 'Johnson' },
    ] });
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

  it('submits bounded bulk manual check-ins with stable item keys', () => {
    service.recordBulkManualCheckIn('org', 'session', [
      { idempotency_key: 'key-1', member_id: 'member-1', method: 'manual' },
    ]).subscribe((response) => expect(response.results[0].status).toBe('checked_in'));
    const request = http.expectOne('/api/v1/organizations/org/attendance/sessions/session/check-in/bulk/');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ items: [
      { idempotency_key: 'key-1', member_id: 'member-1', method: 'manual' },
    ] });
    request.flush({ results: [{ idempotency_key: 'key-1', member_id: 'member-1', status: 'checked_in' }] });
  });
});
