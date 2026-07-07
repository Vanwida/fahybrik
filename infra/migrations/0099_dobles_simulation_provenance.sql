-- 0099: dobles_simulations edit PROVENANCE (pair-owned reparto).
--
-- WHAT CHANGES
-- ------------
-- The Dobles simulation (the 8-station reparto) is no longer coach-only: the
-- coach RECOMMENDS, but EITHER athlete of the pair can adjust it from the app.
-- One shared strategy per pair (unchanged storage, A/B-neutral), last-write-wins
-- (a pair negotiation, not an approval workflow). To keep every surface honest
-- about WHO last touched it ("Propuesta de Pablo" / "Ajustado por Guillem hace
-- 2h"), we stamp provenance on each write.
--
-- Two nullable columns (additive, non-breaking — existing rows read as unknown
-- provenance, which the app renders as the neutral coach-authored default since
-- created_by_coach_id is always present):
--   · last_edited_by_kind : 'coach' | 'athlete' — which side made the last edit.
--   · last_edited_by_user_id : the users.id of that coach-user or athlete-user.
-- `updated_at` already carries the timestamp.
--
-- Idempotent: add-column-if-not-exists + a CHECK on the kind. No data backfill —
-- legacy rows keep null provenance and fall back to the coach-authored label.

begin;

alter table dobles_simulations
  add column if not exists last_edited_by_kind text,
  add column if not exists last_edited_by_user_id bigint;

-- Constrain the kind to the two valid values (nullable → legacy rows allowed).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dobles_simulations_last_edited_by_kind_check'
  ) then
    alter table dobles_simulations
      add constraint dobles_simulations_last_edited_by_kind_check
      check (last_edited_by_kind is null or last_edited_by_kind in ('coach', 'athlete'));
  end if;
end $$;

comment on column dobles_simulations.last_edited_by_kind is
  '0099: who made the last edit — coach | athlete. Null on legacy rows (read as coach-authored). Storage stays A/B-neutral; either athlete of the pair may edit (last-write-wins).';
comment on column dobles_simulations.last_edited_by_user_id is
  '0099: users.id of the coach-user or athlete-user who last edited. Pairs with last_edited_by_kind + updated_at for the "Propuesta de X / Ajustado por Y" provenance label.';

commit;
