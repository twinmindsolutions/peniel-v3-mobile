import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from '../config/api-config.service';
import { WorkspaceApiService } from './workspace-api.service';
import { AttendanceCapabilities, BranchContext, OrganizationContext } from './workspace.models';

describe('WorkspaceApiService', () => {
  let service: WorkspaceApiService;
  let controller: HttpTestingController;
  const baseUrl = 'https://api.test/api/v1';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WorkspaceApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ApiConfigService, useValue: { configuration: { baseUrl } } },
      ],
    });
    service = TestBed.inject(WorkspaceApiService);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('retrieves the array-shaped organization context response', async () => {
    const organizations: OrganizationContext[] = [
      {
        id: 'org-1', name: 'Peniel Church', slug: 'peniel-church', timezone: 'Europe/London',
        capabilities: {
          can_manage_organization: true, can_manage_branches: true, can_manage_onboarding: true,
          can_manage_staff: true, can_invite_users: true, can_manage_access: true,
          can_view_staff: true, can_view_groups: true, can_manage_groups: true,
          can_view_members: true, can_create_members: true, can_update_members: true,
          can_manage_member_branches: true, can_manage_member_groups: true,
          can_archive_members: true, can_view_member_history: true,
        },
        email: '', telephone: '', website: '', address_line_1: '', address_line_2: '',
        city: '', state_region: '', postal_code: '', country: '',
      },
    ];
    const result = firstValueFrom(service.getOrganizations());
    const request = controller.expectOne(`${baseUrl}/organizations/`);
    expect(request.request.method).toBe('GET');
    request.flush(organizations);
    await expect(result).resolves.toEqual(organizations);
  });

  it('encodes the organization ID when retrieving branches', async () => {
    const branches: BranchContext[] = [];
    const result = firstValueFrom(service.getBranches('org/with-special-value'));
    const request = controller.expectOne(`${baseUrl}/organizations/org%2Fwith-special-value/branches/`);
    expect(request.request.method).toBe('GET');
    request.flush(branches);
    await expect(result).resolves.toEqual(branches);
  });

  it('retrieves attendance capabilities with group-scoped ad hoc data', async () => {
    const capabilities: AttendanceCapabilities = {
      organization_id: 'org-1', can_view_attendance: true, can_create_ad_hoc_session: true,
      can_manage_attendance_sessions: false, can_manage_recurring_schedules: false,
      can_generate_annual_sessions: false, can_manage_attendance_settings: false,
      can_manage_service_types: false, can_manage_organization_service_types: false,
      view_branch_ids: ['branch-1'], session_management_branch_ids: [],
      recurring_schedule_management_branch_ids: [], service_type_management_branch_ids: [],
      ad_hoc_scopes: [{ branch_id: 'branch-1', group_scope: 'selected_groups', group_ids: ['group-1'] }],
    };
    const result = firstValueFrom(service.getAttendanceCapabilities('org-1'));
    const request = controller.expectOne(`${baseUrl}/organizations/org-1/attendance/capabilities/`);
    request.flush(capabilities);
    await expect(result).resolves.toEqual(capabilities);
  });

  it('propagates authorization errors instead of converting them to empty results', async () => {
    const result = firstValueFrom(service.getBranches('org-1'));
    const request = controller.expectOne(`${baseUrl}/organizations/org-1/branches/`);
    request.flush({ detail: 'Not available.' }, { status: 403, statusText: 'Forbidden' });
    await expect(result).rejects.toBeInstanceOf(HttpErrorResponse);
  });
});
