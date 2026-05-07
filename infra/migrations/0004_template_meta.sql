-- FAHYBRIK migration 0004: template metadata + draft state for builder
--
-- Template builder (UX spec /docs/ux/05-template-builder.md, signed off
-- 2026-05-07) needs:
--
-- * `is_draft` — auto-saved drafts that haven't been explicitly saved yet
--   are flagged so the browse view can hide / mark them
-- * `is_partner_workout` — template designed for two athletes (sled relay,
--   paired carries); plan engine pairs athletes when scheduling
-- * `warmup` / `cooldown` — separate editable fields rendered above and
--   below the segments list (spec calls these out as distinct from segments)
-- * `coach_notes` — Pablo's private guidance per template (NOT shown to
--   athlete by default; surfaced as expand-on-tap)
-- * `meta_json` — escape hatch for future extensions (week-progression
--   policy, IA selector hints) without further migrations

begin;

alter table templates
  add column is_draft           boolean not null default false,
  add column is_partner_workout boolean not null default false,
  add column warmup             text,
  add column cooldown           text,
  add column coach_notes        text,
  add column meta_json          jsonb not null default '{}'::jsonb;

create index templates_drafts_idx
  on templates (coach_id, updated_at desc) where is_draft = true;

create index templates_partner_idx
  on templates (coach_id) where is_partner_workout = true;

commit;
