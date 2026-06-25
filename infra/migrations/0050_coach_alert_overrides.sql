-- 0050: coach_alert_overrides — snooze / dismiss persistence for /hoy signals.
--
-- WHY
-- ---
-- The attention queue (0049) surfaces every CURRENTLY-firing signal. But a coach
-- needs to be able to say "I've seen this, stop showing it to me" — either
-- forever (dismiss) or until a date (snooze) — WITHOUT that decision being wiped
-- the next time the background sweep recomputes. The live cohort engine had no
-- such persistence: every recompute re-surfaced the same alert, so Pablo could
-- never clear his queue (SPEC §8 gap). This table is the per-coach, per-athlete,
-- per-signal override layer the queue LEFT JOINs against to hide acknowledged
-- signals.
--
-- SIGNAL-AWARE RESURFACING
-- ------------------------
-- A dismissed signal should NOT stay hidden forever if the situation gets worse.
-- `resurface_on_new_signal` (default true) + `baseline_value_at_override` let the
-- sweep decide: when a previously-overridden signal fires again with a materially
-- worse value than when it was acknowledged, the override is treated as stale and
-- the signal re-surfaces. `snoozed_until` handles the time-boxed case (re-surface
-- automatically once the timestamp passes). `dismissed_at` is the permanent ack.
--
-- WHAT
-- ----
--   * Table `coach_alert_overrides` — one row per (athlete, signal_kind). A new
--     snooze/dismiss REPLACES the previous override for that pair (upsert).
--
-- ENUMS IN TS
-- -----------
-- `signal_kind` is `text`, same rationale as 0049: source of truth is
-- `shared/domain/coach/signals.ts`, not a pg enum.
--
-- UPSERT SEMANTICS
-- ----------------
-- UPSERT on the unique key (athlete_id, signal_kind): a fresh snooze or dismiss
-- overwrites the prior override for that signal (you don't accumulate stale
-- snoozes — there is at most ONE active override per athlete+signal).
--
-- INDEXES
-- -------
--   * unique (athlete_id, signal_kind) — upsert conflict target.
--   * (coach_id, athlete_id) — the queue LEFT JOIN ("for this coach's athletes,
--     which signals are currently overridden").
--
-- Idempotent: table + indexes `if not exists`; runner wraps the file in ONE
-- transaction (begin/commit stripped by the runner — kept for direct psql).

begin;

create table if not exists coach_alert_overrides (
  id                         bigserial primary key,
  coach_id                   bigint not null references coaches (id) on delete cascade,
  athlete_id                 bigint not null references athletes (id) on delete cascade,
  -- Allowed values defined in shared/domain/coach/signals.ts (source of truth).
  signal_kind                text not null,
  -- Time-boxed mute: the signal re-surfaces automatically once this passes.
  snoozed_until              timestamptz,
  -- Permanent acknowledgement (null until the coach dismisses).
  dismissed_at               timestamptz,
  -- When true, a materially-worse recurrence re-surfaces despite the override.
  resurface_on_new_signal    boolean not null default true,
  -- The metric value at the moment of override — the sweep compares against it
  -- to decide whether a recurrence is "materially worse" (signal-aware resurface).
  baseline_value_at_override double precision,
  -- Optional coach note attached to the override ("hablado, en deload voluntario").
  coach_note                 text,
  created_at                 timestamptz not null default now(),
  constraint coach_alert_overrides_athlete_signal_unique unique (athlete_id, signal_kind)
);

-- Queue LEFT JOIN: overrides for all of a coach's athletes.
create index if not exists coach_alert_overrides_coach_athlete_idx
  on coach_alert_overrides (coach_id, athlete_id);

commit;
