import { AttendanceCheckInQueueService } from './attendance-check-in-queue.service';

describe('AttendanceCheckInQueueService', () => {
  const member = { id: 'member-1', membership_number: 'P-001', first_name: 'Ada', last_name: 'Lovelace' };

  it('deduplicates members and isolates queue context', () => {
    const queue = new AttendanceCheckInQueueService();
    queue.setContext('user-1', 'org-1', 'branch-1', 'session-1');
    queue.addManual(member);
    queue.addManual(member);
    expect(queue.items()).toHaveLength(1);
    expect(queue.has('member-1')).toBe(true);
    queue.setContext('user-1', 'org-1', 'branch-1', 'session-2');
    expect(queue.items()).toHaveLength(0);
  });

  it('removes selected members without affecting other queue entries', () => {
    const queue = new AttendanceCheckInQueueService();
    queue.setContext('user-1', 'org-1', 'branch-1', 'session-1');
    queue.addManual(member);
    queue.addManual({ ...member, id: 'member-2', membership_number: 'P-002' });
    queue.remove('member-1');
    expect(queue.items().map((item) => item.memberId)).toEqual(['member-2']);
  });
});
