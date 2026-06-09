-- 0035: athlete_invitations — coach → athlete account-claim flow.
--
-- The coach creates an athlete row (and its placeholder user) in the dashboard.
-- To let the real person take ownership of that account from the iOS app, the
-- coach issues an INVITATION TOKEN. The athlete opens the deeplink, signs in
-- with Apple, and the token binds their verified apple_user_id onto the
-- pre-provisioned target user. We key the claim on the TOKEN, not the email,
-- precisely so it survives Apple's Hide-My-Email (the relayed address can't be
-- matched against the coach-entered email).
--
-- Security model mirrors partner_invitations after 0032 (Finding M12):
--   * The plaintext token is NEVER stored — only its SHA-256 hash
--     (`token_sha256`, UNIQUE). A DB leak yields no redeemable tokens.
--   * Single-use: status flips pending → redeemed and can't be replayed.
--   * Expires (14 days). Lookups that find an expired pending row mark it
--     expired and reject.
--   * Apple identity is verified server-side BEFORE any linking happens
--     (lib/auth/apple.ts), and we refuse to hijack an apple_user_id already
--     bound to a different user.
--
-- Idempotent: IF NOT EXISTS / guarded DO-block for the status check.

begin;

create table if not exists athlete_invitations (
  id                  bigserial primary key,
  -- The athlete the coach is inviting (destination of the claim).
  athlete_id          bigint not null references athletes(id) on delete cascade,
  -- That athlete's user row — the one whose apple_user_id gets set on redeem.
  target_user_id      bigint not null references users(id) on delete cascade,
  -- The coach who created the invitation (audit / authorization trail).
  created_by_coach_id bigint not null references coaches(id),
  -- SHA-256 hex of the plaintext token. NEVER the plaintext (M12).
  token_sha256        text not null unique,
  status              text not null default 'pending',
  expires_at          timestamptz not null,
  redeemed_at         timestamptz null,
  created_at          timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'athlete_invitations_status_chk'
      and conrelid = 'public.athlete_invitations'::regclass
  ) then
    alter table athlete_invitations
      add constraint athlete_invitations_status_chk
      check (status in ('pending', 'redeemed', 'expired', 'revoked'));
  end if;
end $$;

-- token_sha256 already UNIQUE (implicit index), but spell out the lookup +
-- the two filtering indexes the lib queries by.
create unique index if not exists athlete_invitations_token_sha256_uidx
  on athlete_invitations (token_sha256);

create index if not exists athlete_invitations_athlete_idx
  on athlete_invitations (athlete_id);

create index if not exists athlete_invitations_status_idx
  on athlete_invitations (status);

commit;
