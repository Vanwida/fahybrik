-- 0162_communication_item_checkable.sql
--
-- NADA SE OBLIGA: EL CHECK ES DEL PASO, NO DEL TIPO (docs/DECISIONS.md,
-- 2026-08-09 "El comunicado del coach", correccion de Alex del mismo dia).
--
-- La 0160 dio por hecho que un protocolo ES una lista de casillas: el servidor
-- exigia >=1 paso y TODOS los pasos eran marcables. Eso deja fuera lo que un
-- entrenador escribe de verdad el dia antes de una carrera — cuando calentar,
-- cuanta agua, como comer — que es texto para LEER y no una lista de tareas.
-- Poner una casilla a "desayuna 3 h antes" no mide nada: mide si el atleta
-- toco un circulo.
--
-- Asi que lo marcable pasa a ser propiedad del PASO. Un protocolo puede ser
-- todo casillas, todo lectura, o mezcla (los tres primeros pasos se marcan y
-- el cierre es una nota que se lee). Lo que exige el servidor deja de ser
-- ">=1 paso" y pasa a ser "titulo + (texto O >=1 paso)": lo que no puede es
-- estar vacio.
--
-- MECANISMO vs METODO (CLAUDE.md, HARD RULE Nº0): que un paso PUEDA no llevar
-- casilla es mecanismo y por eso es columna. CUALES lleva casilla en SU
-- protocolo lo decide cada coach, paso a paso, y por eso es dato de la fila.
--
-- El campo solo significa algo en los pasos de un PROTOCOLO. Las opciones de
-- una pregunta y las secciones de una nota comparten esta tabla (0160) y lo
-- ignoran: una opcion se elige y una seccion se lee, ninguna de las dos se
-- marca. Ahi el valor es inerte, no un estado a interpretar.
--
-- Default `true` = las filas que ya existen se comportan EXACTAMENTE como hoy
-- (protocolo de casillas de punta a punta), asi que la migracion no cambia el
-- estado de ningun atleta ni el `done_at` derivado de nadie.
--
-- Aditivo: una columna nueva con default, sin reescritura de tabla (Postgres
-- 11+). No toca datos ni constraints existentes. Idempotente (`if not exists`).
-- El runner envuelve el fichero en UNA transaccion (sin begin/commit aqui) y
-- corta por punto y coma, asi que ningun comentario lleva uno.

alter table coach_communication_items
  add column if not exists checkable boolean not null default true;

comment on column coach_communication_items.checkable is
  'Solo en los pasos de un PROTOCOLO: true = el atleta lo marca con una casilla, false = es una linea que solo lee. Nada se obliga (docs/DECISIONS.md 2026-08-09). En las opciones de una pregunta y en las secciones de una nota es inerte: se guarda true y nadie lo mira. El done_at derivado de un protocolo cuenta SOLO los pasos con checkable = true, y un protocolo sin ninguno deja de derivarse.';
