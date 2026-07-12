-- 0126: app_feedback — athlete-to-US product feedback (suggestions + bugs).
--
-- (Numbering note: the runner journals by filename stem; 0125 is the prior on
-- this branch → this is 0126.)
--
-- WHY
-- ---
-- This is NOT coach-facing training feedback (that is #58, on workout_executions).
-- This is the athlete telling the PRODUCT team "here's a bug" or "here's an idea"
-- from inside the app. It is ours (FAHYBRID/the builders), never surfaced to the
-- coach — a separate concern, hence its own table rather than a column on an
-- execution.
--
-- WHAT
-- ----
--   * athlete_user_id — the reporting athlete's USER id (FK users). ON DELETE SET
--                       NULL: deleting the user must not erase the feedback (it is
--                       product evidence), just anonymise it.
--   * kind            — 'suggestion' | 'bug' (closed set).
--   * body            — the report text, NOT NULL, 1..2000 chars.
--   * app_version     — client build string (nullable; older/other clients omit).
--   * screen          — where in the app it was sent from (nullable).
--   * created_at      — server receipt time.
--
-- Idempotent via `if not exists`; single-concern, revertible.

begin;

create table if not exists app_feedback (
  id              bigserial primary key,
  athlete_user_id bigint references users(id) on delete set null,
  kind            text not null check (kind in ('suggestion', 'bug')),
  body            text not null check (char_length(body) between 1 and 2000),
  app_version     text,
  screen          text,
  created_at      timestamptz not null default now()
);

-- Newest-first triage of a user's reports (and the global feed) is the only read
-- pattern; a created_at index keeps it cheap without over-indexing a low-volume
-- table.
create index if not exists app_feedback_created_at_idx
  on app_feedback (created_at desc);

commit;
