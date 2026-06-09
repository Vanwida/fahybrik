-- 0040: coach_allowlist — self-serve coach provisioning.
--
-- Until now "being a coach" meant being listed in the COACH_ALLOWLIST env var:
-- adding a coach required editing an env var and redeploying. That's not
-- self-serve. This table moves the allowlist into the database so Alex (or any
-- authenticated coach — single-org Pablo) can add a coach from the dashboard
-- and have them sign in by magic-link WITHOUT a redeploy.
--
-- The auth check (lib/auth/magic-link.ts → isCoachAllowlisted) reads this table
-- OR the env var (env kept for backward-compat / break-glass). A new coach
-- added here can log in immediately; on first magic-link login their `coaches`
-- row is materialised by findOrCreateCoachByEmail.
--
-- Email is stored lowercase (the unique key). The app lowercases before insert,
-- and the CHECK below is a second safety net so a raw SQL insert can't smuggle
-- in a mixed-case duplicate.
--
-- Backfill: the three emails currently in COACH_ALLOWLIST are inserted so the
-- existing coaches aren't lost when the DB becomes the source of truth.
--
-- Idempotent: IF NOT EXISTS + ON CONFLICT DO NOTHING throughout.

begin;

create table if not exists coach_allowlist (
  id                  bigserial primary key,
  -- Lowercase email. UNIQUE — the allowlist key.
  email               text not null unique,
  -- The user who added this entry (audit trail). Null for the backfilled
  -- seed set and for entries added before we tracked the actor.
  created_by_user_id  bigint null references users(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- Second safety net: reject any non-lowercase email at the DB layer.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coach_allowlist_email_lower_chk'
      and conrelid = 'public.coach_allowlist'::regclass
  ) then
    alter table coach_allowlist
      add constraint coach_allowlist_email_lower_chk
      check (email = lower(email));
  end if;
end $$;

-- email is already UNIQUE (implicit index); spell out the lookup index the
-- auth check queries by for clarity.
create unique index if not exists coach_allowlist_email_uidx
  on coach_allowlist (email);

-- Backfill the current COACH_ALLOWLIST set so existing coaches survive the
-- cutover to DB-as-source-of-truth. ON CONFLICT DO NOTHING → re-running is safe.
insert into coach_allowlist (email)
values
  ('pablo@fabrik.training'),
  ('vanwida@aistudios.pro'),
  ('alexsole+coach@gmail.com')
on conflict (email) do nothing;

commit;
