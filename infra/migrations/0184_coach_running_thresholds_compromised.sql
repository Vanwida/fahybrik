-- 0184_coach_running_thresholds_compromised.sql
--
-- "CARRERA COMPROMETIDA" SE CONSTRUYE — mismo mecanismo que ya usa el cruce
-- carrera x entreno (shared/domain/race-transfer: classifyEffort,
-- FRESH_PRIOR_WORK_MAX_S), emparejando por la MISMA banda prescrita y
-- troceando por semana. Corrige la decision anterior de esta misma tarea:
-- "no hay parejas en la base de hoy" media la base de demo, no si el
-- mecanismo vale (Alex/team-lead, 12-ago). Ver docs/DECISIONS.md.
--
-- ANADE UNA COLUMNA a coach_running_thresholds (0183, YA APLICADA a
-- produccion) — no se edita esa migracion aplicada, se anade en una nueva,
-- mismo patron que cualquier ALTER posterior a un CREATE TABLE ya corrido.
--
-- min_pairs_for_compromised_trend: comparaciones (semana x banda, con
-- fresco Y fatigado) minimas antes de que la tarjeta se atreva a dibujar la
-- curva. Metodo del coach (HARD RULE No0): "otro entrenador competente lo
-- haria distinto?" -- si, un entrenador con atletas de fondo mas paciente
-- que uno con atletas de velocidad. El defecto (4) vive en shared/domain/
-- coach/running-thresholds.ts, NUNCA como default de columna.
--
-- Aditivo. Idempotente (add column if not exists). El runner envuelve el
-- fichero en UNA transaccion (sin begin/commit aqui) y corta por punto y
-- coma, asi que ningun comentario lleva uno.

alter table coach_running_thresholds
  add column if not exists min_pairs_for_compromised_trend smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coach_running_thresholds_min_pairs_chk'
  ) then
    alter table coach_running_thresholds
      -- Por debajo de 2 no hay pareja que llamar tendencia (una sola
      -- comparacion es una anecdota, no una curva). Por encima de 50, un
      -- atleta tardaria mas de un ano en alcanzar el minimo.
      add constraint coach_running_thresholds_min_pairs_chk
      check (min_pairs_for_compromised_trend is null or min_pairs_for_compromised_trend between 2 and 50);
  end if;
end $$;

-- Backfill: las filas ya escritas (coaches que ya guardaron sus otros tres
-- umbrales) heredan el defecto del sistema para la columna nueva, para que
-- "no tocar nada" siga significando "se comporta como el defecto" incluso
-- para quien ya habia guardado ANTES de que esta columna existiera.
update coach_running_thresholds
set min_pairs_for_compromised_trend = 4
where min_pairs_for_compromised_trend is null;

alter table coach_running_thresholds
  alter column min_pairs_for_compromised_trend set not null;

comment on column coach_running_thresholds.min_pairs_for_compromised_trend is
  'Comparaciones (semana x banda) minimas para dar la curva de "carrera comprometida" por buena. Metodo del coach; defecto en shared/domain/coach/running-thresholds.ts.';
