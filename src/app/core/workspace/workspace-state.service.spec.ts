import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { WorkspaceApiService } from './workspace-api.service';
import { WorkspaceStateService } from './workspace-state.service';
import { AttendanceCapabilities, BranchContext, OrganizationCapabilities, OrganizationContext } from './workspace.models';

describe('WorkspaceStateService', () => {
  const capabilities: OrganizationCapabilities = {
    can_manage_organization: true, can_manage_branches: true, can_manage_onboarding: true,
    can_manage_staff: true, can_invite_users: true, can_manage_access: true,
    can_view_staff: true, can_view_groups: true, can_manage_groups: true,
    can_view_members: true, can_create_members: true, can_update_members: true,
    can_manage_member_branches: true, can_manage_member_groups: true,
    can_archive_members: true, can_view_member_history: true,
  };
  const organization: OrganizationContext = {
    id: 'org-1', name: 'Peniel Church', slug: 'peniel-church', timezone: 'Europe/London', capabilities,
    email: '', telephone: '', website: '', address_line_1: '', address_line_2: '', city: '',
    state_region: '', postal_code: '', country: '',
  };
  const organizationTwo: OrganizationContext = { ...organization, id: 'org-2', name: 'Second Church' };
  const branch: BranchContext = {
    id: 'branch-1', organization: 'org-1', name: 'Central', slug: 'central', timezone: 'Europe/London',
    email: '', telephone: '', address_line_1: '', address_line_2: '', city: '', state_region: '',
    postal_code: '', country: '',
  };
  const attendanceCapabilities: AttendanceCapabilities = {
    organization_id: 'org-1', can_view_attendance: true, can_create_ad_hoc_session: true,
    can_manage_attendance_sessions: false, can_manage_recurring_schedules: false,
    can_generate_annual_sessions: false, can_manage_attendance_settings: false,
    can_manage_service_types: false, can_manage_organization_service_types: false,
    view_branch_ids: ['branch-1'], session_management_branch_ids: [],
    recurring_schedule_management_branch_ids: [], service_type_management_branch_ids: [], ad_hoc_scopes: [],
  };
  let api: {
    getOrganizations: ReturnType<typeof vi.fn>;
    getBranches: ReturnType<typeof vi.fn>;
    getAttendanceCapabilities: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = { getOrganizations: vi.fn(), getBranches: vi.fn(), getAttendanceCapabilities: vi.fn() };
    TestBed.configureTestingModule({
      providers: [WorkspaceStateService, { provide: WorkspaceApiService, useValue: api }],
    });
  });

  it('auto-resolves a single organization and branch with capabilities', async () => {
    api.getOrganizations.mockReturnValue(of([organization]));
    api.getBranches.mockReturnValue(of([branch]));
    api.getAttendanceCapabilities.mockReturnValue(of(attendanceCapabilities));
    const service = TestBed.inject(WorkspaceStateService);

    await service.loadAuthorizedOrganizations();

    expect(service.selectedOrganizationId()).toBe('org-1');
    expect(service.selectedBranchId()).toBe('branch-1');
    expect(service.usableWorkspaceResolved()).toBe(true);
    expect(service.organizationSelectionRequired()).toBe(false);
    expect(service.branchSelectionRequired()).toBe(false);
  });

  it('keeps multiple organizations unresolved until explicitly selected', async () => {
    api.getOrganizations.mockReturnValue(of([organization, organizationTwo]));
    const service = TestBed.inject(WorkspaceStateService);

    await service.loadAuthorizedOrganizations();

    expect(service.organizationSelectionRequired()).toBe(true);
    expect(service.selectedOrganizationId()).toBeNull();
    expect(api.getBranches).not.toHaveBeenCalled();
  });

  it('clears the previous branch and capabilities when organizations switch', async () => {
    api.getOrganizations.mockReturnValue(of([organization, organizationTwo]));
    api.getBranches.mockReturnValue(of([branch]));
    api.getAttendanceCapabilities.mockReturnValue(of(attendanceCapabilities));
    const service = TestBed.inject(WorkspaceStateService);
    await service.loadAuthorizedOrganizations();
    await service.selectOrganization('org-1');

    expect(service.selectedBranchId()).toBe('branch-1');
    await service.selectOrganization('org-2');

    expect(service.selectedBranchId()).toBeNull();
    expect(service.attendanceCapabilities()).toBeNull();
  });

  it('rejects organization and branch IDs outside current authorized collections', () => {
    const service = TestBed.inject(WorkspaceStateService);

    expect(() => service.selectOrganization('unknown')).toThrow('not authorized');
    expect(() => service.selectBranch('unknown')).toThrow('not authorized');
  });

  it('records authorization failures without converting them into empty success', async () => {
    const failure = new HttpErrorResponse({ status: 403, statusText: 'Forbidden' });
    api.getOrganizations.mockReturnValue(throwError(() => failure));
    const service = TestBed.inject(WorkspaceStateService);

    await expect(service.loadAuthorizedOrganizations()).rejects.toBe(failure);
    expect(service.organizations()).toEqual([]);
    expect(service.error()).toEqual({ status: 403, message: 'This workspace is no longer available.' });
  });

  it('ignores a late branch response after a newer organization selection', async () => {
    const firstBranches = new Subject<BranchContext[]>();
    api.getOrganizations.mockReturnValue(of([organization, organizationTwo]));
    api.getBranches.mockReturnValueOnce(firstBranches.asObservable()).mockReturnValueOnce(of([]));
    const service = TestBed.inject(WorkspaceStateService);
    await service.loadAuthorizedOrganizations();

    const firstSelection = service.selectOrganization('org-1');
    const secondSelection = service.selectOrganization('org-2');
    firstBranches.next([branch]);
    firstBranches.complete();
    await Promise.all([firstSelection, secondSelection]);

    expect(service.selectedOrganizationId()).toBe('org-2');
    expect(service.branches()).toEqual([]);
    expect(service.selectedBranchId()).toBeNull();
  });

  it('clears all state on session invalidation', () => {
    const service = TestBed.inject(WorkspaceStateService);
    service.clear();

    expect(service.organizations()).toEqual([]);
    expect(service.branches()).toEqual([]);
    expect(service.selectedOrganizationId()).toBeNull();
    expect(service.selectedBranchId()).toBeNull();
    expect(service.attendanceCapabilities()).toBeNull();
    expect(service.error()).toBeNull();
  });
});
