-- 0196 — Una nota puede llevar el informe de UNA ocurrencia de test
-- (docs/superpowers/specs/2026-08-13-tests-son-un-loop.md).
--
-- Misma leccion que grafica (0169) y comparativa (0170): se guarda la CONFIG
-- (que assignment) y se resuelve al servir. Si se guardaran los cm, la nota
-- contaria un fantasma el dia que se corrija un frame.
--
-- NO es un sexto tipo de comunicado. Es una forma mas de seccion de NOTA.
-- El boton dice «Dar feedback».

alter table coach_communication_items
  drop constraint if exists coach_communication_items_display_chk;

alter table coach_communication_items
  add constraint coach_communication_items_display_chk
  check (display in ('texto', 'cifra', 'reparto', 'camino', 'grafica', 'comparativa', 'test_result'));

alter table coach_communication_items
  drop constraint if exists coach_communication_items_content_chk;

alter table coach_communication_items
  add constraint coach_communication_items_content_chk
  check (length(btrim(content)) > 0 or display in ('reparto', 'camino', 'grafica', 'comparativa', 'test_result'));

alter table coach_communication_items
  add column if not exists test_assignment_id bigint references workout_assignments(id) on delete set null;

comment on column coach_communication_items.test_assignment_id is
  'Solo con display = test_result: la ocurrencia cuyo informe se resuelve al servir. Null en el resto de formas.';
