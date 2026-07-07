-- 0095_appointment_reminder_sent.sql
--
-- T-24h videollamada reminder (funnel). The hourly cron /api/cron/cita-reminders
-- emails the lead ~24h before an ACCEPTED ('aceptada') appointment. This column is
-- the idempotency stamp: it records WHEN the reminder was actually delivered so two
-- overlapping cron runs never double-send. NULL = not yet reminded (a candidate).
--
-- The cron CLAIMS a row with `update … set reminder_sent_at = now() where id = $1 and
-- reminder_sent_at is null returning …`; only the run whose update returns a row sends,
-- and a failed send rolls the stamp back to NULL so the next run retries.
--
-- Additive + idempotent. Runner wraps the file in one transaction; no begin/commit.

alter table appointments add column if not exists reminder_sent_at timestamptz;

comment on column appointments.reminder_sent_at is
  'When the T-24h videollamada reminder was actually sent to the lead. NULL = not yet reminded. Idempotency claim for /api/cron/cita-reminders (aceptada appointments only).';

-- Partial index: the cron only ever scans not-yet-reminded rows in a small time window.
create index if not exists appointments_reminder_pending_idx
  on appointments (requested_start)
  where reminder_sent_at is null;
