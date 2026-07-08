-- 0103: partner invitation lifecycle — add the `declined` terminal state.
--
-- The lifecycle is: pending → { accepted | expired | cancelled | declined }.
--   * accepted  — invitee redeemed (both partner_id set).
--   * expired   — TTL elapsed (cron / lazy at read).
--   * cancelled — the INVITER withdrew their pending invitation.
--   * declined  — the INVITEE explicitly said no.
-- `cancelled` and `declined` are distinct on purpose: the inviter card shows
-- "la cancelaste" vs "{invitee} la rechazó", which are different truths.
--
-- Idempotent: drop-if-exists then re-add the CHECK with the widened value set.

begin;

alter table partner_invitations
  drop constraint if exists partner_invitations_status_chk;

alter table partner_invitations
  add constraint partner_invitations_status_chk
  check (status in ('pending', 'accepted', 'expired', 'cancelled', 'declined'));

commit;
