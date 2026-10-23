import { computed, inject, Injectable } from '@angular/core';
import { WorkspaceStateService } from '../workspace/workspace-state.service';
import { AttendanceAdHocScope, AttendanceCapabilities } from '../workspace/workspace.models';

export type AttendancePermission =
  | 'view_attendance'
  | 'create_ad_hoc_session'
  | 'manage_attendance_sessions'
  | 'manage_recurring_schedules'
  | 'generate_annual_sessions'
  | 'manage_attendance_settings'
  | 'manage_service_types'
  | 'manage_organization_service_types';

/**
 * Derives conservative UI permission state from the current validated workspace.
 * The backend remains authoritative for every protected operation.
 */
@Injectable({ providedIn: 'root' })
export class AttendancePermissionService {
  private readonly workspace = inject(WorkspaceStateService);

  readonly capabilities = computed<AttendanceCapabilities | null>(() => {
    const capabilities = this.workspace.attendanceCapabilities();
    const organizationId = this.workspace.selectedOrganizationId();
    return capabilities && organizationId && capabilities.organization_id === organizationId
      ? capabilities
      : null;
  });

  readonly resolved = computed(() => {
    const branch = this.workspace.selectedBranch();
    const organizationId = this.workspace.selectedOrganizationId();
    return this.workspace.usableWorkspaceResolved()
      && organizationId !== null
      && branch !== null
      && branch.organization === organizationId
      && this.workspace.authorizationVerified()
      && this.capabilities() !== null;
  });

  readonly canViewAttendance = computed(() => this.hasBranchCapability('can_view_attendance', 'view_branch_ids'));
  readonly canCreateAdHocSession = computed(() => this.hasAdHocScopeForBranch());
  readonly canManageAttendanceSessions = computed(() => this.hasBranchCapability(
    'can_manage_attendance_sessions',
    'session_management_branch_ids',
  ));
  readonly canManageRecurringSchedules = computed(() => this.hasBranchCapability(
    'can_manage_recurring_schedules',
    'recurring_schedule_management_branch_ids',
  ));
  readonly canGenerateAnnualSessions = computed(() => this.hasBranchCapability(
    'can_generate_annual_sessions',
    'session_management_branch_ids',
  ));
  readonly canManageAttendanceSettings = computed(() => this.hasBranchCapability(
    'can_manage_attendance_settings',
    'session_management_branch_ids',
  ));
  readonly canManageServiceTypes = computed(() => this.hasBranchCapability(
    'can_manage_service_types',
    'service_type_management_branch_ids',
  ));
  readonly canManageOrganizationServiceTypes = computed(() => this.isReady() && Boolean(
    this.capabilities()?.can_manage_organization_service_types,
  ));

  readonly currentAdHocScope = computed<AttendanceAdHocScope | null>(() => {
    if (!this.isReady()) return null;
    const branchId = this.workspace.selectedBranchId();
    return this.capabilities()?.ad_hoc_scopes.find((scope) => scope.branch_id === branchId) ?? null;
  });

  hasPermission(permission: AttendancePermission): boolean {
    switch (permission) {
      case 'view_attendance': return this.canViewAttendance();
      case 'create_ad_hoc_session': return this.canCreateAdHocSession();
      case 'manage_attendance_sessions': return this.canManageAttendanceSessions();
      case 'manage_recurring_schedules': return this.canManageRecurringSchedules();
      case 'generate_annual_sessions': return this.canGenerateAnnualSessions();
      case 'manage_attendance_settings': return this.canManageAttendanceSettings();
      case 'manage_service_types': return this.canManageServiceTypes();
      case 'manage_organization_service_types': return this.canManageOrganizationServiceTypes();
    }
  }

  canViewAttendanceInBranch(branchId: string): boolean {
    return this.hasBranchCapability('can_view_attendance', 'view_branch_ids', branchId);
  }

  canCreateAdHocSessionInBranch(branchId: string): boolean {
    return this.adHocScopeForBranch(branchId) !== null;
  }

  canCreateAdHocSessionForGroup(groupId: string, branchId = this.workspace.selectedBranchId()): boolean {
    if (!this.isReady() || !this.capabilities()?.can_create_ad_hoc_session) return false;
    const scope = branchId ? this.adHocScopeForBranch(branchId) : null;
    if (!scope) return false;
    if (scope.group_scope === 'all_compatible_groups') return true;
    return scope.group_scope === 'selected_groups' && scope.group_ids.includes(groupId);
  }

  private hasBranchCapability(
    capability: keyof Pick<AttendanceCapabilities,
      'can_view_attendance'
      | 'can_manage_attendance_sessions'
      | 'can_manage_recurring_schedules'
      | 'can_generate_annual_sessions'
      | 'can_manage_attendance_settings'
      | 'can_manage_service_types'>,
    branches: keyof Pick<AttendanceCapabilities,
      'view_branch_ids'
      | 'session_management_branch_ids'
      | 'recurring_schedule_management_branch_ids'
      | 'service_type_management_branch_ids'>,
    branchId = this.workspace.selectedBranchId(),
  ): boolean {
    return this.isReady()
      && Boolean(this.capabilities()?.[capability])
      && branchId !== null
      && this.workspace.branches().some((branch) => (
        branch.id === branchId && branch.organization === this.workspace.selectedOrganizationId()
      ))
      && (this.capabilities()?.[branches] ?? []).includes(branchId);
  }

  private hasAdHocScopeForBranch(): boolean {
    return this.isReady()
      && Boolean(this.capabilities()?.can_create_ad_hoc_session)
      && this.adHocScopeForBranch(this.workspace.selectedBranchId()) !== null;
  }

  private adHocScopeForBranch(branchId: string | null): AttendanceAdHocScope | null {
    if (!this.isReady() || !branchId) return null;
    const branch = this.workspace.branches().find((item) => item.id === branchId);
    if (!branch || branch.organization !== this.workspace.selectedOrganizationId()) return null;
    return this.capabilities()?.ad_hoc_scopes.find((scope) => scope.branch_id === branchId) ?? null;
  }

  private isReady(): boolean {
    return this.resolved() && this.capabilities() !== null;
  }
}
