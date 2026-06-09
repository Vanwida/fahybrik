-- 0041: multi-role RBAC (user_roles) + coach_allowlist approval workflow.
--
-- WHY multi-role. Until now a user had exactly ONE role (users.role enum:
-- athlete|coach|admin). The product now needs a single login to hold SEVERAL
-- roles at once — Alex is admin + coach + athlete with one account. A single
-- enum column can't express that, so roles move into a join table
-- `user_roles (user_id, role)`. The capability is multi-role; a normal user
-- still has exactly one row (a client athlete is never admin).
--
-- We do NOT drop users.role yet (compat): existing code paths read it, and
-- helpers fall back to it when user_roles is empty. The journal-tracked
-- migration runner records this file; re-running is a no-op.
--
-- WHY the allowlist gets a status. `coach_allowlist` (0040) was a flat "is this
-- email a coach?" list — every row was implicitly approved. The admin surface
-- needs an approval workflow: an email can be `pending` (requested, not yet a
-- coach), `approved` (may sign in as coach), or `rejected` (denied). The auth
-- gate (isCoachAllowlisted) now requires status='approved'. Existing rows are
-- backfilled to 'approved' so no current coach loses access.
--
-- Idempotent throughout: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- ON CONFLICT DO NOTHING, plus guarded DO blocks for constraints. The runner
-- (infra/scripts/migrate.ts) strips begin/commit and wraps the whole file in
-- one transaction.

begin;

-- -----------------------------------------------------------------------------
-- user_roles — multi-role join table.
-- -----------------------------------------------------------------------------
-- role is a plain text column with a CHECK (not the user_role enum) so adding a
-- future role doesn't require an ALTER TYPE; the CHECK keeps it constrained to
-- the known set. unique(user_id, role) makes "grant role" idempotent.
create table if not exists user_roles (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references users(id) on delete cascade,
  role        text not null check (role in ('admin', 'coach', 'athlete')),
  created_at  timestamptz not null default now(),
  constraint user_roles_user_role_unique unique (user_id, role)
);

-- Lookup index for hasRole / userRoles (the unique constraint already indexes
-- (user_id, role); this one supports "who has role X" admin queries).
create index if not exists user_roles_role_idx on user_roles (role);

-- Backfill: every existing user gets a user_roles row for their current
-- users.role. ON CONFLICT DO NOTHING → re-running is safe and won't duplicate.
-- deleted_at users are skipped (no point granting roles to deleted accounts).
insert into user_roles (user_id, role)
select id, role::text
from users
where deleted_at is null
on conflict (user_id, role) do nothing;

-- -----------------------------------------------------------------------------
-- coach_allowlist.status — approval workflow.
-- -----------------------------------------------------------------------------
-- Add the column nullable first so the table can be altered without a default
-- rewrite, backfill existing rows to 'approved', then make it NOT NULL with a
-- 'pending' default for future inserts.
alter table coach_allowlist
  add column if not exists status text;

-- A coach reviewing/approving entries (audit). Null for self-requested or
-- backfilled rows.
alter table coach_allowlist
  add column if not exists reviewed_by_user_id bigint
    references users(id) on delete set null;

alter table coach_allowlist
  add column if not exists reviewed_at timestamptz;

-- Backfill: every pre-existing allowlist row was implicitly approved (they were
-- the live coach set), so mark them approved. Only touch NULLs so re-running
-- doesn't clobber a later pending/rejected decision.
update coach_allowlist
set status = 'approved'
where status is null;

-- Now lock the column: default 'pending' for future self-service requests,
-- NOT NULL, and a CHECK constraining the value set.
alter table coach_allowlist
  alter column status set default 'pending';

do $$
begin
  -- Make NOT NULL only once everything is backfilled (the UPDATE above
  -- guarantees no NULLs remain).
  if exists (
    select 1 from information_schema.columns
    where table_name = 'coach_allowlist'
      and column_name = 'status'
      and is_nullable = 'YES'
  ) then
    alter table coach_allowlist alter column status set not null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'coach_allowlist_status_chk'
      and conrelid = 'public.coach_allowlist'::regclass
  ) then
    alter table coach_allowlist
      add constraint coach_allowlist_status_chk
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

-- Index the approval lookups the auth gate and admin list query by.
create index if not exists coach_allowlist_status_idx on coach_allowlist (status);

commit;
