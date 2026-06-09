-- 0043: structured per-set PRESCRIPTION layer.
--
-- WHY
-- ---
-- Until now a line's per-set dosage lived in FREE TEXT: a back squat
-- "5 rounds 10/10/8/8/6 @ 60/65/70/70/75% RM" was stored as
-- params_json={sets:5,rest_seconds:150} + a prose `notes` string +
-- (block_exercises only) a `reps_scheme` string. Nothing downstream could read
-- the per-set reps/loads → no clean editing, no volume/load analytics, no AI
-- adaptation.
--
-- This migration adds a nullable `prescription_json jsonb` column to BOTH
-- structured tables. It holds the typed model from
-- @fahybrid/shared/domain/prescription (scheme + explicit sets[] with per-set
-- reps/load/rest/rpe/tempo/hr_zone). The backfill (0043 companion script)
-- converts existing rows; new writers validate against the shared Zod schema.
--
-- TRANSITION, NOT REPLACEMENT
-- ---------------------------
-- params_json, notes, and reps_scheme are KEPT during the transition. Readers
-- prefer prescription_json when present and fall back to the legacy fields
-- otherwise. A later migration drops the legacy columns once every reader and
-- the iOS contract have moved over.
--
-- block_exercises gains a row-level `needs_review` flag: the backfill sets it
-- true when a row's per-set detail can't be parsed cleanly (it keeps the
-- best params-only prescription and leaves the original text intact — never
-- fabricates reps/loads). template_segments has no per-row notes column for
-- this, so its flagged ids are collected in the backfill report instead.
-- (`blocks.needs_review` from 0038 stays as the block-level flag.)
--
-- Idempotent: `if not exists` everywhere; the migrate runner journals by stem.

begin;

alter table block_exercises
  add column if not exists prescription_json jsonb null;

alter table block_exercises
  add column if not exists needs_review boolean not null default false;

alter table template_segments
  add column if not exists prescription_json jsonb null;

-- Partial indexes: fast "which rows still lack a structured prescription" and
-- "which rows are pending review" scans during the transition.
create index if not exists block_exercises_needs_review_idx
  on block_exercises (needs_review)
  where needs_review = true;

create index if not exists block_exercises_prescription_null_idx
  on block_exercises (id)
  where prescription_json is null;

create index if not exists template_segments_prescription_null_idx
  on template_segments (id)
  where prescription_json is null;

commit;
