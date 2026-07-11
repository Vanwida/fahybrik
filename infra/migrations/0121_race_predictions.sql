-- 0121: race_predictions — the FROZEN goal/gap snapshot.
--
-- WHY
-- ---
-- The "predicho vs real" surface (Fase 3, screen C) can only be HONEST if the
-- prediction is captured BEFORE the event, not recomputed after the result is
-- known (that would be hindsight dressed up as a forecast). So every time the
-- athlete's goal-gap board is served with a real budget we persist a snapshot of
-- that day's prediction. After the race, `prediction-review` reads the LAST
-- snapshot dated before the event and compares it, segment by segment, against
-- the real splits. The snapshot is immutable history — never edited after the day
-- it was taken.
--
-- WHAT
-- ----
--   * athlete_id        — owner (cascade with the athlete).
--   * target_race_id    — the race the prediction was aimed at (null if the
--                         target was cleared later; FK set null keeps the row).
--   * goal_time_seconds — the goal that day (may drift as the athlete re-aims).
--   * predicted_total_s — the day's predicted finish (NOT NULL: a snapshot is only
--                         written when a real budget + prediction exist).
--   * segments_json     — the typed engine array: [{slug, kind, budget_s,
--                         predicted_s, tier}] (predicted_s null = sin_datos).
--   * model_version     — which engine produced it (GOAL_GAP_MODEL_VERSION), so a
--                         later model change is attributable.
--   * pred_date         — the box-tz (Europe/Madrid) DATE the snapshot was taken.
--                         An explicit column, NOT created_at::date: a timestamptz
--                         → date cast is only STABLE (tz-dependent), so Postgres
--                         rejects it in a generated column / unique expression
--                         index. The app stamps the box-tz day, giving a clean,
--                         deterministic "one row per athlete per day".
--
-- ONE ROW PER ATHLETE PER DAY: unique (athlete_id, pred_date); the serve path
-- upserts, so repeated loads on the same day refresh that day's snapshot in place
-- instead of piling up.
--
-- Idempotent: table + indexes `if not exists`; the runner journals by filename
-- stem (0121_race_predictions).

begin;

create table if not exists race_predictions (
  id                 bigserial primary key,
  athlete_id         bigint not null references athletes (id) on delete cascade,
  target_race_id     bigint references races (id) on delete set null,
  goal_time_seconds  int,
  predicted_total_s  int not null,
  segments_json      jsonb not null,
  model_version      text not null,
  pred_date          date not null,
  created_at         timestamptz not null default now()
);

-- One snapshot per athlete per box-tz day (the serve path upserts on this).
create unique index if not exists race_predictions_athlete_day_uidx
  on race_predictions (athlete_id, pred_date);

-- History scan for "the last snapshot before the event" (per-athlete, newest).
create index if not exists race_predictions_athlete_created_idx
  on race_predictions (athlete_id, created_at);

commit;
