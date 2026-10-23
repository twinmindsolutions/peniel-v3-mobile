import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from '../config/api-config.service';
import {
  AttendanceCapabilities,
  BranchContext,
  OrganizationContext,
} from './workspace.models';

@Injectable({ providedIn: 'root' })
export class WorkspaceApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ApiConfigService);

  getOrganizations(): Observable<OrganizationContext[]> {
    return this.http.get<OrganizationContext[]>(this.url('/organizations/'));
  }

  getBranches(organizationId: string): Observable<BranchContext[]> {
    return this.http.get<BranchContext[]>(
      this.url(`/organizations/${encodeURIComponent(organizationId)}/branches/`),
    );
  }

  getAttendanceCapabilities(organizationId: string): Observable<AttendanceCapabilities> {
    return this.http.get<AttendanceCapabilities>(
      this.url(`/organizations/${encodeURIComponent(organizationId)}/attendance/capabilities/`),
    );
  }

  private url(path: string): string {
    return `${this.config.configuration.baseUrl.replace(/\/$/, '')}${path}`;
  }
}
