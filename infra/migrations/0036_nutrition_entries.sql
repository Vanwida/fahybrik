-- 0036: nutrition_entries — athlete daily food log.
--
-- The athlete records the meals that count toward a given day. An entry can be
-- created three ways from iOS:
--   * 'manual'  — the athlete types name + macros.
--   * 'barcode' — scanned via Open Food Facts (prefilled, then POSTed).
--   * 'photo'   — estimated by a vision LLM (confirmed by the athlete, then POSTed).
--
-- We store the *resolved* macros on explicit columns (Brain rule: explicit
-- columns, no JSON blobs except auditing payloads). `raw` keeps the original
-- OFF product / AI estimation for auditability only — it is never the source of
-- truth for the numbers shown.
--
-- `logged_for` is the DAY the meal counts toward (date, no time): the athlete
-- may log breakfast at noon for "yesterday". `created_at` is the audit clock.
--
-- Idempotent: IF NOT EXISTS on table/indexes, guarded DO-block for the CHECK.

begin;

create table if not exists nutrition_entries (
  id          bigserial primary key,
  athlete_id  bigint not null references athletes(id) on delete cascade,
  logged_for  date not null,
  name        text not null,
  kcal        numeric not null default 0,
  protein_g   numeric not null default 0,
  carbs_g     numeric not null default 0,
  fat_g       numeric not null default 0,
  quantity    numeric null,
  unit        text null,
  source      text not null default 'manual',
  barcode     text null,
  raw         jsonb null,
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'nutrition_entries_source_chk'
      and conrelid = 'public.nutrition_entries'::regclass
  ) then
    alter table nutrition_entries
      add constraint nutrition_entries_source_chk
      check (source in ('manual', 'barcode', 'photo'));
  end if;
end $$;

create index if not exists nutrition_entries_athlete_day_idx
  on nutrition_entries (athlete_id, logged_for);

commit;
