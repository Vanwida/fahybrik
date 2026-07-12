-- 0128: dobles_live_status — ephemeral LIVE PRESENCE between the two athletes of a
-- doubles pair. One row per athlete, upserted every few seconds; NOT history.
--
-- (Numbering note: the runner journals by filename stem, so gaps/collisions are
-- harmless. 0127 is the current highest on this branch → this is 0128.)
--
-- WHY
-- ---
-- When a doubles pair trains "together" they are usually in DIFFERENT gyms. Each
-- phone broadcasts a heartbeat (~every 5 s) so the partner's phone can show, live,
-- how the other is going (Peloton-style). This is PRESENCE, not a result: it is
-- overwritten every few seconds and expires — so it is exactly ONE row per athlete
-- (PK = athlete_id, upsert on conflict), never an append-only log that would grow
-- without bound. The durable record of the session is still workout_executions;
-- this table is only the transient "where are you right now" channel.
--
-- PRIVACY: a presence row exists ONLY for a SHARED session. The writer
-- (app/api/athlete/dobles/live) refuses to emit for a 'self_only' assignment, so a
-- private session never reaches this table. The reader shows the PARTNER's row and
-- treats anything older than 6 h as gone (the app was closed long ago).
--
-- WHAT
-- ----
--   * athlete_id    — PK + FK athletes(id) ON DELETE CASCADE. One live slot per
--                     athlete; each new heartbeat upserts it.
--   * assignment_id — FK workout_assignments(id) ON DELETE CASCADE. Which session
--                     is being broadcast (the writer's OWN assignment).
--   * phase         — closed set: 'active' | 'paused' | 'finished' | 'left'.
--                     'finished' stays readable (within 6 h) to show "ha terminado".
--   * workout_title — human label of the session ("el entreno de hoy").
--   * block_name    — optional current block ("Remo ergo").
--   * progress_text — optional human progress ("Tramo 2 de 4 · Bloque 3").
--   * elapsed_s     — seconds since the athlete started (>= 0).
--   * hr_bpm        — live heart rate if the watch feeds it (plausible-human band).
--   * final_time_s  — the finish time; only meaningful with phase='finished' (the
--                     writer stores NULL otherwise, so a live row never claims one).
--   * final_rpe     — the athlete's RPE on finish (0..10 scale), same finished-only.
--   * updated_at    — server write time; drives age_s + the 6 h expiry, read-side.
--
-- Idempotent via `if not exists`; single table, revertible (drop table).

begin;

create table if not exists dobles_live_status (
  athlete_id    bigint primary key references athletes(id) on delete cascade,
  assignment_id bigint not null references workout_assignments(id) on delete cascade,
  phase         text not null check (phase in ('active', 'paused', 'finished', 'left')),
  workout_title text not null,
  block_name    text,
  progress_text text,
  elapsed_s     integer not null default 0 check (elapsed_s >= 0),
  hr_bpm        integer check (hr_bpm is null or hr_bpm between 20 and 250),
  final_time_s  integer check (final_time_s is null or final_time_s >= 0),
  final_rpe     numeric(3, 1) check (final_rpe is null or (final_rpe >= 0 and final_rpe <= 10)),
  updated_at    timestamptz not null default now()
);

commit;
