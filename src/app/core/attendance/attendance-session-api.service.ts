import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from '../config/api-config.service';
import { AttendanceCheckInResponse, AttendanceMemberLookup, AttendanceSession, AttendanceSessionListResponse, AttendanceSessionSummary } from './attendance.models';

@Injectable({ providedIn: 'root' })
export class AttendanceSessionApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ApiConfigService);

  getSessions(organizationId: string): Observable<AttendanceSessionListResponse> {
    return this.http.get<AttendanceSessionListResponse>(this.url(
      `/organizations/${encodeURIComponent(organizationId)}/attendance/sessions/`,
    ));
  }

  getSession(organizationId: string, sessionId: string): Observable<AttendanceSession> {
    return this.http.get<AttendanceSession>(this.url(
      `/organizations/${encodeURIComponent(organizationId)}/attendance/sessions/${encodeURIComponent(sessionId)}/`,
    ));
  }

  getAttendanceSummary(organizationId: string, sessionId: string): Observable<AttendanceSessionSummary> {
    return this.http.get<AttendanceSessionSummary>(this.url(
      `/organizations/${encodeURIComponent(organizationId)}/attendance/sessions/${encodeURIComponent(sessionId)}/attendance-summary/`,
    ));
  }

  searchMembers(organizationId: string, sessionId: string, search = ''): Observable<{ readonly results: readonly AttendanceMemberLookup[] }> {
    const params = search.trim() ? new HttpParams().set('search', search.trim()) : undefined;
    return this.http.get<{ readonly results: readonly AttendanceMemberLookup[] }>(this.url(
      `/organizations/${encodeURIComponent(organizationId)}/attendance/sessions/${encodeURIComponent(sessionId)}/members/`,
    ), { params });
  }

  recordManualCheckIn(organizationId: string, sessionId: string, memberId: string): Observable<AttendanceCheckInResponse> {
    return this.http.post<AttendanceCheckInResponse>(this.url(
      `/organizations/${encodeURIComponent(organizationId)}/attendance/sessions/${encodeURIComponent(sessionId)}/check-in/manual/`,
    ), { member_id: memberId });
  }

  private url(path: string): string {
    return `${this.config.configuration.baseUrl.replace(/\/$/, '')}${path}`;
  }
}
