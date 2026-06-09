-- FAHYBRIK migration 0008: race plan, race result, post-race debrief
--
-- UX spec /docs/ux/12-race-plan-and-prep.md (signed off 2026-05-07).
--
-- Three cross-cutting flows live in three sibling tables:
--
--   * race_plans      — Pablo + atleta colaboran asincrónicamente sobre el
--                        plan de carrera (pacing por estación, nutrición,
--                        kit, mental cues, contingencia). Editable hasta
--                        que Pablo aprueba (≥7 días pre-race) → locked.
--   * race_results    — registro del resultado (tiempo, posición, actuals
--                        por estación). Una fila por carrera realmente
--                        ejecutada. Vincula con el plan que se siguió.
--   * race_debriefs   — debrief subjetivo + lecciones, completado por el
--                        atleta el día siguiente. Alimenta el método de
--                        Pablo para próximo macrociclo.
--
-- Por qué jsonb, no columnas explícitas para station_pacing / nutrition /
-- kit / mental_cues / contingency / station_actuals:
--
--   * Cada sección es un payload estructurado con muchos sub-campos que
--     el coach edita libremente (16 estaciones HYROX × campos). Pasarlo
--     a columnas haría la migración de cada cambio de UX un dolor.
--   * La validación canónica vive en Zod (shared/schema/race-plan.ts y su
--     local-mirror web/lib/coach/race-plan-schema.ts hasta que #29 cierre).
--     Postgres sólo guarda; el server valida en cada upsert.
--   * Convención FAHYBRIK: jsonb permitido para ML feature vectors, embed-
--     dings y para cargas estructuradas de UX edit-only (templates ya lo
--     hace en params_json, mass adjustments en adjustment_payload).
--
-- Por qué `parent_race_plan_id` + version: Pablo a veces quiere comparar
-- el plan original con el revisado post-aprobación (post-mortem). Mantener
-- versiones permite que el debrief enlace con el plan exacto que se
-- siguió, no con el último editado.

begin;

-- =============================================================================
-- Race plans
-- =============================================================================

create type race_plan_status as enum (
  'draft',     -- editable por atleta + Pablo
  'approved',  -- Pablo aprobó, editable sólo por Pablo (correcciones menores)
  'locked'    -- carrera completada o congelada — sólo lectura
);

create table race_plans (
  id                      bigint generated always as identity primary key,
  athlete_id              bigint not null
                            references athletes(id) on delete cascade,
  target_event_id         bigint not null
                            references events(id) on delete restrict,
  -- Tiempo objetivo total en segundos (HYROX típico: 3000-4500). null mientras
  -- el plan está siendo iniciado.
  time_goal_seconds       integer,
  -- Pacing por estación: 16 entradas (8 runs + 8 stations) con target_pace,
  -- target_power, notes. Validado server-side en Zod.
  station_pacing_json     jsonb not null default '[]'::jsonb,
  -- Nutrición: { pre_3h, pre_45m, intra, post } con texto libre + opcionales.
  nutrition_json          jsonb not null default '{}'::jsonb,
  -- Kit checklist: array de { item, checked, notes }.
  kit_json                jsonb not null default '[]'::jsonb,
  -- Mental cues: array de { station_index, cue }.
  mental_cues_json        jsonb not null default '[]'::jsonb,
  -- Contingencia: array de { trigger, action }.
  contingency_json        jsonb not null default '[]'::jsonb,
  -- Pablo's race-day note (visible al atleta en race-day mode, pinned).
  coach_note              text,
  status                  race_plan_status not null default 'draft',
  approved_by_coach_id    bigint references coaches(id) on delete set null,
  approved_at             timestamptz,
  -- Versionado para snapshots inmutables. v1 = primer draft. parent apunta
  -- al plan padre cuando Pablo crea una revisión post-aprobación.
  version                 integer not null default 1,
  parent_race_plan_id     bigint references race_plans(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint race_plans_time_goal_chk
    check (time_goal_seconds is null or (time_goal_seconds between 1200 and 14400)),
  constraint race_plans_version_chk check (version >= 1),
  constraint race_plans_approved_chk check (
    (status = 'draft' and approved_at is null and approved_by_coach_id is null)
    or (status in ('approved', 'locked') and approved_at is not null
        and approved_by_coach_id is not null)
  )
);

-- Un solo plan activo (no locked) por (athlete, event). Versiones nuevas se
-- crean clonando con un parent; el partial unique deja que coexistan locked
-- + nuevo draft post-mortem si Pablo hace una revisión.
create unique index race_plans_active_unique_idx
  on race_plans (athlete_id, target_event_id)
  where status <> 'locked';

create index race_plans_athlete_idx
  on race_plans (athlete_id, created_at desc);

create index race_plans_event_idx
  on race_plans (target_event_id);

create index race_plans_pending_approval_idx
  on race_plans (approved_by_coach_id, approved_at desc)
  where status = 'approved';

create trigger race_plans_set_updated_at
  before update on race_plans
  for each row execute function set_updated_at();

-- =============================================================================
-- Race results
-- =============================================================================

create table race_results (
  id                      bigint generated always as identity primary key,
  race_plan_id            bigint not null
                            references race_plans(id) on delete restrict,
  athlete_id              bigint not null
                            references athletes(id) on delete cascade,
  -- Tiempo total de carrera en segundos.
  finish_time_seconds     integer not null,
  -- Posición y división (e.g. "Pro Men", "Open Women 30-34"). Optional para
  -- rogue races sin clasificación oficial.
  finish_position         integer,
  division                text,
  -- Actuals por estación: array paralelo a station_pacing del plan, cada
  -- entrada con duration_seconds + notes opcionales. La diferencia
  -- planned vs actual se computa en cliente al renderizar.
  station_actuals_json    jsonb not null default '[]'::jsonb,
  recorded_at             timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint race_results_finish_time_chk
    check (finish_time_seconds between 600 and 21600),
  constraint race_results_position_chk
    check (finish_position is null or finish_position > 0),
  constraint race_results_division_chk
    check (division is null or length(btrim(division)) between 1 and 80)
);

-- Un solo resultado por (athlete, plan). Si la carrera se repite, se crea
-- otro race_plan (otra versión o un evento distinto).
create unique index race_results_plan_unique_idx
  on race_results (race_plan_id);

create index race_results_athlete_idx
  on race_results (athlete_id, recorded_at desc);

create trigger race_results_set_updated_at
  before update on race_results
  for each row execute function set_updated_at();

-- =============================================================================
-- Race debriefs
-- =============================================================================

create type race_pace_realism as enum (
  'realistic',
  'too_ambitious',
  'too_conservative'
);

create table race_debriefs (
  id                  bigint generated always as identity primary key,
  race_result_id      bigint not null
                        references race_results(id) on delete cascade,
  athlete_id          bigint not null
                        references athletes(id) on delete cascade,
  -- Subjetivos 1-5 (mismo eje que daily check-in: 1=ninguno, 5=mucho/total).
  soreness_post       integer not null,
  energy_during       integer not null,
  -- Crisis = momento de "casi rendirse". Si had_crisis=false, los tres
  -- siguientes campos son null.
  had_crisis          boolean not null default false,
  crisis_at_station   integer,    -- 1..16
  crisis_notes        text,
  what_worked         text,
  what_to_improve     text,
  pace_realism        race_pace_realism not null,
  -- Lecciones libres adicionales (para narrativa que no encaja en bullets).
  lessons_text        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint race_debriefs_soreness_chk
    check (soreness_post between 1 and 5),
  constraint race_debriefs_energy_chk
    check (energy_during between 1 and 5),
  constraint race_debriefs_crisis_station_chk
    check (
      (had_crisis = false and crisis_at_station is null)
      or (had_crisis = true and crisis_at_station between 1 and 16)
    ),
  constraint race_debriefs_what_worked_chk
    check (what_worked is null or length(what_worked) <= 4000),
  constraint race_debriefs_what_to_improve_chk
    check (what_to_improve is null or length(what_to_improve) <= 4000),
  constraint race_debriefs_lessons_chk
    check (lessons_text is null or length(lessons_text) <= 4000),
  constraint race_debriefs_crisis_notes_chk
    check (crisis_notes is null or length(crisis_notes) <= 2000)
);

-- Un solo debrief por race_result.
create unique index race_debriefs_result_unique_idx
  on race_debriefs (race_result_id);

create index race_debriefs_athlete_idx
  on race_debriefs (athlete_id, created_at desc);

create trigger race_debriefs_set_updated_at
  before update on race_debriefs
  for each row execute function set_updated_at();

commit;
