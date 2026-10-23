export type AttendanceSessionStatus = 'scheduled' | 'open' | 'closed' | 'cancelled' | string;

export interface AttendanceSessionBranch {
  readonly id: string;
  readonly name: string;
}

export interface AttendanceSessionServiceType {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface AttendanceSessionGroup {
  readonly id: string;
  readonly name: string;
}

export interface AttendanceSession {
  readonly id: string;
  readonly organization: string;
  readonly branch: AttendanceSessionBranch;
  readonly service_type: AttendanceSessionServiceType;
  readonly group: AttendanceSessionGroup | null;
  readonly source: string;
  readonly recurring_schedule: string | null;
  readonly local_occurrence_date: string;
  readonly scheduled_start: string;
  readonly scheduled_end: string;
  readonly timezone: string;
  readonly service_type_name_snapshot: string;
  readonly service_type_resets_absence_timer_snapshot: boolean;
  readonly closure_after_hours_snapshot: number;
  readonly schedule_revision_snapshot: number | null;
  readonly is_customized: boolean;
  readonly status: AttendanceSessionStatus;
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AttendanceSessionListResponse {
  readonly count: number;
  readonly results: readonly AttendanceSession[];
}

export interface AttendanceRecordingStaffSummary {
  readonly user_id: string;
  readonly display_name: string;
  readonly check_in_count: number;
}

export interface AttendanceSessionSummary {
  readonly registered_member_check_in_count: number;
  readonly recording_staff_count: number;
  readonly recording_staff: readonly AttendanceRecordingStaffSummary[];
}

export interface AttendanceMemberLookup {
  readonly id: string;
  readonly membership_number: string;
  readonly first_name: string;
  readonly last_name: string;
}

export type AttendanceCheckInOutcome = 'checked_in' | 'already_checked_in';

export interface AttendanceCheckInResponse {
  readonly outcome: AttendanceCheckInOutcome;
  readonly record_id: string;
  readonly member_id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly checked_in_at: string;
  readonly method: 'manual' | 'qr';
  readonly recorded_by_id: string;
  readonly recorded_by_display_name: string;
}
