-- FAHYBRIK migration 0003: template day-pairing for 2x/day élite pattern
--
-- Élite hybrid athletes train 2 sessions/day, 4-5 days/week. The Today
-- screen and the coach assignment flow need to know AM/PM pairs so that
-- when one session is shown, its complementary partner is visible above
-- the fold (see /docs/ux/02-athlete-today.md).
--
-- Two columns added to `templates`:
--
-- * `day_position` text — short token like "ACC w3 d2 AM" / "REAL w1 d2 PM"
--   that humans can read at a glance. Optional (singleton sessions leave
--   it null). Free-form because the encoding may evolve and we don't
--   want a rigid enum.
--
-- * `paired_with_template_id` bigint self-FK — links AM↔PM templates that
--   are designed to be programmed together. Nullable; NULL means standalone.
--   ON DELETE SET NULL preserves the surviving template if its partner is
--   removed.

begin;

alter table templates
  add column day_position text,
  add column paired_with_template_id bigint
    references templates(id) on delete set null;

create index templates_day_position_idx
  on templates (day_position) where day_position is not null;

create index templates_paired_idx
  on templates (paired_with_template_id) where paired_with_template_id is not null;

-- Sanity: a template should not pair with itself.
alter table templates
  add constraint templates_paired_not_self_chk
  check (paired_with_template_id is null or paired_with_template_id <> id);

commit;
