-- 0120: denormalize the effort CONTEXT onto segment_executions.
--
-- (Numbering note: 0119 does NOT exist on this branch — it lives on another
-- branch in flight [0119_authored_coach_rename]. This migration is authored as
-- 0120 to avoid a stem collision; the runner journals by filename stem, so the
-- gap is harmless.)
--
-- WHY
-- ---
-- A segment_executions row today knows its MODALITY ('row') but not its
-- CONTEXT: was that row a standalone erg piece, one of several intervals, or a
-- station inside a fatigued HYROX simulation? That context lived ONLY behind
-- the OPTIONAL link `segment_executions.template_segment_id → template_segments`
-- (`on delete set null`), so a template edit/delete silently orphaned it — in
-- the demo DB 11 of 68 segments had already lost the link (one whole execution:
-- 8 segments, 0 linked). Analytics and the future prediction engine need the
-- context IN THE ROW, denormalized at write time, so it survives template
-- churn. Same pattern proven by `modality` in 0045 — that file is the mould.
--
-- WHAT
-- ----
--   * context_format        text  — the CANONICAL format of the block the effort
--                                   belonged to (format.ts vocabulary: for_time,
--                                   amrap, emom, tabata, death_by, intervals,
--                                   steady, chipper, ladder, rounds, hyrox_sim,
--                                   sets, warmup, cooldown). NULL when unknown.
--   * context_source        text  — provenance of that format, honest about
--                                   precision: 'block' = the exact prescribed
--                                   block; 'session' = fell back to the whole
--                                   session's format (less precise). CHECK-bound.
--   * exercise_id           bigint — the movement's identity, copied from the
--                                   template segment so it survives edits/deletes
--                                   of the template (FK on delete set null).
--   * prescription_snapshot jsonb  — the typed Prescription line as it stood when
--                                   executed (immutable history; same shape as
--                                   template_segments.prescription_json).
--   * prior_work_s          int    — seconds of work in the SAME session BEFORE
--                                   this segment started (a fatigue proxy). NULL
--                                   when it cannot be measured honestly.
--
-- All NULLABLE and additive. Idempotent via `if not exists` / guarded constraint.
-- The backfill below stamps every existing row (linked → 'block', orphaned →
-- 'session'); the ingest layer stamps new rows server-side going forward.

begin;

-- ── Columns ──────────────────────────────────────────────────────────────────
alter table segment_executions
  add column if not exists context_format        text,
  add column if not exists context_source        text,
  add column if not exists exercise_id           bigint references exercises(id) on delete set null,
  add column if not exists prescription_snapshot jsonb,
  add column if not exists prior_work_s          int;

-- context_source is a closed 2-value vocabulary (nullable). ADD CONSTRAINT has no
-- IF NOT EXISTS, so guard it for idempotency.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'segment_executions_context_source_chk'
  ) then
    alter table segment_executions
      add constraint segment_executions_context_source_chk
      check (context_source is null or context_source in ('block', 'session'));
  end if;
end $$;

-- Fast context-format breakdown scans (analytics group by context_format).
create index if not exists segment_executions_context_format_idx
  on segment_executions (context_format);

-- ── Canonicalization helper (migration-scoped) ───────────────────────────────
-- Mirrors shared/domain/prescription/format.ts::normalizeFormat as a FROZEN
-- snapshot for this one-time backfill: canonical keys pass through, legacy
-- aliases fold to canonical, unknowns → NULL. Dropped at the end so it never
-- pollutes the schema. (The runtime path uses the shared TS function directly.)
create or replace function _seg_ctx_canonical_format(raw text)
returns text
language sql
immutable
as $func$
  select case
    when raw is null then null
    when lower(trim(raw)) in (
      'for_time', 'amrap', 'emom', 'tabata', 'death_by', 'intervals', 'steady',
      'chipper', 'ladder', 'rounds', 'hyrox_sim', 'sets', 'warmup', 'cooldown'
    ) then lower(trim(raw))
    when lower(trim(raw)) = 'strength_block' then 'sets'
    when lower(trim(raw)) = 'tempo'          then 'steady'
    when lower(trim(raw)) = 'circuit'        then 'rounds'
    when lower(trim(raw)) = 'test'           then 'for_time'
    when lower(trim(raw)) = 'interval'       then 'intervals'
    when lower(trim(raw)) = 'simulation'     then 'hyrox_sim'
    else null
  end
$func$;

-- ── Backfill 1: rows with a LIVE template_segment link → 'block' ─────────────
-- Format from the block's own format (fallback to the prescription scheme);
-- exercise identity + prescription snapshot copied straight from the segment.
update segment_executions se
set
  context_source        = 'block',
  exercise_id           = ts.exercise_id,
  prescription_snapshot = ts.prescription_json,
  context_format        = _seg_ctx_canonical_format(
                            coalesce(ts.block_format, ts.prescription_json->>'scheme')
                          )
from template_segments ts
where se.template_segment_id = ts.id;

-- ── Backfill 2: ORPHANED rows (no live link) → 'session' ─────────────────────
-- Fall back to the whole session's format via the assignment's template.
update segment_executions se
set
  context_source = 'session',
  context_format = _seg_ctx_canonical_format(t.format::text)
from workout_executions we
join workout_assignments wa on wa.id = we.assignment_id
join templates t on t.id = wa.template_id
where se.execution_id = we.id
  and se.template_segment_id is null;

-- ── Backfill 3: prior_work_s (fatigue proxy) — HONEST or NULL ────────────────
-- Only when the stored segment timings are REAL (started_at differs across the
-- execution's segments). If every segment shares one started_at (the old ingest
-- fallback that stamped execution-start on all of them), prior work cannot be
-- measured honestly → leave NULL. Never fabricate.
with exec_real as (
  select execution_id
  from segment_executions
  group by execution_id
  having count(distinct started_at) > 1
),
prior as (
  select
    se.id,
    count(prev.id) as n_prev,
    count(*) filter (
      where prev.id is not null and prev.started_at is not null and prev.ended_at is not null
    ) as n_prev_timed,
    coalesce(
      sum(greatest(0, floor(extract(epoch from (prev.ended_at - prev.started_at))))),
      0
    ) as sum_prev_s
  from segment_executions se
  join exec_real er on er.execution_id = se.execution_id
  left join segment_executions prev
    on prev.execution_id = se.execution_id
   and prev.position < se.position
  group by se.id
)
update segment_executions se
set prior_work_s = case
  when p.n_prev = 0 then 0                                -- first segment: zero prior work (a fact)
  when p.n_prev = p.n_prev_timed then p.sum_prev_s::int   -- every prior segment honestly timed
  else null                                              -- a prior lacks real timing → honest NULL
end
from prior p
where p.id = se.id;

drop function _seg_ctx_canonical_format(text);

commit;
