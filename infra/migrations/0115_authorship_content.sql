-- 0115: authorship columns on COACH-AUTHORED CONTENT.
--
-- The HOT layer of the registry (see 0114): each important content entity gains
-- the standard authorship quartet so `recordEdit()` is uniform and <AuthorStamp>
-- reads one shape everywhere:
--   created_by_user_id  / created_by_kind   — the original author (set once).
--   last_edited_by_user_id / last_edited_by_kind — who last touched it.
-- *_by_user_id → users(id); *_by_kind → actor_kind (0114).
--
-- Backfill: where the table already carried a coach owner (coach_id), the existing
-- content is attributed to that coach's user (created_by), so the sello shows a
-- real author on day one for pre-existing rows. Rows with no owner (e.g. Pablo's
-- global block library, coach_id NULL) stay unattributed and render no sello.
--
-- NOT here (deferred to avoid colliding with #34's test/template work): `templates`
-- and `methodology_tests`. Those get stamped once #34 lands.
--
-- Additive + idempotent. Runner strips begin/commit and wraps in one transaction.

begin;

-- Reusable: add the authorship quartet to a table (all nullable, FK-safe).
-- (Written out per-table below rather than as a function so the migration reads
--  as plain DDL and each table is greppable.)

-- blocks — also lacks updated_at; add it + the shared trigger so last-edit time is
-- maintained like every other content table.
alter table blocks
  add column if not exists updated_at             timestamptz not null default now(),
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'blocks_set_updated_at') then
    create trigger blocks_set_updated_at before update on blocks
      for each row execute function set_updated_at();
  end if;
end $$;

alter table microcycles
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table session_reports
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table athlete_coach_notes
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table coach_exercise_overrides
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

alter table coach_exercise_synonyms
  add column if not exists created_by_user_id     bigint references users(id) on delete set null,
  add column if not exists created_by_kind        actor_kind,
  add column if not exists last_edited_by_user_id bigint references users(id) on delete set null,
  add column if not exists last_edited_by_kind    actor_kind;

-- Backfill created_by from the existing coach owner (coach_id → coaches.user_id).
-- Only fills NULLs → re-running is safe. Kind is 'coach' (this content is authored
-- by the coach). last_edited is left NULL: we don't know who last touched historical
-- rows, and the sello falls back to the creator.
update blocks b
set created_by_user_id = c.user_id, created_by_kind = 'coach'
from coaches c
where b.coach_id = c.id and b.created_by_user_id is null;

update session_reports s
set created_by_user_id = c.user_id, created_by_kind = 'coach'
from coaches c
where s.coach_id = c.id and s.created_by_user_id is null;

update athlete_coach_notes n
set created_by_user_id = c.user_id, created_by_kind = 'coach'
from coaches c
where n.coach_id = c.id and n.created_by_user_id is null;

update coach_exercise_overrides o
set created_by_user_id = c.user_id, created_by_kind = 'coach'
from coaches c
where o.coach_id = c.id and o.created_by_user_id is null;

update coach_exercise_synonyms syn
set created_by_user_id = c.user_id, created_by_kind = 'coach'
from coaches c
where syn.coach_id = c.id and syn.created_by_user_id is null;

commit;
