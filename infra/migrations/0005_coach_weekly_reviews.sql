-- FAHYBRIK migration 0005: coach weekly review snapshots
--
-- Coach Weekly Review (UX spec /docs/ux/09-coach-weekly-review.md, signed off
-- 2026-05-07). Pablo's once-weekly deliberate review of his cohort, distinct
-- from daily triage. The persistence requirements:
--
--   * snapshot of cohort metrics for the week (so historical reviews stay
--     internally consistent even as the live cohort drifts)
--   * decisions made (transitions advanced, mass adjustments applied, etc.)
--   * journal notes (append-only — feeds the future RAG of Pablo's methodology)
--   * duration the review took (Pablo wants to see this drop over time)
--   * status (draft | approved | deferred)
--
-- Lookups:
--   * "current draft for this coach + week" → unique partial index
--   * "history for this coach" → btree on (coach_id, iso_week_start desc)

begin;

create type coach_weekly_review_status as enum ('draft', 'approved', 'deferred');

create table coach_weekly_reviews (
  id                  bigint generated always as identity primary key,
  coach_id            bigint not null
                        references coaches(id) on delete cascade,
  iso_week_start      date not null,
  status              coach_weekly_review_status not null default 'draft',
  -- Cohort metrics frozen at the time the review was opened. JSON is the right
  -- container here — schema evolves (new metrics added) without touching this
  -- table; old reviews stay readable as-is.
  snapshot_json       jsonb not null default '{}'::jsonb,
  -- Decisions Pablo committed in section 2/3/4 (transitions advanced, mass
  -- adjustments applied, modified plans assigned). Append-only within a review.
  decisions_json      jsonb not null default '[]'::jsonb,
  -- Journal entries (section 6). Each entry is { ts, body }. Append-only.
  notes_json          jsonb not null default '[]'::jsonb,
  -- Section 5 — pablo's edits to next 14d cohort plan. Empty if untouched.
  plan_edits_json     jsonb not null default '[]'::jsonb,
  -- How long Pablo spent in the review (ms between opening and approving).
  duration_ms         integer,
  opened_at           timestamptz not null default now(),
  approved_at         timestamptz,
  deferred_until      date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Only one open draft per coach per ISO week.
create unique index coach_weekly_reviews_open_draft_idx
  on coach_weekly_reviews (coach_id, iso_week_start)
  where status = 'draft';

create index coach_weekly_reviews_history_idx
  on coach_weekly_reviews (coach_id, iso_week_start desc);

create trigger coach_weekly_reviews_set_updated_at
  before update on coach_weekly_reviews
  for each row execute function set_updated_at();

commit;
