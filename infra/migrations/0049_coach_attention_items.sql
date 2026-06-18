-- 0049: coach_attention_items — the PRECOMPUTED attention store for /hoy.
--
-- WHY
-- ---
-- The coach "Hoy" attention engine has to answer, for Pablo, ONE question on
-- every page load: "which of my athletes need me right now, and why?". Today
-- that answer is computed live in `web/lib/coach/cohort.ts` — for EACH athlete
-- it fans out ~12 sub-queries (HRV recent/baseline, RHR, sleep, VO2, last sync,
-- next session, missed sessions, RPE, last check-in, unread messages, A-event)
-- and then rolls up signals in JS. That is an O(athletes) N+1 explosion: the
-- queue read cost scales with cohort size, and the signal logic re-runs on every
-- request even when nothing changed.
--
-- This table is the FIX (SPEC §8 / §9 FIX 1): a background sweep computes each
-- athlete's firing signals ONCE and writes them here; the /hoy queue then becomes
-- a SINGLE indexed read filtered by coach + severity + recency. The expensive
-- per-athlete fan-out moves off the request path into the sweep.
--
-- WHAT
-- ----
--   * Table `coach_attention_items` — one row per (athlete, firing signal_kind).
--
-- ENUMS LIVE IN TS, NOT PG (deliberate)
-- -------------------------------------
-- `signal_kind` and `severity` are stored as `text`, NOT pg enums. The SINGLE
-- SOURCE OF TRUTH for the allowed signal kinds is `shared/domain/coach/signals.ts`
-- (consumed by both the iOS app and the dashboard). Promoting them to pg enums
-- would create a second, drift-prone source the migration runner would have to
-- chase every time a signal is added. `severity` is one of: 'critical' |
-- 'warning' | 'info'. Validation is enforced at the write boundary (Zod), per
-- the project's server-side-validation rule.
--
-- UPSERT SEMANTICS
-- ----------------
-- The sweep UPSERTs on the unique key (athlete_id, signal_kind):
--   * `first_seen_at` is set on INSERT and PRESERVED on conflict — it records the
--     first sweep at which the signal started firing (powers "X has been in the
--     red for 3 days"). The upsert must NOT overwrite it.
--   * `computed_at` is bumped to now() on every sweep that re-confirms the signal,
--     so a stale row (signal no longer firing) is detectable / sweep-deletable.
-- A signal that stops firing is removed by the sweep (delete rows whose
-- computed_at is older than the current sweep), so the table only ever holds
-- CURRENTLY-firing signals.
--
-- INDEXES
-- -------
--   * unique (athlete_id, signal_kind) — the upsert conflict target.
--   * (coach_id, severity, computed_at) — the queue read: "all firing signals for
--     this coach, ordered by severity then recency".
--
-- Idempotent: table + indexes `if not exists`; the migrate runner journals by
-- filename stem and wraps this whole file in ONE transaction (begin/commit below
-- are stripped by the runner — kept for direct psql use).

begin;

create table if not exists coach_attention_items (
  id               bigserial primary key,
  coach_id         bigint not null references coaches (id) on delete cascade,
  athlete_id       bigint not null references athletes (id) on delete cascade,
  -- Allowed values defined in shared/domain/coach/signals.ts (source of truth).
  signal_kind      text not null,
  -- 'critical' | 'warning' | 'info' — validated at the write boundary (Zod).
  severity         text not null,
  -- Current value of the underlying metric (e.g. HRV delta ms) and its baseline,
  -- so the queue can render "▼ 18 ms vs baseline" without re-querying streams.
  value_numeric    double precision,
  baseline_numeric double precision,
  -- 'up' | 'down' | 'flat' (or null when not applicable) — directional hint.
  trend            text,
  -- Coach-facing short label + longer detail line (precomputed by the sweep).
  label            text not null,
  detail           text not null default '',
  -- Stable key the sweep uses to recognise "the same signal occurrence" across
  -- recomputes (e.g. "hrv_crash:2026-06-17"); decouples dedupe from display copy.
  dedupe_key       text not null,
  -- First sweep at which this signal started firing (preserved across upserts).
  first_seen_at    timestamptz not null default now(),
  -- Last sweep that re-confirmed the signal (bumped on every upsert).
  computed_at      timestamptz not null default now(),
  constraint coach_attention_items_athlete_signal_unique unique (athlete_id, signal_kind)
);

-- Queue read: firing signals for a coach, ordered by severity then recency.
create index if not exists coach_attention_items_queue_idx
  on coach_attention_items (coach_id, severity, computed_at);

commit;
