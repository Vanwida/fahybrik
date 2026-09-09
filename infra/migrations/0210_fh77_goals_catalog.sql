-- FH-77: goals / objectives catalog — extend events + races (no second catalog).
--
--   * event_type: +running, +ocr
--   * events_series_chk: Hunter, RFEA, Spartan, CrossFit circuit tokens
--   * events.athlete_id: private custom events (visible only to that athlete)
--   * races: objective_variant, division_label, distance_meters, homologada

begin;

-- Broad event categories for non-HYROX catalog rows.
alter type event_type add value if not exists 'running';
alter type event_type add value if not exists 'ocr';

-- Private athlete-created catalog entries (custom objective path).
alter table events
  add column if not exists athlete_id bigint references athletes (id) on delete cascade;

create index if not exists events_athlete_id_idx
  on events (athlete_id) where athlete_id is not null;

-- Expand series whitelist (soft — 'other' remains escape).
alter table events drop constraint if exists events_series_chk;

alter table events add constraint events_series_chk
  check (series is null or series in (
    'hyrox', 'deka', 'athx', 'deadly_dozen',
    'hunter_race', 'rfea', 'spartan',
    'cf_open', 'cf_quarterfinals', 'cf_semifinals', 'cf_games', 'cf_throwdown', 'wodapalooza',
    'other'
  ));

-- Per-athlete objective participation (beyond HYROX format/division/gender).
alter table races add column if not exists objective_variant text;
alter table races add column if not exists division_label text;
alter table races add column if not exists distance_meters integer;
alter table races add column if not exists homologada boolean;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'races_distance_meters_chk') then
    alter table races add constraint races_distance_meters_chk
      check (distance_meters is null or distance_meters > 0);
  end if;
end $$;

commit;
