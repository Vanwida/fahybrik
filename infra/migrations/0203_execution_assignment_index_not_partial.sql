-- 0203 — Volver a poder guardar un entreno: el índice de la asignación deja de ser parcial.
--
-- La 0191 hizo `assignment_id` nulable (un entreno importado existe aunque nadie
-- lo prescribiera) y, de paso, convirtió `workout_executions_assignment_unique`
-- en un índice PARCIAL: `where assignment_id is not null`.
--
-- Postgres no puede inferir un índice parcial desde un `on conflict
-- (assignment_id)` que no repita su predicado: falla al planificar con
-- «there is no unique or exclusion constraint matching the ON CONFLICT
-- specification» (42P10). Y hay CUATRO sitios que insertan así — el cierre de
-- entreno de la app, Apple Salud, Garmin y Polar. Desde que la 0191 se aplicó
-- (13-ago-2026 07:11) ni un solo entreno llegó a guardarse: el atleta veía
-- «No se ha guardado. Reintenta.» y el reintento fallaba igual.
--
-- El predicado no aportaba nada. En Postgres los NULL son distintos entre sí, así
-- que un índice único normal sobre una columna nulable ya admite todas las
-- ejecuciones sin asignación que hagan falta. Se vuelve al índice llano: es lo
-- que esperan los cuatro `on conflict` que ya existen y lo que evita que el
-- próximo vuelva a romperse en silencio.
--
-- Invariante intacta: una ejecución por asignación; sin asignación, las que sean.

drop index if exists workout_executions_assignment_unique;

create unique index if not exists workout_executions_assignment_unique
  on workout_executions (assignment_id);

comment on index workout_executions_assignment_unique is
  'Una ejecución por asignación. LLANO a propósito: un índice parcial rompe la inferencia de on conflict (assignment_id) — ver 0191 y 0203.';
