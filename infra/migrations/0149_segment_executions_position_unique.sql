-- 0149: restore the ON CONFLICT arbiter 0001 already names.
--
-- EL PROBLEMA (FH-53, Owner 1-sep-2026)
-- ------------------------------------
-- POST /api/athlete/workouts/free devolvió 500 dos veces (05:56:37 y 05:56:44 UTC).
-- Postgres 42P10: no unique or exclusion constraint matching ON CONFLICT
-- (execution_id, position) in web/lib/sync/ingest-execution-segments.ts.
-- createFreeWorkout es UNA transacción: el 500 hace rollback. El retry contra
-- la API actual es otro 500. El JSON se queda en RAM / RequestQueue y no
-- puede persistir hasta que el árbitro exista.
--
-- 0001_init.sql ya declara:
--   constraint segment_executions_position_unique unique (execution_id, position)
-- Prod no lo tiene (si lo tuviera, 42P10 no existiría). Ninguna migración
-- posterior lo DROP. No se reescribe el ingest: ON CONFLICT ya está.
--
-- QUÉ HACE
-- --------
-- Restaura ESE unique, el mismo nombre y las mismas columnas. Idempotente
-- (pg_constraint IF NOT EXISTS). No es un segundo ingest ni otro motor.
--
-- Si el unique de 0001 YA está en prod y 42P10 sigue: el ON CONFLICT no
-- casa con el índice real — parar y verificar en DB; no parchear el ingest.
--
-- El runner journaliza por stem: 0149_segment_executions_position_unique.

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'segment_executions_position_unique'
  ) then
    alter table segment_executions
      add constraint segment_executions_position_unique unique (execution_id, position);
  end if;
end $$;

commit;
