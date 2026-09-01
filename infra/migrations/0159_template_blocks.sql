-- 0159_template_blocks.sql
--
-- Circuito (docs/DECISIONS.md, 2026-08-07 "«Circuito» pasa a ser un tipo de
-- bloque real") extendido a la ruta Biblioteca/tests (`template_segments`) —
-- esa decision auditó el editor de dia (slots_json) y dejó ESTA ruta pendiente
-- a proposito: "no se improvisa una columna nueva sin ver antes cuanto
-- contenido circuito real vive ahi". Ya se audito (sesion #34 tests, 8-ago):
-- 20 grupos circuito reales en la Biblioteca del coach 60 + 10 ya materializados
-- por atleta, con el rounds real metido en el TITULO del bloque a falta de
-- columna ("A · Sled (6 rounds)", "B · WOD HYROX (4 rounds)") — el mismo
-- sintoma que motivo la decision original.
--
-- Tabla hija normalizada (columnas explicitas, sin blob — convencion del
-- proyecto, ver coach_calibration_tests/coach_test_results en 0112): una fila
-- por (template_id, block_position) que es un circuito real. rounds y los
-- descansos viven UNA vez aqui, nunca duplicados por fila en template_segments
-- (esa duplicacion es exactamente el bug de applyHead que la decision original
-- corrigio en el otro lado). pacing es el fork objetivo: por_tarea = la ronda
-- dura lo que tarde el atleta, sin reloj (el caso HYROX real); por_reloj = cada
-- estacion tiene un tope duro (work_seconds).
--
-- SIN BACKFILL, a proposito: parsear "rounds" del titulo es extraer un hecho
-- que el coach ya escribio, pero `pacing` NO esta en ningun sitio — inventarlo
-- (aunque sea con un default razonable) rompe la regla "no se sabe es un valor
-- de primera clase" (docs/DECISIONS.md, 2026-07-28). Los 30 grupos reales se
-- quedan SIN fila aqui (= sin config de circuito, comportamiento legacy
-- intacto) hasta que el coach los complete desde el editor nuevo.
--
-- Aditivo. El runner envuelve el fichero en UNA transaccion (sin begin/commit
-- aqui). Ningun comentario lleva punto y coma.

create table if not exists template_blocks (
  id                              bigint generated always as identity primary key,
  template_id                     bigint not null references templates(id) on delete cascade,
  block_position                  int not null,
  rounds                          int not null,
  pacing                          text not null,
  work_seconds                    int,
  rest_between_stations_seconds   int,
  rest_between_rounds_seconds     int,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint template_blocks_uq unique (template_id, block_position),
  constraint template_blocks_rounds_chk check (rounds between 1 and 60),
  constraint template_blocks_pacing_chk check (pacing in ('por_tarea', 'por_reloj')),
  constraint template_blocks_work_requires_reloj_chk
    check (pacing = 'por_reloj' or work_seconds is null),
  constraint template_blocks_work_positive_chk check (work_seconds is null or work_seconds > 0),
  constraint template_blocks_rest_stations_chk
    check (rest_between_stations_seconds is null or rest_between_stations_seconds >= 0),
  constraint template_blocks_rest_rounds_chk
    check (rest_between_rounds_seconds is null or rest_between_rounds_seconds >= 0)
);

comment on table template_blocks is
  'Config de bloque Circuito para la ruta Biblioteca/tests (template_segments) — docs/DECISIONS.md 2026-08-07. Una fila por (template_id, block_position) que es un circuito multi-estacion real: rounds unico, pacing (por_tarea sin reloj | por_reloj con work_seconds), descansos separados entre estaciones y entre rondas. Ausencia de fila = sin config de circuito (comportamiento legacy: estaciones sueltas). Sin backfill a proposito, ver cabecera del fichero.';

create index if not exists template_blocks_template_idx on template_blocks (template_id);
