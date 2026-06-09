-- FAHYBRIK migration 0012: events catalog — visibility curation + division
-- options + region + created-by-coach attribution.
--
-- Why this migration exists:
--
--   * Pablo curates which events are surfaced to athletes. We don't want
--     the iOS picker to show every HYROX worldwide — only the ones he has
--     deemed relevant for his elite cohort. Hence `is_visible_to_athletes`
--     (default false: invisible until Pablo flips it).
--
--   * HYROX has multiple divisions per event (Pro / Open / Doubles / Relay
--     / Mixed / Masters). The `division` text column on the original 0001
--     schema captures a single division string but elite athletes care about
--     which divisions are offered at each venue. We add `division_options`
--     (text[]) for the bouquet — `division` stays as the headline (usually
--     "Pro"). Athletes mark target with their priority + chosen division
--     in `athlete_target_events.notes` (free-form, Phase 1).
--
--   * `region` (text) groups events for filtering: 'EU', 'NA', 'APAC',
--     'LATAM', 'MEA'. Cheaper than a foreign key to a regions table — there
--     are 5 buckets and they don't change.
--
--   * `created_by_coach_id` records who manually added the event. Null for
--     seeded events (the script doesn't impersonate any coach).
--
--   * `athlete_target_events.division`: the division the athlete is racing
--     in (e.g., 'Pro', 'Doubles'). Optional — null when athlete hasn't
--     decided yet.
--
-- All new columns are additive + nullable / defaulted. No data migration
-- needed; existing rows (none in prod) are untouched.

begin;

-- =============================================================================
-- events: visibility + region + division_options + created-by attribution
-- =============================================================================

alter table events
  add column if not exists is_visible_to_athletes boolean not null default false,
  add column if not exists region                 text,
  add column if not exists division_options       text[] not null default '{}'::text[],
  add column if not exists created_by_coach_id    bigint references coaches(id) on delete set null;

create index if not exists events_visible_idx
  on events (is_visible_to_athletes, start_date)
  where is_visible_to_athletes = true;

create index if not exists events_region_idx
  on events (region, start_date);

-- =============================================================================
-- athlete_target_events: chosen division (free text; HYROX-validated server-side)
-- =============================================================================

alter table athlete_target_events
  add column if not exists division text;

commit;
