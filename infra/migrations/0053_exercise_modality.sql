-- 0053: bind MODALITY to the exercise (UNIT A of the "modality is intrinsic" fix).
--
-- WHY
-- ---
-- Modality (run | row | ski | bike | strength | functional | core | mobility |
-- other) is an INTRINSIC property of an exercise — a BikeErg is always a bike, a
-- Sled Push is always functional. Until now the catalog had only `category`
-- (cardio | strength | skill | hyrox_station | mobility | plyometric | core),
-- and modality was DERIVED on the fly at the edges: the editor mapped category →
-- modality client-side (block-defaults.ts CATEGORY_TO_MODALITY), and structured
-- prescriptions carried a `modality` that could drift from the exercise it points
-- at (e.g. an Assault Bike line stored modality=NULL, a Sled Push line stored
-- modality='strength'). That derivation is brittle and produced incoherent rows.
--
-- This migration makes the exercise the SINGLE SOURCE OF TRUTH for modality:
--   (a) adds exercises.modality (CHECK-constrained to the 9 prescription values),
--   (b) backfills it for every row by a DETERMINISTIC category(+name) rule,
--   (c) marks it NOT NULL once every row is populated,
--   (d) repairs structured prescription_json.modality on block_exercises and
--       template_segments so each line's modality matches its exercise — but
--       CONSERVATIVELY: only fills NULLs and corrects the legacy default
--       'strength' on non-strength exercises; never rewrites a modality that
--       already correctly differs, and never touches measures/scheme.
--
-- The prescription `modality` column on the JSON stays (a line CAN, rarely,
-- override modality per item — a mixed/compromised block is multiple items each
-- with its own modality). This migration only makes the DEFAULT trustworthy.
--
-- ADDITIVE + REVERSIBLE-SAFE: a new column + idempotent backfills. Re-running is
-- a no-op (column add is `if not exists`; backfills are conditional UPDATEs that
-- converge). To revert: `alter table exercises drop column modality;` and the
-- prescription_json edits are forward-only data corrections (the prior NULL /
-- wrong 'strength' values are not preserved — see report below for the diff).

begin;

-- ── (a) column + CHECK ───────────────────────────────────────────────────────
-- Nullable first so the backfill can populate before we lock NOT NULL.
alter table exercises
  add column if not exists modality text;

alter table exercises
  drop constraint if exists exercises_modality_chk;
alter table exercises
  add constraint exercises_modality_chk
  check (modality is null or modality in (
    'run', 'row', 'ski', 'bike', 'strength', 'functional', 'core', 'mobility', 'other'
  ));

-- ── (b) backfill exercises.modality (deterministic, case-insensitive) ─────────
-- Idempotent: re-running recomputes the same value. We update ALL rows (not just
-- NULLs) so a re-run also self-corrects if the rule changes. The rule is the
-- closed contract of UNIT A — see the agent task spec.
update exercises e set modality =
  case
    when e.category = 'strength'   then 'strength'
    when e.category = 'core'       then 'core'
    when e.category = 'mobility'   then 'mobility'
    when e.category = 'plyometric' then 'functional'
    when e.category = 'skill'      then 'functional'
    when e.category = 'cardio' then
      case
        when lower(e.name) like '%ski%' then 'ski'
        when lower(e.name) like '%row%' then 'row'
        when lower(e.name) like '%bike%'
          or lower(e.name) like '%assault%'
          or lower(e.name) like '%echo%'
          or lower(e.name) like '%cycl%' then 'bike'
        when lower(e.name) like '%run%'
          or lower(e.name) like '%treadmill%'
          or lower(e.name) like '%jog%' then 'run'
        else 'other'
      end
    when e.category = 'hyrox_station' then
      case
        when lower(e.name) like '%ski%' then 'ski'
        when lower(e.name) like '%row%' then 'row'
        when lower(e.name) like '%run%' then 'run'
        else 'functional'
      end
    else 'other'
  end;

-- ── (c) lock NOT NULL ─────────────────────────────────────────────────────────
-- The rule above has an `else 'other'` total fallback, so every row is populated.
-- This statement fails loudly (rolling back the whole migration) if any row is
-- somehow NULL — the safety net the spec asks for.
alter table exercises
  alter column modality set not null;

create index if not exists exercises_modality_idx on exercises (modality);

-- ── (d) repair structured prescription_json.modality (conservative) ───────────
-- For STRUCTURED prescriptions only (exercise_id + prescription_json present),
-- set the line's modality from its exercise WHEN the stored modality is:
--   · NULL (never set), OR
--   · the legacy default 'strength' on an exercise that is NOT strength
--     (the old client default wrote 'strength' for every freshly-added line).
-- We do NOT touch a line whose modality already differs (a deliberate per-item
-- override stays). We only write `{modality}`; measures/scheme/target untouched.

update block_exercises be set
  prescription_json = jsonb_set(be.prescription_json, '{modality}', to_jsonb(e.modality))
from exercises e
where be.exercise_id = e.id
  and be.prescription_json is not null
  and (
    (be.prescription_json->>'modality') is null
    or ((be.prescription_json->>'modality') = 'strength' and e.modality <> 'strength')
  );

update template_segments ts set
  prescription_json = jsonb_set(ts.prescription_json, '{modality}', to_jsonb(e.modality))
from exercises e
where ts.exercise_id = e.id
  and ts.prescription_json is not null
  and (
    (ts.prescription_json->>'modality') is null
    or ((ts.prescription_json->>'modality') = 'strength' and e.modality <> 'strength')
  );

commit;
