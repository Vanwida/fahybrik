-- 0074: JOINT DOUBLES EXECUTION LINK
--
-- WHAT THIS IS
-- ------------
-- Adds workout_executions.partner_athlete_id — set when an execution is logged
-- as a JOINT HYROX Dobles "train together" session (POST
-- /api/athlete/dobles/session/[id]/log). It records WHO the athlete trained
-- with so "this pair trained together on this day" is a first-class, queryable
-- fact for the partner + coach views.
--
-- HONEST BY DESIGN
-- ----------------
-- Each athlete still logs their OWN execution (own loads / RPE / actuals)
-- against their OWN dated workout_assignment. We NEVER write the partner's
-- execution from one device — the partner logs their own from theirs. This
-- column is the LINK between the two per-athlete executions, not the partner's
-- fabricated actuals. (A doubles pair coordinates plan STRUCTURE only — see
-- 0065 doubles_pairs — there is no shared assignment row to write into.)
--
-- ADDITIVE & NON-BREAKING: one nullable FK column + a partial index. Solo
-- logging is untouched — it leaves the column NULL. on delete set null so an
-- athlete deletion never cascades away the surviving partner's execution row.

begin;

alter table workout_executions
  add column if not exists partner_athlete_id bigint
    references athletes(id) on delete set null;

-- Joint-session lookups ("which of my executions were done with a partner").
create index if not exists workout_executions_partner_athlete_idx
  on workout_executions (partner_athlete_id)
  where partner_athlete_id is not null;

comment on column workout_executions.partner_athlete_id is
  '0074: when set, this execution was logged as a JOINT HYROX Dobles session with this partner athlete. Each athlete logs their own execution (own loads/RPE); this is the link between the two, not the partner''s actuals.';

commit;
