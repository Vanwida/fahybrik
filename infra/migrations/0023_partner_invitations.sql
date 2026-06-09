-- 0023: partner_invitations — Dobles W4 invitation flow.
--
-- 1st athlete pays + completes onboarding → generates a unique token + Resend
-- email to invite their partner. The invitee opens the link, signs in with
-- Apple, redeems the token (no payment), and completes THEIR OWN onboarding.
-- Both users get partner_id back-linked (A.partner=B, B.partner=A).
--
-- This migration only introduces the invitation lifecycle table. Stripe
-- billing + cascade cancellation arrive in W5.
--
-- Idempotent: IF NOT EXISTS / DO-blocks throughout.

begin;

create table if not exists partner_invitations (
  id                  bigserial primary key,
  inviter_user_id     bigint not null references users(id) on delete cascade,
  invitee_email       text not null,
  token               text not null unique,
  status              text not null default 'pending',
  expires_at          timestamptz not null default (now() + interval '14 days'),
  accepted_at         timestamptz null,
  accepted_user_id    bigint null references users(id) on delete set null,
  created_at          timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'partner_invitations_status_chk'
      and conrelid = 'public.partner_invitations'::regclass
  ) then
    alter table partner_invitations
      add constraint partner_invitations_status_chk
      check (status in ('pending', 'accepted', 'expired', 'cancelled'));
  end if;
end $$;

create index if not exists partner_invitations_token_idx
  on partner_invitations (token);

create index if not exists partner_invitations_inviter_idx
  on partner_invitations (inviter_user_id);

create index if not exists partner_invitations_invitee_email_idx
  on partner_invitations (lower(invitee_email))
  where status = 'pending';

commit;
