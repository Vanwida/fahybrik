-- 0029: llm_invocations — per-call LLM telemetry (A7 finding: 0 cost tracking →
-- bill-shock risk). One row per LLM API call (Pablo IA suggest-week/workout,
-- weekly evaluation, coach chat). Recorded best-effort: a failed insert must
-- never break the user-facing response (see lib/observability/llm-cost.ts).
--
-- cost_usd is computed app-side from a per-model pricing table at insert time
-- and stored denormalized so reporting doesn't depend on a live pricing lookup.
-- NULL cost_usd = model not in the pricing table (unknown model → don't guess).

begin;

create table if not exists llm_invocations (
  id                 bigint generated always as identity primary key,
  athlete_id         bigint null references athletes(id) on delete set null,
  coach_id           bigint null references coaches(id) on delete set null,
  surface            text not null,
  model              text not null,
  prompt_tokens      integer null,
  completion_tokens  integer null,
  cached_tokens      integer null,
  cost_usd           numeric(10, 6) null,
  created_at         timestamptz not null default now()
);

-- Reporting access patterns: spend over time, spend per surface, spend per
-- athlete/coach. Partial-free b-tree on created_at covers the time-range scans.
create index if not exists llm_invocations_created_at_idx
  on llm_invocations (created_at desc);

create index if not exists llm_invocations_surface_idx
  on llm_invocations (surface, created_at desc);

create index if not exists llm_invocations_athlete_idx
  on llm_invocations (athlete_id, created_at desc)
  where athlete_id is not null;

create index if not exists llm_invocations_coach_idx
  on llm_invocations (coach_id, created_at desc)
  where coach_id is not null;

commit;
