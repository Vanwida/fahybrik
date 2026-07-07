// Unit tests for the T-24h videollamada reminder cron (lib/citas/reminder.ts).
//
// Driven with a fake tagged-template `sql` that records queries and returns scripted
// rows (same pattern as tests/cron/cron-jobs.test.ts), plus an injected `sendReminder`
// so the suite never touches Resend or the network. No real DB → runs WITHOUT migration
// 0095 applied.

import { describe, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/db';
import { sendDueCitaReminders } from '@/lib/citas/reminder';

type Call = { raw: string; values: unknown[] };

function makeFakeSql(scripted: Array<unknown[]>): { sql: Sql; calls: Call[] } {
  const calls: Call[] = [];
  let cursor = 0;
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    calls.push({ raw: strings.join('?'), values });
    return Promise.resolve(scripted[cursor++] ?? []);
  };
  return { sql: tag as unknown as Sql, calls };
}

const NOW = new Date('2026-07-14T09:00:00Z');
const CANDIDATE = {
  id: '1',
  requested_start: new Date('2026-07-15T09:00:00Z'), // exactly 24h ahead
  meet_link: null,
  lead_email: 'lead@example.com',
  lead_nombre: 'Ana Ruiz',
};

describe('sendDueCitaReminders', () => {
  it('accepted + in-window + not-reminded → sent and stamped', async () => {
    // scan → 1 candidate; claim → wins the row.
    const { sql, calls } = makeFakeSql([[CANDIDATE], [{ id: '1' }]]);
    const sendReminder = vi.fn().mockResolvedValue({ sent: true });

    const result = await sendDueCitaReminders({ now: NOW, client: sql, sendReminder });

    expect(result).toMatchObject({ candidates: 1, sent: 1, skipped: 0, failed: 0 });
    // The claim is the idempotency stamp: flips reminder_sent_at from null → now().
    expect(calls[1]!.raw).toMatch(/update appointments set reminder_sent_at = now\(\)/i);
    expect(calls[1]!.raw).toMatch(/reminder_sent_at is null/i);
    expect(calls[1]!.raw).toMatch(/returning/i);
    // Emailed exactly once with the right lead + start.
    expect(sendReminder).toHaveBeenCalledTimes(1);
    expect(sendReminder.mock.calls[0]![0]).toMatchObject({
      lead_email: 'lead@example.com',
      requested_start: '2026-07-15T09:00:00.000Z',
    });
  });

  it('scans only accepted appointments in the 23h–25h window that are unreminded', async () => {
    // Empty scan = nothing due (e.g. a call outside the window). No claim, no email.
    const { sql, calls } = makeFakeSql([[]]);
    const sendReminder = vi.fn().mockResolvedValue({ sent: true });

    const result = await sendDueCitaReminders({ now: NOW, client: sql, sendReminder });

    expect(result.candidates).toBe(0);
    expect(result.sent).toBe(0);
    expect(sendReminder).not.toHaveBeenCalled();
    // The window + filters are enforced in SQL, so assert the scan query encodes them.
    expect(calls[0]!.raw).toMatch(/a\.status = /i);
    expect(calls[0]!.raw).toMatch(/reminder_sent_at is null/i);
    expect(calls[0]!.raw).toMatch(/requested_start >= /i);
    expect(calls[0]!.raw).toMatch(/requested_start <  /i);
    // Bound values: only 'aceptada' status, and the window is now+23h … now+25h.
    expect(calls[0]!.values[0]).toBe('aceptada');
    expect(result.window_from).toBe('2026-07-15T08:00:00.000Z'); // now + 23h
    expect(result.window_to).toBe('2026-07-15T10:00:00.000Z'); // now + 25h
  });

  it('already reminded (claim lost) → skipped, never double-sends', async () => {
    // Candidate looked unreminded at scan time, but an overlapping run claimed it first:
    // the update returns 0 rows → we must NOT send.
    const { sql } = makeFakeSql([[CANDIDATE], []]);
    const sendReminder = vi.fn().mockResolvedValue({ sent: true });

    const result = await sendDueCitaReminders({ now: NOW, client: sql, sendReminder });

    expect(result).toMatchObject({ candidates: 1, sent: 0, skipped: 1, failed: 0 });
    expect(sendReminder).not.toHaveBeenCalled();
  });

  it('failed send releases the claim so the next run retries', async () => {
    // scan → 1 candidate; claim → won; send fails; rollback update runs.
    const { sql, calls } = makeFakeSql([[CANDIDATE], [{ id: '1' }], []]);
    const sendReminder = vi
      .fn()
      .mockResolvedValue({ sent: false, skipped_reason: 'resend_send_failed' });

    const result = await sendDueCitaReminders({ now: NOW, client: sql, sendReminder });

    expect(result).toMatchObject({ candidates: 1, sent: 0, skipped: 0, failed: 1 });
    // Stamp rolled back to null so the appointment is a candidate again next hour.
    expect(calls[2]!.raw).toMatch(/set reminder_sent_at = null/i);
  });
});
