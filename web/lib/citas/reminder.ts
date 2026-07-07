// T-24h videollamada reminder cron — pure logic, no auth, no HTTP.
//
// Runs hourly. Finds ACCEPTED ('aceptada') appointments starting ~24h from now that
// haven't been reminded yet, and emails each lead once. The window is deliberately
// WIDER (23h–25h) than the 1h cron interval so a single missed/late run never drops a
// reminder — every accepted call is seen by ~2 consecutive runs.
//
// Idempotency (never double-send): a candidate is CLAIMED with
//   update appointments set reminder_sent_at = now()
//    where id = $1 and reminder_sent_at is null returning id
// Only the run whose update returns a row sends. Two overlapping runs race on the same
// row; exactly one wins the update, the other gets 0 rows and skips. On a failed send we
// roll the stamp back to NULL (we own the claim, so this can't clobber another run) so
// the next hourly pass retries while the call is still inside the window.
//
// Schema: infra/migrations/0093_appointments.sql (status enum, requested_start, meet_link,
//         lead_id) + 0095_appointment_reminder_sent.sql (reminder_sent_at).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { AppointmentStatus } from '@fahybrid/shared/domain/citas/status';
import type { CitaEmailResult } from './email';
import { sendCitaReminderEmail } from './reminder-email';

const HOUR_MS = 60 * 60 * 1000;
// Window edges around the T-24h target. 23h–25h = ±1h so the hourly cron always covers it.
const WINDOW_MIN_HOURS = 23;
const WINDOW_MAX_HOURS = 25;
// Only accepted calls get a reminder (mirrors the pg enum value; see status.ts).
const REMINDABLE_STATUS: AppointmentStatus = 'aceptada';

interface CandidateRow {
  id: string;
  requested_start: Date;
  meet_link: string | null;
  lead_email: string;
  lead_nombre: string | null;
}

export interface SendDueCitaRemindersResult {
  window_from: string;
  window_to: string;
  /** Rows in the window that were unreminded when we scanned. */
  candidates: number;
  /** Reminders actually delivered (claim won + email sent). */
  sent: number;
  /** Claim lost to an overlapping run (already reminded) — the idempotency guard firing. */
  skipped: number;
  /** Claimed but the email did not go out; stamp rolled back for a retry next run. */
  failed: number;
}

export interface SendDueCitaRemindersParams {
  now?: Date;
  client?: Sql;
  /** Injected for tests so the suite never touches Resend or the network. */
  sendReminder?: (input: {
    requested_start: string;
    meet_link: string | null;
    lead_email: string;
    lead_nombre: string | null;
  }) => Promise<CitaEmailResult>;
}

export async function sendDueCitaReminders(
  params: SendDueCitaRemindersParams = {},
): Promise<SendDueCitaRemindersResult> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const sendReminder = params.sendReminder ?? sendCitaReminderEmail;

  const from = new Date(now.getTime() + WINDOW_MIN_HOURS * HOUR_MS);
  const to = new Date(now.getTime() + WINDOW_MAX_HOURS * HOUR_MS);

  const candidates = await client<CandidateRow[]>`
    select a.id::text as id, a.requested_start, a.meet_link,
           l.email as lead_email, l.nombre as lead_nombre
    from appointments a
    join leads l on l.id = a.lead_id
    where a.status = ${REMINDABLE_STATUS}::appointment_status
      and a.reminder_sent_at is null
      and a.requested_start >= ${from.toISOString()}::timestamptz
      and a.requested_start <  ${to.toISOString()}::timestamptz
    order by a.requested_start asc
  `;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of candidates) {
    // CLAIM: only the run that flips reminder_sent_at from null wins the right to send.
    const claimed = await client<{ id: string }[]>`
      update appointments set reminder_sent_at = now()
       where id = ${Number(c.id)} and reminder_sent_at is null
      returning id::text as id
    `;
    if (claimed.length === 0) {
      skipped += 1; // another (overlapping) run already reminded this one.
      continue;
    }

    let result: CitaEmailResult;
    try {
      result = await sendReminder({
        requested_start: c.requested_start.toISOString(),
        meet_link: c.meet_link,
        lead_email: c.lead_email,
        lead_nombre: c.lead_nombre,
      });
    } catch {
      // A thrown error (e.g. Zod on a malformed row) is treated as a failed send.
      result = { sent: false, skipped_reason: 'resend_send_failed' };
    }

    if (result.sent) {
      sent += 1;
      continue;
    }

    // Send didn't go out → release the claim so the next hourly run retries. We own this
    // row's stamp (we just set it from null), so resetting it can't clobber another run.
    failed += 1;
    await client`
      update appointments set reminder_sent_at = null where id = ${Number(c.id)}
    `;
  }

  return {
    window_from: from.toISOString(),
    window_to: to.toISOString(),
    candidates: candidates.length,
    sent,
    skipped,
    failed,
  };
}
