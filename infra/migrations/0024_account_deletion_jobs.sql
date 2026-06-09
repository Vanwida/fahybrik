-- 0024: account_deletion_jobs — RGPD / Apple Guideline 5.1.1(v) right-to-delete.
--
-- When an athlete asks to delete their account from iOS we DON'T hard-delete
-- immediately:
--   1. `users.deleted_at` is set + email anonymized to `deleted-{id}@fahybrid.com`
--      so the address can be reused for a new account (RGPD: right to erasure +
--      right to re-register without the prior PII blocking it).
--   2. A row in this table schedules the IRREVERSIBLE hard-delete 30 days out,
--      giving the user a recovery window and giving us a paper trail.
--   3. A future cron (Phase 1c) reads this table and physically deletes the
--      `users` row (ON DELETE CASCADE wipes athletes, workouts, biometrics,
--      checkins, chat messages of which the user was sender, notifications,
--      sessions, etc. — the schema's cascades are tuned for this).
--
-- This migration only introduces the queue + indexes. The worker is separate.

begin;

create table if not exists account_deletion_jobs (
  id              bigserial primary key,
  user_id         bigint not null references users(id) on delete cascade,
  reason          text null,
  scheduled_for   timestamptz not null,
  status          text not null default 'pending',
  processed_at    timestamptz null,
  error           text null,
  created_at      timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_deletion_jobs_status_chk'
      and conrelid = 'public.account_deletion_jobs'::regclass
  ) then
    alter table account_deletion_jobs
      add constraint account_deletion_jobs_status_chk
      check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled'));
  end if;
end $$;

-- One active (pending/processing) job per user — re-requesting deletion while
-- still in the grace window is a no-op (handled at the app layer too, but the
-- partial unique index is the hard guarantee).
create unique index if not exists account_deletion_jobs_one_active_per_user_idx
  on account_deletion_jobs (user_id)
  where status in ('pending', 'processing');

-- Worker scan index: "pending jobs whose grace window has elapsed".
create index if not exists account_deletion_jobs_due_idx
  on account_deletion_jobs (scheduled_for)
  where status = 'pending';

commit;
