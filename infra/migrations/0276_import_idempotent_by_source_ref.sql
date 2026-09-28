-- 0276 — Una importación, una fila: idempotencia por (atleta, fuente, ref).
--
-- DECISIONS 2026-09-28 «Una importación de Salud, una fila». El volcado de Apple
-- Salud llega dos veces a la vez (el iPhone reenvía el lote antes de tener la
-- respuesta del primero). Las dos peticiones pasan la comprobación «¿ya existe este
-- `source_workout_ref`?» antes de que ninguna haya escrito, y nacen dos sesiones
-- importadas idénticas, creadas a milisegundos. Atleta 64: 2478/2479, 2510/2511,
-- 2642/2643, 2690/2691 y 2693/2694.
--
-- Lo que se arregla en el código: la importación inserta con
-- `on conflict … do nothing` contra el índice de abajo y, si pierde la carrera,
-- devuelve la fila que ya existe (`materialize-healthkit-workout.ts`, `ingest-coros.ts`).
--
-- La regla, la MISMA aquí y en el índice: una importación sin asignación
-- (`assignment_id is null`, `recorded_via = 'imported'`) es única por
-- (atleta, fuente, `source_workout_ref`). Entre duplicados se conserva la MÁS
-- ANTIGUA (`created_at`, y el id si empatan). Lo que colgara de las demás pasa a
-- ella si ella no lo tiene ya; lo repetido se va con su fila (on delete cascade).
--
-- Fuera de la regla (a propósito): las filas con asignación (1:1 por
-- `workout_executions_assignment_unique`) y las guardadas por la app (`live`,
-- `manual`), incluidas las «fuera del plan», que tienen su propia llave (0270).
-- Idempotente: reejecutarla no encuentra duplicados y el índice ya existe.

create temporary table _dup_imports on commit drop as
select d.id as dup_id, d.keeper_id
from (
  select id,
         first_value(id) over (
           partition by athlete_id, source, source_workout_ref
           order by created_at, id
         ) as keeper_id
  from workout_executions
  where assignment_id is null
    and recorded_via = 'imported'
    and source_workout_ref is not null
) d
where d.id <> d.keeper_id;

-- Tramos: los que la superviviente no tenga ya en esa posición y ronda.
update segment_executions s
set execution_id = x.keeper_id
from _dup_imports x
where s.execution_id = x.dup_id
  and not exists (
    select 1 from segment_executions k
    where k.execution_id = x.keeper_id
      and k.position = s.position
      and k.round_index is not distinct from s.round_index
  );

-- Trazas: las señales que la superviviente no tenga ya de esa fuente.
update workout_traces t
set execution_id = x.keeper_id
from _dup_imports x
where t.execution_id = x.dup_id
  and not exists (
    select 1 from workout_traces k
    where k.execution_id = x.keeper_id and k.signal = t.signal and k.source = t.source
  );

-- Ruta, capturas de sensor y confirmación: una por ejecución; solo si falta.
update workout_routes r
set execution_id = x.keeper_id
from _dup_imports x
where r.execution_id = x.dup_id
  and not exists (select 1 from workout_routes k where k.execution_id = x.keeper_id);

update workout_sensor_captures c
set execution_id = x.keeper_id
from _dup_imports x
where c.execution_id = x.dup_id
  and not exists (select 1 from workout_sensor_captures k where k.execution_id = x.keeper_id);

update wearable_activity_confirmations c
set execution_id = x.keeper_id
from _dup_imports x
where c.execution_id = x.dup_id
  and not exists (select 1 from wearable_activity_confirmations k where k.execution_id = x.keeper_id);

delete from workout_executions w
using _dup_imports x
where w.id = x.dup_id;

create unique index if not exists workout_executions_import_ref_uq
  on workout_executions (athlete_id, source, source_workout_ref)
  where assignment_id is null
    and recorded_via = 'imported'
    and source_workout_ref is not null;
