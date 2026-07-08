-- 0118: athlete baja author — a dedicated slot, not last_edited_by.
--
-- A baja is a LIFECYCLE event, not a profile edit. Stamping it on
-- athletes.last_edited_by_* (as the first cut did) makes the ficha header's
-- "editado por X" light up on a baja and would be clobbered the moment profile-edit
-- stamping lands. Give the baja its own author columns next to the baja_at /
-- baja_reason it already has (0104), so last_edited_by stays exclusively for real
-- profile edits.
--
-- Additive + idempotent. Runner strips begin/commit, wraps in one transaction.

begin;

alter table athletes
  add column if not exists baja_by_user_id bigint references users(id) on delete set null,
  add column if not exists baja_by_kind    actor_kind;

commit;
