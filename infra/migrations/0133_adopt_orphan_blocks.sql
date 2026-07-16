-- 0133_adopt_orphan_blocks.sql
--
-- Adopta los bloques HUÉRFANOS (`blocks.coach_id is null`) al coach cuyo método
-- son. Backfill de datos reales, una sola vez — no cambia el esquema.
--
-- (Numbering note: 0132 es exercise_ownership en esta misma rama; el runner
-- journaliza por nombre de fichero, así que este es el 0133.)
--
-- EL PROBLEMA
-- -----------
-- La biblioteca es contenido POR COACH: `listBlocks` filtra `where coach_id = $1`
-- (lib/dashboard/coach/blocks.ts). Un bloque con `coach_id is null` no lo ve
-- NADIE — no hay ninguna pantalla que liste huérfanos. Son 99 filas de contenido
-- real invisibles desde que se importaron.
--
-- QUÉ SON LAS 99 (verificado contra prod, no supuesto)
-- ----------------------------------------------------
--   · 97 (created_at 2026-05-29) — la importación del Excel del coach. Llevan su
--     procedencia en `source_ref` ("S1 – Martes", "Semanas 7-9"…).
--   · 2  (created_at 2026-06-03, ids 389/390) — "Test pista 3'/9'" y "Test pista
--     30' (umbral)", sembrados para la calibración de la semana 1. También son
--     suyos y están tipados (7 y 5 ejercicios), así que se adoptan igual: dejarlos
--     huérfanos los condena a no verse nunca. OJO: NO son tests de calibración en
--     el sentido de `coach_calibration_tests` (eso cuelga de `templates`, no de
--     `blocks`) — son bloques de entreno con forma de test.
--
-- POR QUÉ POR NOMBRE Y NO POR ID
-- ------------------------------
-- Hay DOS universos de base de datos (web/main y demo) y los ids de coach NO
-- coinciden entre ellos: un `coach_id = 60` literal podría adoptar el contenido
-- al coach EQUIVOCADO en el otro universo. El nombre identifica a la persona en
-- cualquiera de los dos. Va guardado: si ese coach no existe en esta base, la
-- migración no hace nada (no-op) en vez de fallar o adivinar.
--
-- IDEMPOTENTE: al terminar no quedan huérfanos, así que una segunda pasada no
-- toca ninguna fila.

do $$
declare
  v_coach   bigint;
  v_orphans int;
  v_adopted int;
begin
  select count(*) into v_orphans from blocks where coach_id is null;
  if v_orphans = 0 then
    raise notice '0133: no hay bloques huérfanos — nada que adoptar.';
    return;
  end if;

  select id into v_coach
    from coaches
   where full_name = 'Pablo Amigo'
   order by id
   limit 1;

  if v_coach is null then
    raise notice '0133: % bloques huérfanos pero el coach destino no existe en esta base — no-op.', v_orphans;
    return;
  end if;

  update blocks
     set coach_id   = v_coach,
         updated_at = now()
   where coach_id is null;

  get diagnostics v_adopted = row_count;
  raise notice '0133: % bloques adoptados por el coach %.', v_adopted, v_coach;
end $$;
