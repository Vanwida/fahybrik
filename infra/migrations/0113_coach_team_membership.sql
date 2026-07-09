-- 0113: coach team membership + person identity + allowlist as the real door.
--
-- WHY. Until now "a coach" was a 1:1 link users↔coaches (coaches.user_id UNIQUE),
-- and any authenticated Clerk user was auto-provisioned into their OWN new coach
-- (an empty workspace). The club now needs the opposite shape: THREE people
-- (alex@ / pablo@ / gerard@fahybrid.com) operating the SAME club (one coaches
-- row, one dataset) with per-person attribution — and NOBODY else getting in.
--
-- This migration lays the identity groundwork for that (the resolver + the
-- closed-door provisioning live in lib/auth). It is additive and idempotent:
--
--   1. coach_members — the org↔members join. The club stays the `coaches` row;
--      membership decides which humans may act as it. Backfilled from existing
--      coaches (each current coach becomes the 'owner' member of its own club),
--      so the resolver's membership path covers every pre-existing coach with no
--      behaviour change.
--   2. users.full_name — a person's name now lives on the identity row (users),
--      not only on coaches/athletes.full_name. Needed to attribute an edit to a
--      PERSON ("editado por Alex") regardless of role, and to unify coach+athlete
--      name resolution. Backfilled from coaches.full_name, then athletes.full_name.
--   3. coach_allowlist.coach_id — which club an approved email JOINS on first
--      login (so provisioning attaches to the existing club instead of minting a
--      new one). The allowlist becomes the real login door: the three team emails
--      are the ONLY approved rows; every other pre-existing row is rejected
--      (auditable, not deleted). hello@fahybrid.com is intentionally absent — it
--      stays a Resend sender identity only, never a login.
--
-- The single club is resolved dynamically as the coach linked to
-- hello@fahybrid.com (coach 60 in prod). On branches without it (demo/dev) that
-- resolves to NULL and the Clerk provisioning path is simply never exercised
-- there (demo uses its own gated cookie), so the seed is a harmless no-op.
--
-- Idempotent throughout (IF NOT EXISTS / ON CONFLICT / guarded DO blocks). The
-- runner strips begin/commit and wraps the file in one transaction.

begin;

-- -----------------------------------------------------------------------------
-- 1) coach_members — org↔members membership.
-- -----------------------------------------------------------------------------
-- membership_role is a plain text + CHECK (like user_roles) so a future role
-- ('assistant', …) needs no ALTER TYPE. Today every member has full permissions;
-- the column only distinguishes the founding 'owner' from added 'coach' members
-- for display/audit. removed_at is a soft-remove so attribution history stays
-- valid after someone leaves the club.
create table if not exists coach_members (
  coach_id         bigint not null references coaches(id) on delete cascade,
  user_id          bigint not null references users(id) on delete cascade,
  membership_role  text not null default 'coach'
    check (membership_role in ('owner', 'coach')),
  added_by_user_id bigint references users(id) on delete set null,
  added_at         timestamptz not null default now(),
  removed_at       timestamptz,
  primary key (coach_id, user_id)
);

-- "which clubs can this user act on" — the resolver's hot lookup.
create index if not exists coach_members_user_idx
  on coach_members (user_id)
  where removed_at is null;

-- Backfill: every existing coach is the founding member ('owner') of its own
-- club, dated from the coach row. ON CONFLICT DO NOTHING → re-running is safe and
-- never demotes a row already present.
insert into coach_members (coach_id, user_id, membership_role, added_at)
select c.id, c.user_id, 'owner', c.created_at
from coaches c
on conflict (coach_id, user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 2) users.full_name — person identity for attribution.
-- -----------------------------------------------------------------------------
alter table users
  add column if not exists full_name text;

-- Backfill from the role rows. Coaches first, then athletes (only fill NULLs so
-- re-running never clobbers a later manual edit). A users row that is neither
-- (rare) keeps NULL; the UI falls back to the email local-part.
update users u
set full_name = c.full_name
from coaches c
where c.user_id = u.id and u.full_name is null and c.full_name is not null;

update users u
set full_name = a.full_name
from athletes a
where a.user_id = u.id and u.full_name is null and a.full_name is not null;

-- -----------------------------------------------------------------------------
-- 3) coach_allowlist.coach_id + the three-email door.
-- -----------------------------------------------------------------------------
alter table coach_allowlist
  add column if not exists coach_id bigint references coaches(id) on delete set null;

do $$
declare
  club_id bigint;
begin
  -- The single club = the coach linked to the no-reply sender identity
  -- (hello@fahybrid.com → coach 60 in prod; NULL on demo/dev branches).
  select c.id into club_id
  from coaches c
  join users u on u.id = c.user_id
  where u.email = 'hello@fahybrid.com'
  limit 1;

  -- Close the door on everyone else: any previously-approved/pending row that is
  -- NOT one of the three team emails is rejected. Auditable (kept, not deleted).
  update coach_allowlist
  set status = 'rejected', reviewed_at = now()
  where email not in ('alex@fahybrid.com', 'pablo@fahybrid.com', 'gerard@fahybrid.com')
    and status <> 'rejected';

  -- The three team logins: approved and pointed at the single club. Seeded now so
  -- the door is ready before Alex creates the Zoho mailboxes; the users rows are
  -- minted on their first Clerk login and joined to club_id by the resolver.
  insert into coach_allowlist (email, status, coach_id)
  values
    ('alex@fahybrid.com',   'approved', club_id),
    ('pablo@fahybrid.com',  'approved', club_id),
    ('gerard@fahybrid.com', 'approved', club_id)
  on conflict (email) do update
    set status = 'approved',
        coach_id = excluded.coach_id;
end $$;

commit;
