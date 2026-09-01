-- 0149_coach_import_defaults.sql
--
-- Importing a week from a PHOTO: the vision step transcribes, the shared
-- notation grammar types only what the photo actually shows (never a guess —
-- see shared/domain/import/result.ts). But a photo routinely crops or blurs
-- three things a coach otherwise writes once and repeats by habit: the rest
-- between sets, how close to failure a strength set goes, and the rep count
-- when a cell shows sets but no number. The importer fills those gaps with a
-- value and flags the item PROPOSED for the coach to confirm — it never ships
-- un-reviewed.
--
-- These values are METHOD, not mechanism (FAHYBRIK HARD RULE Nº0): another
-- coach runs a different rest protocol or a different default RIR. So this
-- table is the coach's override, and the system defaults it falls back to
-- live in code (shared/domain/coach-import-defaults.ts), NEVER as a DDL
-- `default` here — same shape and same reasoning as `coach_guidance`
-- (migration 0123). Do NOT copy `coach_methodology` (migration 0048): that
-- table baked its defaults into the DDL, shipped no writer or UI, and is dead.
--
-- One row per coach. A save always replaces the whole set of six values
-- (there is no partial patch — matches `coach_guidance`'s "whole list
-- replaced" contract). Explicit columns, no JSONB (repo convention).
--
-- Idempotent (create table if not exists). The runner wraps the file in ONE
-- transaction and splits on semicolons.

create table if not exists coach_import_defaults (
  id                    bigint generated always as identity primary key,
  coach_id              bigint not null references coaches(id) on delete cascade,
  rest_strength_s       smallint not null,
  rest_conditioning_s   smallint not null,
  rest_core_mobility_s  smallint not null,
  rir_strength          numeric(3,1) not null,
  rep_range_min         smallint not null,
  rep_range_max         smallint not null,
  updated_at            timestamptz not null default now(),
  unique (coach_id),
  check (rest_strength_s between 0 and 600),
  check (rest_conditioning_s between 0 and 600),
  check (rest_core_mobility_s between 0 and 600),
  check (rir_strength between 0 and 10),
  check (rep_range_min between 1 and 50),
  check (rep_range_max between 1 and 50),
  check (rep_range_min <= rep_range_max)
);
