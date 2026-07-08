-- 0114: authorship registry — the shared vocabulary + the permanent audit trail.
--
-- The registry has two layers (see lib/audit/record-edit.ts):
--   HOT  — denormalized `*_by_user_id` / `*_by_kind` columns on each important
--          entity (added in later migrations) → cheap inline "editado por X" sello.
--   COLD — an append-only `audit_log` row per stamped create/edit → the permanent,
--          auditable "quién hizo qué y cuándo" history (leads/athlete timelines).
--
-- This migration lays the shared pieces both layers need:
--   1. `actor_kind` enum — WHO acted. A person is a `users.id`, but not every
--      actor is a person: the IA proposes plans, the SYSTEM (Stripe/cron) writes
--      rows, and a public LEAD self-captures. So an actor = (kind, user_id?) where
--      user_id is null exactly when kind ∈ {ai, system, lead}. This generalises the
--      dobles precedent (0099's text check 'coach'|'athlete') to every surface.
--   2. `audit_log.actor_kind` — so the cold log can record ai/system/lead actions
--      that have no user_id. Nullable: legacy rows (only mass-adjustments today)
--      keep null and read as 'coach' by convention.
--
-- Additive + idempotent. The runner strips begin/commit and wraps in one txn.

begin;

-- WHO can be the author of a stamped action. Ordered person-first.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'actor_kind') then
    create type actor_kind as enum ('coach', 'athlete', 'ai', 'system', 'lead');
  end if;
end $$;

-- Cold layer: let the generic audit trail record non-person actors.
alter table audit_log
  add column if not exists actor_kind actor_kind;

commit;
