-- 0259 — El método que ya era dato del coach, pero que un coach nuevo no podía
-- tocar (revisión pre-FLEXR, B «Four already-modelled method tables have no
-- editor»). Esta migración añade lo que les faltaba para tener editor:
--
--   1. `athlete_levels.archived_at` — retirar un nivel sin borrarlo. Un nivel en
--      uso (atletas, grupos, programas, bloques) no se puede borrar sin romper lo
--      que lo lleva; retirarlo lo saca de los selectores y de la sugerencia de
--      nivel, y lo deja en quien ya lo tiene. NULL = activo.
--   2. `athlete_levels.criteria_set_at` + `athlete_level_criteria` — qué marca
--      abre cada nivel (la sugerencia de nivel). Era una tabla de cortes cableada
--      (HYROX / 5K / 2K / sentadilla por sexo) que además buscaba los niveles por
--      el nombre literal 'N'+n. Ahora: `criteria_set_at` NULL = el nivel usa el
--      DEFECTO del producto según su posición en la escalera
--      (shared/domain/coach/level-criteria.ts); no nulo = usa SUS filas (que
--      pueden ser ninguna: «este nivel no se abre por marcas»).
--   3. `coaches.test_retest_weeks` — cada cuántas semanas repite un test el coach
--      (NULL = defecto de shared/domain/coach/test-cadence.ts). «Toca test» se
--      deriva de aquí en vez de un 35 fijo.
--   4. `coaches.max_microcycle_weeks` pasa a NULL = defecto (8, en
--      shared/domain/coach/program-months.ts): quita el `default` de columna y el
--      NOT NULL (DECISIONS 2026-08-09), y los 8 guardados pasan a NULL porque eran
--      el defecto, no una elección.
--
-- Sin `default` de columna en nada de lo nuevo. Idempotente.

-- 1 · Retirar un nivel ─────────────────────────────────────────────────────────
alter table athlete_levels add column if not exists archived_at timestamptz;

-- 2 · Qué marca abre cada nivel ──────────────────────────────────────────────────
alter table athlete_levels add column if not exists criteria_set_at timestamptz;

create table if not exists athlete_level_criteria (
  id         bigint generated always as identity primary key,
  coach_id   bigint not null references coaches(id) on delete cascade,
  level_id   bigint not null references athlete_levels(id) on delete cascade,
  -- Qué marca se lee. Conjunto CERRADO: son las marcas que el sistema sabe leer
  -- de un atleta (mecanismo); los números son del coach.
  metric     text   not null,
  -- 'male' | 'female' para las marcas de tiempo; NULL = vale para cualquiera
  -- (sentadilla relativa al peso, años entrenando).
  sex        text,
  -- El umbral de ENTRADA al nivel: segundos (tiempos, se entra por debajo),
  -- veces el peso corporal (sentadilla) o años (experiencia) — se entra por encima.
  threshold  numeric(8, 2) not null,
  created_at timestamptz not null default now(),
  constraint athlete_level_criteria_metric_chk
    check (metric in ('hyrox_s', 'run_5k_s', 'row_2k_s', 'squat_bw', 'experience_years')),
  constraint athlete_level_criteria_sex_chk check (sex is null or sex in ('male', 'female')),
  constraint athlete_level_criteria_threshold_chk check (threshold > 0),
  constraint athlete_level_criteria_uq unique nulls not distinct (level_id, metric, sex)
);

create index if not exists athlete_level_criteria_coach_idx on athlete_level_criteria (coach_id);

comment on table athlete_level_criteria is
  'Qué marca abre cada nivel del coach (sugerencia de nivel). Solo se leen las filas de un nivel con criteria_set_at no nulo; con NULL el nivel usa el defecto del producto por su posición (shared/domain/coach/level-criteria.ts). Métricas: conjunto cerrado de marcas que el sistema sabe leer.';

-- 3 · Cada cuánto se repite un test ──────────────────────────────────────────────
alter table coaches add column if not exists test_retest_weeks smallint[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'coaches_test_retest_weeks_chk') then
    alter table coaches
      add constraint coaches_test_retest_weeks_chk
      check (
        test_retest_weeks is null
        or (cardinality(test_retest_weeks) between 1 and 4
            and 1 <= all (test_retest_weeks) and 52 >= all (test_retest_weeks))
      );
  end if;
end $$;

comment on column coaches.test_retest_weeks is
  'Semanas a las que el coach repite un test (1-52, hasta 4 opciones). NULL = defecto de shared/domain/coach/test-cadence.ts. La más corta decide cuándo salta «Toca test».';

-- 4 · Duración máxima de un programa: NULL = defecto ─────────────────────────────
alter table coaches alter column max_microcycle_weeks drop default;
alter table coaches alter column max_microcycle_weeks drop not null;
update coaches set max_microcycle_weeks = null where max_microcycle_weeks = 8;

comment on column coaches.max_microcycle_weeks is
  'Semanas máximas de un programa (2-26). NULL = defecto del producto (MICROCICLO_DEFAULT_MAX_WEEKS, shared/domain/coach/program-months.ts).';
