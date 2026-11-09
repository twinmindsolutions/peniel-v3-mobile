import { Injectable } from '@angular/core';
import { AttendanceMemberLookup } from './attendance.models';

export type AttendanceCheckInSource = 'manual' | 'qr';

export interface AttendanceCheckInQueueItem {
  readonly idempotencyKey: string;
  readonly memberId: string;
  readonly membershipNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly source: AttendanceCheckInSource;
}

/**
 * In-memory selection queue for one authenticated user/session context.
 * Confirmed offline attendance is intentionally not supported by the current
 * mobile synchronization infrastructure.
 */
@Injectable({ providedIn: 'root' })
export class AttendanceCheckInQueueService {
  private contextKey = '';
  private itemsByMember = new Map<string, AttendanceCheckInQueueItem>();

  setContext(userId: string, organizationId: string, branchId: string, sessionId: string): void {
    const key = `${userId}:${organizationId}:${branchId}:${sessionId}`;
    if (key !== this.contextKey) {
      this.contextKey = key;
      this.itemsByMember.clear();
    }
  }

  items(): readonly AttendanceCheckInQueueItem[] {
    return [...this.itemsByMember.values()];
  }

  has(memberId: string): boolean {
    return this.itemsByMember.has(memberId);
  }

  addManual(member: AttendanceMemberLookup): void {
    if (this.itemsByMember.has(member.id)) return;
    this.itemsByMember.set(member.id, {
      idempotencyKey: crypto.randomUUID(),
      memberId: member.id,
      membershipNumber: member.membership_number,
      firstName: member.first_name,
      lastName: member.last_name,
      source: 'manual',
    });
  }

  remove(memberId: string): void {
    this.itemsByMember.delete(memberId);
  }

  clear(): void {
    this.itemsByMember.clear();
  }
}
