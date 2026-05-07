-- FAHYBRIK migration 0005: per-athlete private coach notes
--
-- Athlete deep-dive (UX spec /docs/ux/06-athlete-deep-dive.md, signed off
-- 2026-05-07) shows a "Notas Pablo (privado)" section: append-only, dated,
-- short text per note. Pablo writes them while diagnosing each athlete; they
-- are NEVER visible to the athlete.
--
-- Design choices:
--  * Independent table (not a column on athletes) so Pablo can keep a long
--    history per athlete without bloating row size.
--  * `created_at` is the displayed date — we don't track edits because the
--    UX is append-only ("+ nueva nota"). Soft-delete via `deleted_at` for the
--    rare typo case.
--  * `coach_id` is denormalised so a future multi-coach world can scope by
--    coach without a join (today there is only Pablo).

begin;

create table athlete_coach_notes (
  id          bigint generated always as identity primary key,
  athlete_id  bigint not null references athletes(id) on delete cascade,
  coach_id    bigint not null references coaches(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint athlete_coach_notes_body_chk check (length(btrim(body)) between 1 and 2000)
);

create index athlete_coach_notes_athlete_idx
  on athlete_coach_notes (athlete_id, created_at desc)
  where deleted_at is null;

create index athlete_coach_notes_coach_idx
  on athlete_coach_notes (coach_id, created_at desc)
  where deleted_at is null;

commit;
