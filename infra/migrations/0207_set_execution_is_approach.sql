-- 0207 — LA APROXIMACIÓN SALE DEL VOLUMEN (card 155)
--
-- POR QUÉ
-- La card 151 marcó la serie de aproximación en la PRESCRIPCIÓN (`is_approach`
-- en el set). El teléfono la pinta. Al guardar, la marca se caía: `set_executions`
-- no tenía columna, el DTO de ejecución no la mandaba, y el volumen / la serie
-- más pesada / la carga de fuerza seguían sumando esos kilos como si fueran
-- trabajo. Dos series al 50 % inflaban el tonelaje.
--
-- QUÉ
-- Columna en la serie EJECUTADA. Es del SET, no del tramo: en un mismo ejercicio
-- conviven aproximaciones y trabajo. Default false = serie de trabajo, que es lo
-- que era todo hasta ahora — ninguna fila vieja cambia de significado.
--
-- NO es un status nuevo. `status` responde «¿la hizo?» (done/scaled/skipped).
-- `is_approach` responde «¿qué clase de serie es?». Mezclarlos fabricaría un
-- estado ilegal (¿skipped+approach?).
--
-- El escritor es el de siempre (`ingestExecutionSegments`, delete-then-insert
-- por tramo). No hay ON CONFLICT nuevo: el unique sigue siendo
-- (segment_execution_id, set_index).

alter table set_executions
  add column if not exists is_approach boolean not null default false;

comment on column set_executions.is_approach is
  'Serie de aproximación: se registró y se enseña, no cuenta en volumen, serie más pesada ni carga de fuerza. false = serie de trabajo.';
