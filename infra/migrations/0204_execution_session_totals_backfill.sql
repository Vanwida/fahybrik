-- 0204_execution_session_totals_backfill.sql
--
-- RELLENA LOS TOTALES DE CABECERA DE LAS EJECUCIONES QUE YA EXISTEN (card 126).
--
-- `workout_executions.avg_hr` / `max_hr` / `total_distance_m` / `total_calories`
-- existen desde la migración 0154. Para las 55 ejecuciones grabadas EN VIVO por
-- la app (`recorded_via = 'live'`) estaban las cuatro vacías — verificado el
-- 20-ago-2026, 0 de 55 — porque nadie las AGREGABA desde los tramos/trazas al
-- guardar. Esa ausencia ya la corrige el código (`web/lib/execution/session-
-- totals.ts`, invocado desde `record-workout-execution.ts` e
-- `ingest-workout-traces.ts`) para todo lo que se guarde de aquí en adelante.
-- Esta migración aplica EXACTAMENTE las mismas reglas al histórico.
--
-- LAS MISMAS TRES REGLAS QUE EL CÓDIGO — ninguna relajada:
--
--   1. FC media/máxima: traza de pulso de mejor fidelidad (`workout_traces`,
--      signal='hr') si existe; si no, media ponderada por duración de los
--      tramos con pulso + el mayor `max_hr` de tramo; si no hay ni traza ni
--      tramo con pulso, NULL. Banda fisiológica 30..260 — fuera de banda, NULL.
--
--   2. Distancia total: solo cuando UNA SOLA modalidad
--      (`segment_executions.modality`) midió distancia en toda la sesión. Dos
--      o más modalidades con distancia → NULL a propósito (sumar metros de
--      correr con metros de remo no es una distancia).
--
--   3. Calorías totales: suma de `segment_executions.calories` cuando algún
--      tramo las trae; si ninguno, NULL. Nunca estimadas desde pulso o peso.
--
-- SOLO RELLENA HUECOS. Cada columna se actualiza con
-- `coalesce(columna_actual, calculado)` — una ejecución IMPORTADA (HealthKit,
-- Garmin, FIT) que ya trae estos totales desde su propio ingestor NUNCA se
-- toca. Esto es aditivo puro sobre lo que hoy está vacío.
--
-- POR QUÉ NO ES "RECALCULAR SIEMPRE" COMO EL CÓDIGO. El código recomputa en
-- cada guardado porque la evidencia puede cambiar (una traza que llega después
-- de los tramos). Esta migración es un rellenado de UNA SOLA VEZ sobre datos ya
-- congelados — repetirla no cambia nada (todas las columnas objetivo ya habrán
-- dejado de ser NULL), así que es idempotente por construcción sin necesidad de
-- volver a evaluar la evidencia en cada corrida.
--
-- LO QUE ESTA MIGRACIÓN NO TOCA, Y POR QUÉ: `moving_seconds`. Existe desde la
-- misma 0154 y también está vacía, pero calcularla honestamente exige detectar
-- pausas/paradas en la traza de velocidad o posición — una regla que nadie ha
-- especificado todavía (a diferencia de las tres de arriba, que sí vienen
-- dictadas). Inventar un umbral de "en movimiento" aquí sería exactamente lo
-- que el proyecto prohíbe: método sin que nadie lo haya decidido. Se deja para
-- cuando esa regla exista.
--
-- Idempotente (los `where columna is null` hacen que una segunda corrida no
-- encuentre nada que tocar) y de solo lectura sobre los datos fuente (nunca
-- escribe en `segment_executions` ni en `workout_traces`).

begin;

-- ---------------------------------------------------------------------------
-- Regla 1 — FC media/máxima.
-- ---------------------------------------------------------------------------

with hr_fidelity as (
  select
    id,
    execution_id,
    offsets_s,
    "values",
    case source
      when 'concept2' then 3
      when 'polar'    then 3
      when 'strap'    then 3
      when 'garmin'   then 2
      when 'coros'    then 2
      when 'suunto'   then 2
      when 'wahoo'    then 2
      when 'whoop'    then 2
      when 'amazfit'  then 2
      when 'healthkit' then 1
      when 'oura'      then 1
      else 0 -- treadmill | gps | manual: no miden pulso, nunca ganan
    end as fidelity
  from workout_traces
  where signal = 'hr'
),
best_hr_trace as (
  -- Una fila por ejecución: la de mayor fidelidad: empates los rompe el id más
  -- reciente (misma regla que `bestHrTrace` en TypeScript).
  select distinct on (execution_id) execution_id, "values", fidelity
  from hr_fidelity
  order by execution_id, fidelity desc, id desc
),
hr_from_trace as (
  select
    b.execution_id,
    round(avg(v))::int as avg_hr,
    round(max(v))::int as max_hr
  from best_hr_trace b, unnest(b."values") as v
  where b.fidelity > 0
  group by b.execution_id
),
hr_from_segments as (
  select
    s.execution_id,
    -- Media ponderada por duración del tramo; si el peso total es 0 (sin
    -- ventana medible en ningún tramo con pulso), cae a la media simple.
    coalesce(
      round(
        sum(s.avg_hr * greatest(extract(epoch from (s.ended_at - s.started_at)), 0))
        / nullif(sum(case when s.avg_hr is not null
                          then greatest(extract(epoch from (s.ended_at - s.started_at)), 0)
                          else null end), 0)
      ),
      round(avg(s.avg_hr))
    )::int as avg_hr,
    max(s.max_hr) as max_hr
  from segment_executions s
  where s.avg_hr is not null or s.max_hr is not null
  group by s.execution_id
),
hr_resolved as (
  select
    we.id as execution_id,
    coalesce(t.avg_hr, g.avg_hr) as avg_hr,
    coalesce(t.max_hr, g.max_hr) as max_hr
  from workout_executions we
  left join hr_from_trace t on t.execution_id = we.id
  left join hr_from_segments g on g.execution_id = we.id
  where we.avg_hr is null or we.max_hr is null
)
update workout_executions we
set
  avg_hr = coalesce(we.avg_hr, case when r.avg_hr between 30 and 260 then r.avg_hr else null end),
  max_hr = coalesce(we.max_hr, case when r.max_hr between 30 and 260 then r.max_hr else null end),
  updated_at = now()
from hr_resolved r
where we.id = r.execution_id
  and (r.avg_hr is not null or r.max_hr is not null);

-- ---------------------------------------------------------------------------
-- Regla 2 — distancia total, solo si UNA sola modalidad midió distancia.
-- ---------------------------------------------------------------------------

with distance_by_modality as (
  select execution_id, modality, sum(distance_meters) as dist
  from segment_executions
  where distance_meters is not null
  group by execution_id, modality
),
distance_modality_count as (
  select execution_id, count(*) as n_modalities
  from distance_by_modality
  group by execution_id
),
distance_resolved as (
  select d.execution_id, d.dist as total_distance_m
  from distance_by_modality d
  join distance_modality_count c
    on c.execution_id = d.execution_id and c.n_modalities = 1
)
update workout_executions we
set
  total_distance_m = d.total_distance_m,
  updated_at = now()
from distance_resolved d
where we.id = d.execution_id
  and we.total_distance_m is null;

-- ---------------------------------------------------------------------------
-- Regla 3 — calorías totales, suma de las que trae algún tramo.
-- ---------------------------------------------------------------------------

with calories_resolved as (
  select execution_id, sum(calories) as total_calories
  from segment_executions
  where calories is not null
  group by execution_id
)
update workout_executions we
set
  total_calories = c.total_calories,
  updated_at = now()
from calories_resolved c
where we.id = c.execution_id
  and we.total_calories is null;

commit;
