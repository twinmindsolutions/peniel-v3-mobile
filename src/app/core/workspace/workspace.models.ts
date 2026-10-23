export interface OrganizationCapabilities {
  readonly can_manage_organization: boolean;
  readonly can_manage_branches: boolean;
  readonly can_manage_onboarding: boolean;
  readonly can_manage_staff: boolean;
  readonly can_invite_users: boolean;
  readonly can_manage_access: boolean;
  readonly can_view_staff: boolean;
  readonly can_view_groups: boolean;
  readonly can_manage_groups: boolean;
  readonly can_view_members: boolean;
  readonly can_create_members: boolean;
  readonly can_update_members: boolean;
  readonly can_manage_member_branches: boolean;
  readonly can_manage_member_groups: boolean;
  readonly can_archive_members: boolean;
  readonly can_view_member_history: boolean;
}

export interface OrganizationContext {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly timezone: string;
  readonly capabilities: OrganizationCapabilities;
  readonly email: string;
  readonly telephone: string;
  readonly website: string;
  readonly address_line_1: string;
  readonly address_line_2: string;
  readonly city: string;
  readonly state_region: string;
  readonly postal_code: string;
  readonly country: string;
}

export interface BranchContext {
  readonly id: string;
  readonly organization: string;
  readonly name: string;
  readonly slug: string;
  readonly timezone: string;
  readonly email: string;
  readonly telephone: string;
  readonly address_line_1: string;
  readonly address_line_2: string;
  readonly city: string;
  readonly state_region: string;
  readonly postal_code: string;
  readonly country: string;
}

export type AttendanceGroupScope = 'all_compatible_groups' | 'selected_groups';

export interface AttendanceAdHocScope {
  readonly branch_id: string;
  readonly group_scope: AttendanceGroupScope;
  readonly group_ids: readonly string[];
}

export interface AttendanceCapabilities {
  readonly organization_id: string;
  readonly can_view_attendance: boolean;
  readonly can_create_ad_hoc_session: boolean;
  readonly can_manage_attendance_sessions: boolean;
  readonly can_manage_recurring_schedules: boolean;
  readonly can_generate_annual_sessions: boolean;
  readonly can_manage_attendance_settings: boolean;
  readonly can_manage_service_types: boolean;
  readonly can_manage_organization_service_types: boolean;
  readonly view_branch_ids: readonly string[];
  readonly session_management_branch_ids: readonly string[];
  readonly recurring_schedule_management_branch_ids: readonly string[];
  readonly service_type_management_branch_ids: readonly string[];
  readonly ad_hoc_scopes: readonly AttendanceAdHocScope[];
}
