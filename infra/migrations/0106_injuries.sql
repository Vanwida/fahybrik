-- 0106: injury management (#16) — first-class lifecycle, not a static jsonb snapshot.
--
-- Root cleanup: injuries lived in athletes.injuries_json (an onboarding snapshot with
-- ZERO lifecycle). #16 needs register → adapt → track → discharge → history, so we
-- promote injuries to a real `injuries` table + an `injury_updates` timeline, on ONE
-- canonical taxonomy (the 4 divergent ones — funnel lesion_zonas, iOS chips, the dead
-- shared `severity`, funnel lesion_actual — collapse here). The jsonb is backfilled
-- into the table at the end (best-effort zone normalization) and then left read-only.

begin;

-- Canonical zone taxonomy (ASCII codes; display labels live in shared/domain).
-- Superset of funnel lesion_zonas + iOS chips + the contraindication matcher.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'injury_zone') then
    create type injury_zone as enum (
      'rodilla', 'tobillo_pie', 'lumbar', 'cadera', 'hombro',
      'muneca', 'codo', 'isquios', 'gemelo', 'cuello', 'otra'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'injury_severity') then
    create type injury_severity as enum ('leve', 'moderada', 'severa');
  end if;
  if not exists (select 1 from pg_type where typname = 'injury_status') then
    create type injury_status as enum ('activa', 'en_recuperacion', 'resuelta');
  end if;
end $$;

-- One row per injury EPISODE. A re-injury after 'resuelta' is a NEW row (history keeps both).
create table if not exists injuries (
  id                bigint generated always as identity primary key,
  athlete_id        bigint not null references athletes(id) on delete cascade,
  zone              injury_zone not null,
  type              text,                              -- diagnosis, free text (tendinitis, esguince…)
  severity          injury_severity not null default 'leve',
  status            injury_status not null default 'activa',
  onset_date        date not null default current_date,
  resolved_date     date,                              -- set when status → resuelta
  expected_return   date,                              -- coach estimate; feeds a suggested pause end_date
  registered_by     text not null,                     -- who created it
  note              text,
  -- Optional link to the #13 pause opened for a long injury (never automatic).
  pause_id          bigint references athlete_pauses(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint injuries_registered_by_chk check (registered_by in ('athlete', 'coach')),
  constraint injuries_resolved_chk check (resolved_date is null or status = 'resuelta')
);
create index if not exists injuries_athlete_idx on injuries (athlete_id);
create index if not exists injuries_athlete_open_idx on injuries (athlete_id)
  where status in ('activa', 'en_recuperacion');

comment on table injuries is
  'Lesión del atleta (#16), episodio con ciclo de vida (activa → en_recuperacion → resuelta; reapertura = fila nueva). severity y status son ejes SEPARADOS. Sustituye el snapshot estático de athletes.injuries_json (backfilleado aquí).';

-- Evolution timeline: every note / status change until discharge.
create table if not exists injury_updates (
  id            bigint generated always as identity primary key,
  injury_id     bigint not null references injuries(id) on delete cascade,
  status        injury_status,                         -- non-null when this entry changes status
  note          text,
  recorded_by   text not null,
  recorded_at   timestamptz not null default now(),
  constraint injury_updates_recorded_by_chk check (recorded_by in ('athlete', 'coach'))
);
create index if not exists injury_updates_injury_idx on injury_updates (injury_id, recorded_at);

-- Injury-adapted sessions: tag the assignment so adherence does NOT penalize it.
--   'rest'        → excluded from the adherence denominator (like a pause day)
--   'substituted' → swapped to rehab; still counts (execution-driven)
--   'softened'    → reduced volume/intensity; still counts
alter table workout_assignments add column if not exists injury_id bigint references injuries(id) on delete set null;
alter table workout_assignments add column if not exists injury_adaptation text;
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'workout_assignments_injury_adaptation_chk'
  ) then
    alter table workout_assignments add constraint workout_assignments_injury_adaptation_chk
      check (injury_adaptation is null or injury_adaptation in ('rest', 'substituted', 'softened'));
  end if;
end $$;
comment on column workout_assignments.injury_adaptation is
  'Adaptación por lesión (#16). rest = excluida de adherencia (como día de pausa). substituted/softened = cuenta vía su ejecución. null = sesión normal.';

-- ── Backfill: athletes.injuries_json → injuries (best-effort, one-time) ──────────
-- Only migrate rows not already migrated (idempotent guard via a marker note).
insert into injuries (athlete_id, zone, type, severity, status, onset_date, resolved_date, registered_by, note, created_at)
select
  a.id,
  case
    when lower(coalesce(e->>'area','')) ~ '(rodilla|knee)'                 then 'rodilla'::injury_zone
    when lower(coalesce(e->>'area','')) ~ '(tobillo|pie|ankle|foot)'       then 'tobillo_pie'::injury_zone
    when lower(coalesce(e->>'area','')) ~ '(lumbar|espalda|low.?back|back)' then 'lumbar'::injury_zone
    when lower(coalesce(e->>'area','')) ~ '(cadera|hip)'                    then 'cadera'::injury_zone
    when lower(coalesce(e->>'area','')) ~ '(hombro|shoulder)'              then 'hombro'::injury_zone
    when lower(coalesce(e->>'area','')) ~ '(muñeca|muneca|wrist)'          then 'muneca'::injury_zone
    when lower(coalesce(e->>'area','')) ~ '(codo|elbow)'                    then 'codo'::injury_zone
    when lower(coalesce(e->>'area','')) ~ '(isquio|hamstring)'             then 'isquios'::injury_zone
    when lower(coalesce(e->>'area','')) ~ '(gemelo|calf)'                   then 'gemelo'::injury_zone
    when lower(coalesce(e->>'area','')) ~ '(cuello|neck)'                   then 'cuello'::injury_zone
    else 'otra'::injury_zone
  end,
  nullif(e->>'type',''),
  case
    when lower(coalesce(e->>'type','')) ~ '(sever|grave|limita)' then 'moderada'::injury_severity
    else 'leve'::injury_severity
  end,
  case when coalesce((e->>'active')::boolean, false) then 'activa'::injury_status else 'resuelta'::injury_status end,
  coalesce(a.created_at::date, current_date),
  case when coalesce((e->>'active')::boolean, false) then null else coalesce(a.created_at::date, current_date) end,
  'coach',
  '[migrado de onboarding]' || case when nullif(e->>'note','') is not null then ' · ' || (e->>'note') else '' end,
  now()
from athletes a
cross join lateral jsonb_array_elements(coalesce(a.injuries_json, '[]'::jsonb)) as e
where jsonb_typeof(a.injuries_json) = 'array'
  and (e->>'area') is not null
  and not exists (
    select 1 from injuries i
    where i.athlete_id = a.id and i.note like '[migrado de onboarding]%'
  );

commit;
