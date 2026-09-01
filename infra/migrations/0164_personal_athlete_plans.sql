-- 0164: PERSONAL ATHLETE PLANS — a microciclo that belongs to ONE athlete, not
-- the shared library and not the level×days periodization matrix.
--
-- WHAT THIS ADDS
-- --------------
-- `program_month_templates` / `program_week_templates` already ARE "an ordered
-- container of N weeks, each with its own days" (0014). The only thing missing is
-- WHOSE it is:
--   * athlete_id IS NULL  → library microciclo, reusable, matched by level (today,
--     unchanged for every existing row).
--   * athlete_id SET      → personal plan for exactly that athlete. level_id stops
--     mattering (a plan for a person has no level to pair against) — application
--     code sets it NULL on creation; the column itself stays nullable/untouched so
--     nothing here changes the meaning of an existing library row.
--
-- `personalized_from_id` is lineage: when a personal plan is FORKED from a library
-- microciclo (the primary flow — "coge lo que el atleta ya tiene y sigue desde
-- ahí"), it points at the source. NULL means built from scratch. `on delete set
-- null` so deleting the source library microciclo later never blocks or cascades
-- into the fork — the fork is already an independent copy.
--
-- `athlete_sequence_progress` gets a THIRD status, 'detached': the coach
-- personalized this athlete's plan, so they stop auto-walking the sequence.
-- Distinct from 'completed' (which means the sequence finished on its own) so the
-- cursor (sequence_id/current_position/loops_completed) survives untouched —
-- reversible: re-flipping status back to 'active' resumes the walk exactly where
-- it left off. See docs/DECISIONS.md for the full personalize-plan design.
--
-- ADDITIVE & NON-BREAKING
-- -----------------------
--   * Every new column is NULLABLE. Every existing row keeps athlete_id NULL and
--     personalized_from_id NULL — behaves exactly as today.
--   * The status check widens (superset of the existing values); no existing row
--     needs to change.
--   * No data is touched, no column dropped, no existing constraint tightened.

begin;

alter table program_month_templates
  add column if not exists athlete_id bigint references athletes(id) on delete cascade,
  add column if not exists personalized_from_id bigint references program_month_templates(id) on delete set null;

alter table program_week_templates
  add column if not exists athlete_id bigint references athletes(id) on delete cascade;

-- Partial indexes: only the (rare) athlete-owned rows need this lookup path — the
-- existing coach_id/level_id index already serves the library-row majority.
create index if not exists program_month_templates_athlete_idx
  on program_month_templates (athlete_id)
  where athlete_id is not null;

create index if not exists program_week_templates_athlete_idx
  on program_week_templates (athlete_id)
  where athlete_id is not null;

alter table athlete_sequence_progress drop constraint if exists athlete_sequence_progress_status_chk;
alter table athlete_sequence_progress add constraint athlete_sequence_progress_status_chk
  check (status in ('active', 'completed', 'detached'));

comment on column program_month_templates.athlete_id is
  '0164: NULL = library microciclo (reusable, matched by level). SET = a personal plan for exactly this athlete — level_id/phase_id stop mattering.';
comment on column program_month_templates.personalized_from_id is
  '0164: the library microciclo this personal plan was forked from (week content copied, never referenced). NULL = built from scratch.';
comment on column program_week_templates.athlete_id is
  '0164: NULL = library week (owned by a library program_month_templates). SET = a week belonging to one athlete''s personal plan — always matches its parent month''s athlete_id.';
comment on column athlete_sequence_progress.status is
  'active = walking the sequence | completed = last microciclo done naturally | detached = coach personalized the plan, cursor preserved for a future revert (0164).';

commit;
