import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AttendancePermissionService } from './attendance-permission.service';
import { WorkspaceStateService } from '../workspace/workspace-state.service';
import { AttendanceCapabilities } from '../workspace/workspace.models';

describe('AttendancePermissionService', () => {
  const organizationId = signal<string | null>('org-1');
  const branchId = signal<string | null>('branch-1');
  const selectedBranch = signal<{ id: string; organization: string } | null>({ id: 'branch-1', organization: 'org-1' });
  const branches = signal<readonly { id: string; organization: string }[]>([{ id: 'branch-1', organization: 'org-1' }]);
  const resolved = signal(true);
  const authorizationVerified = signal(true);
  const capabilities = signal<AttendanceCapabilities | null>(null);
  const fullCapabilities: AttendanceCapabilities = {
    organization_id: 'org-1',
    can_view_attendance: true,
    can_create_ad_hoc_session: true,
    can_manage_attendance_sessions: true,
    can_manage_recurring_schedules: false,
    can_generate_annual_sessions: false,
    can_manage_attendance_settings: false,
    can_manage_service_types: true,
    can_manage_organization_service_types: true,
    view_branch_ids: ['branch-1'],
    session_management_branch_ids: ['branch-1'],
    recurring_schedule_management_branch_ids: [],
    service_type_management_branch_ids: ['branch-1'],
    ad_hoc_scopes: [{ branch_id: 'branch-1', group_scope: 'selected_groups', group_ids: ['group-1'] }],
  };

  beforeEach(() => {
    organizationId.set('org-1');
    branchId.set('branch-1');
    selectedBranch.set({ id: 'branch-1', organization: 'org-1' });
    branches.set([{ id: 'branch-1', organization: 'org-1' }]);
    resolved.set(true);
    authorizationVerified.set(true);
    capabilities.set(fullCapabilities);
    TestBed.configureTestingModule({
      providers: [
        AttendancePermissionService,
        {
          provide: WorkspaceStateService,
          useValue: { selectedOrganizationId: organizationId, selectedBranchId: branchId, selectedBranch, branches,
            usableWorkspaceResolved: resolved, authorizationVerified, attendanceCapabilities: capabilities },
        },
      ],
    });
  });

  it('maps resolved backend capabilities and branch scope', () => {
    const service = TestBed.inject(AttendancePermissionService);
    expect(service.canViewAttendance()).toBe(true);
    expect(service.canManageAttendanceSessions()).toBe(true);
    expect(service.canManageRecurringSchedules()).toBe(false);
    expect(service.canManageServiceTypes()).toBe(true);
    expect(service.canManageOrganizationServiceTypes()).toBe(true);
  });

  it('enforces selected group scope for ad-hoc sessions', () => {
    const service = TestBed.inject(AttendancePermissionService);
    expect(service.canCreateAdHocSession()).toBe(true);
    expect(service.canCreateAdHocSessionForGroup('group-1')).toBe(true);
    expect(service.canCreateAdHocSessionForGroup('group-2')).toBe(false);
  });

  it('treats all-compatible scope as explicit unrestricted group scope', () => {
    capabilities.set({ ...fullCapabilities, ad_hoc_scopes: [{ branch_id: 'branch-1', group_scope: 'all_compatible_groups', group_ids: [] }] });
    const service = TestBed.inject(AttendancePermissionService);
    expect(service.canCreateAdHocSessionForGroup('group-2')).toBe(true);
  });

  it('denies when capabilities are missing, stale, or the branch is outside scope', () => {
    const service = TestBed.inject(AttendancePermissionService);
    capabilities.set(null);
    expect(service.canViewAttendance()).toBe(false);
    capabilities.set({ ...fullCapabilities, organization_id: 'org-2' });
    expect(service.canViewAttendance()).toBe(false);
    capabilities.set({ ...fullCapabilities, organization_id: 'org-1', view_branch_ids: ['other-branch'] });
    expect(service.canViewAttendance()).toBe(false);
  });

  it('immediately denies after organization, branch, or session state is cleared', () => {
    const service = TestBed.inject(AttendancePermissionService);
    expect(service.canViewAttendance()).toBe(true);
    organizationId.set(null);
    branchId.set(null);
    selectedBranch.set(null);
    resolved.set(false);
    expect(service.canViewAttendance()).toBe(false);
    expect(service.canCreateAdHocSessionForGroup('group-1')).toBe(false);
  });
});
