-- 0211 — DESCRIPCIÓN DEL BLOQUE EN EL SEGMENTO (card 108)
--
-- POR QUÉ
-- Cada bloque lleva su propia descripción (`WeekDayPart.coach_note`). El
-- editor de día ya la guarda en `slots_json`. Al materializar el día a
-- `template_segments` esa prosa se perdía: no había columna, y
-- `assignment-detail.buildBlocks` emitía `coach_note: null` en todos los
-- bloques. El atleta solo veía la nota del ENTRENO
-- (`templates.coach_notes`) al inicio. iOS ya pinta `block.coachNote`
-- cuando llega; el servidor la tiraba.
--
-- QUÉ
-- La misma prosa en todas las filas del bloque, igual que `block_title`
-- (migración 0020). Nullable. Sin índice nuevo. Sin ON CONFLICT. Los
-- writers que no conocen la columna la dejan null. Vacío se queda vacío:
-- no se inventa texto ni se copia el del primer bloque a los siguientes.
--
-- NO es un campo nuevo de dominio. Es el hogar post-materialize del
-- `coach_note` que ya existía. La técnica del día sigue en
-- `template_segments.notes` (la nota de la línea).

alter table template_segments
  add column if not exists block_coach_note text;
