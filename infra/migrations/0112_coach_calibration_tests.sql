-- 0112_coach_calibration_tests.sql
--
-- #34 — los tests de calibracion pasan de CONSTANTE del sistema (FABRIK_WEEK1_BATTERY)
-- a CONTENIDO del coach, editable. Cada coach define su bateria: que tests existen, que
-- mide y calibra cada uno, y CUANDO se programan (semana + dia por test — el coach decide
-- el cuando, el sistema no impone semana-1). La constante degrada a set-semilla.
--
-- Modelo normalizado (columnas explicitas, sin blob JSON — regla del proyecto):
--   coach_calibration_tests  = un test del coach (identidad, contenido via template, agenda)
--   coach_test_results       = que produce cada test (1 fila por resultado; el 1RM produce 3)
-- Y una FK directa en workout_assignments (calibration_test_id) que sustituye al marcador
-- derivado del blob meta_json.store_results: is_test, el puente y battery-status leen la FK.
--
-- Aditivo + idempotente (create if not exists, do-block sobre pg_constraint, on conflict).
-- Backfill desde los templates de calibracion ya sembrados (meta_json ? 'calibration') y
-- desde las asignaciones de calibracion vivas (notes = 'calibration'), para no romper el
-- flujo en produccion. El runner envuelve el fichero en UNA transaccion (sin begin/commit).
-- Ningun literal de comentario lleva punto y coma (el splitter del runner corta por ';').

-- ── coach_calibration_tests: un test de calibracion del coach ─────────────────────
create table if not exists coach_calibration_tests (
  id                bigint generated always as identity primary key,
  coach_id          bigint not null references coaches(id) on delete cascade,
  -- Identidad del protocolo, unica por coach (tt_5k, one_rm_battery, o una del coach).
  slug              text not null,
  name              text not null,
  -- Brief cara-coach: que hace el atleta.
  protocol          text,
  -- Forma de la sesion de test (test | strength_block | hyrox_sim | ...). Enum existente.
  format            template_format not null default 'test',
  -- Modalidad principal para el punto de color / agrupacion (run|row|strength|hyrox|...).
  primary_modality  text,
  -- El CONTENIDO del entreno (segments). El scheduler clona este template por atleta.
  -- Nullable: un test puede existir en catalogo antes de tener su entreno montado.
  template_id       bigint references templates(id) on delete set null,
  -- Agenda que el COACH decide: en que semana del plan del atleta y que dia se auto-programa.
  week_offset       int not null default 1,
  day_of_week       int not null default 1,
  -- Si se auto-programa en el alta / primer plan del atleta.
  enabled           boolean not null default true,
  sort_order        int not null default 0,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint coach_calibration_tests_slug_uq unique (coach_id, slug),
  constraint coach_calibration_tests_dow_chk check (day_of_week between 1 and 7),
  constraint coach_calibration_tests_week_chk check (week_offset >= 1)
);

comment on table coach_calibration_tests is
  'Bateria de tests de calibracion del coach (#34). Contenido editable, sembrado con los 4 de FABRIK como punto de partida. El scheduler itera estas filas (no una constante) para auto-programar los tests en el plan del atleta segun week_offset/day_of_week.';

create index if not exists coach_calibration_tests_coach_idx
  on coach_calibration_tests (coach_id) where archived_at is null;

-- ── coach_test_results: que mide y calibra cada test (store_results normalizado) ──
create table if not exists coach_test_results (
  id            bigint generated always as identity primary key,
  test_id       bigint not null references coach_calibration_tests(id) on delete cascade,
  -- Slug canonico del benchmark que produce (run_5k, back_squat_1rm, hyrox_half_sim...).
  slug          text not null,
  label         text not null,
  -- Como se mide el resultado. time/load calibran hoy; distance/reps/calories = baseline.
  measure       text not null,
  -- Unidad del valor (seconds|meters|reps|calories|kg).
  unit          text not null,
  -- Que calibra: zonas por modalidad | 1RM | baseline (none). El nivel se recalcula siempre.
  derives       text not null default 'none',
  -- Modalidad para la derivacion de zonas (run|row|ski) o el maximo (strength). Opcional.
  modality      text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  constraint coach_test_results_slug_uq unique (test_id, slug),
  constraint coach_test_results_measure_chk
    check (measure in ('time', 'distance', 'reps', 'calories', 'load')),
  constraint coach_test_results_unit_chk
    check (unit in ('seconds', 'meters', 'reps', 'calories', 'kg')),
  constraint coach_test_results_derives_chk
    check (derives in ('run_zones', 'row_zones', 'ski_zones', 'strength_max', 'none'))
);

comment on table coach_test_results is
  'Resultados que produce un test de calibracion (#34). Un test produce >=1 (la bateria 1RM produce 3). measure/unit/derives son columnas explicitas (antes vivian en meta_json.store_results). time+load calibran zonas/1RM hoy; distance/reps/calories se guardan como baseline (derives=none) hasta que el puente los derive.';

create index if not exists coach_test_results_test_idx on coach_test_results (test_id);

-- ── workout_assignments.calibration_test_id: la FK que sustituye al marcador del blob ──
-- Antes: is_test / el puente / battery-status se derivaban de meta_json.store_results del
-- template clonado. Ahora la asignacion apunta directo al test del coach que la origino.
alter table workout_assignments
  add column if not exists calibration_test_id bigint
    references coach_calibration_tests(id) on delete set null;

comment on column workout_assignments.calibration_test_id is
  'Test de calibracion del coach que origino esta sesion (#34). Non-null => es una sesion de test (is_test): el puente lee su contrato de coach_test_results y calibra zonas/1RM/nivel. null = sesion normal.';

create index if not exists workout_assignments_calibration_test_idx
  on workout_assignments (calibration_test_id) where calibration_test_id is not null;

-- ── BACKFILL 1: tests del coach desde los templates de calibracion sembrados ──────
-- Cada template de libreria (instance_athlete_id null) con meta_json.calibration => un test.
-- La agenda (semana/dia) no vive en el template: se mapea por slug desde los 4 defaults de
-- FABRIK; cualquier otro cae al default (semana 1, lunes) y el coach lo ajusta.
insert into coach_calibration_tests
  (coach_id, slug, name, protocol, format, primary_modality, template_id, week_offset, day_of_week, sort_order)
select
  t.coach_id,
  t.meta_json ->> 'calibration',
  t.name,
  t.coach_notes,
  t.format,
  case t.meta_json ->> 'calibration'
    when 'tt_5k' then 'run' when 'tt_2k_row' then 'row'
    when 'one_rm_battery' then 'strength' when 'hyrox_half_sim' then 'hyrox' else null end,
  t.id,
  1,
  case t.meta_json ->> 'calibration'
    when 'one_rm_battery' then 2 when 'tt_5k' then 3
    when 'tt_2k_row' then 5 when 'hyrox_half_sim' then 6 else 1 end,
  case t.meta_json ->> 'calibration'
    when 'one_rm_battery' then 0 when 'tt_5k' then 1
    when 'tt_2k_row' then 2 when 'hyrox_half_sim' then 3 else 9 end
from templates t
where t.meta_json ? 'calibration'
  and t.instance_athlete_id is null
  and t.archived_at is null
on conflict (coach_id, slug) do nothing;

-- ── BACKFILL 2: resultados desde meta_json.store_results de cada template ─────────
insert into coach_test_results (test_id, slug, label, measure, unit, derives, modality, sort_order)
select
  cct.id,
  r.spec ->> 'slug',
  coalesce(r.spec ->> 'label', r.spec ->> 'slug'),
  coalesce(r.spec ->> 'measure', 'time'),
  coalesce(r.spec ->> 'unit', 'seconds'),
  coalesce(r.spec ->> 'derives', 'none'),
  r.spec ->> 'modality',
  (r.ord - 1)::int
from coach_calibration_tests cct
join templates t on t.id = cct.template_id
cross join lateral jsonb_array_elements(t.meta_json -> 'store_results')
  with ordinality as r(spec, ord)
where jsonb_typeof(t.meta_json -> 'store_results') = 'array'
on conflict (test_id, slug) do nothing;

-- ── BACKFILL 3: enlazar las asignaciones de calibracion vivas a su test del coach ─
-- Las sesiones ya programadas (notes = 'calibration') apuntan a un template clon cuyo
-- meta_json.calibration = slug. Se enlazan por (coach del atleta, slug) para que el puente
-- y is_test funcionen sobre la FK desde el minuto uno, sin depender del blob.
update workout_assignments wa
set calibration_test_id = cct.id
from templates t, athletes a, coach_calibration_tests cct
where wa.template_id = t.id
  and wa.athlete_id = a.id
  and t.meta_json ? 'calibration'
  and cct.coach_id = a.coach_id
  and cct.slug = t.meta_json ->> 'calibration'
  and wa.calibration_test_id is null;
