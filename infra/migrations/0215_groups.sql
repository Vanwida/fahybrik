-- 0215: GRUPOS — una secuencia gana nombre y deja de exigir la celda nivel×días.
--
-- POR QUÉ (docs/DECISIONS.md 2026-09-23, decisión 4 «Grupos primero»)
-- ------------------------------------------------------------------
-- Un grupo es un conjunto de atletas con su plan: una cadena ordenada de
-- programas. Eso YA existía como `program_sequences` (0059) + sus ítems + el
-- cursor por atleta (`athlete_sequence_progress`, 0060) — pero atado a una celda
-- nivel × días obligatoria. «Mi grupo HYROX de las mañanas» no se podía decir:
-- había que partirlo en 4 variantes de días y montar una cadena por variante.
--
-- QUÉ CAMBIA
--   · `name` (anulable): el nombre que el coach le pone al grupo. Sin nombre, la
--     pantalla dice «Nivel N3 · 5 días» con la etiqueta del coach.
--   · `level_id` y `days_per_week` pasan a ANULABLES. Con los dos puestos, la
--     celda sigue funcionando como regla OPCIONAL de pertenencia automática
--     (`resolveSequenceForAthlete`, Hoy «Asignación sugerida»). Sin ellos, el
--     grupo es de pertenencia manual.
--   · La unicidad (coach, nivel, días) solo aplica cuando están los dos: índice
--     único PARCIAL con el mismo nombre que la restricción que sustituye.
--   · Los días dejan la banda 3–6: eso era método de un coach (HARD RULE Nº0). El
--     límite que queda, 1–7, es mecanismo: una semana tiene siete días.
--   · «Subir de nivel» al acabar exige la regla (nivel + días): sin nivel no hay
--     «siguiente nivel» al que subir.
--   · `athlete_sequence_progress.status` gana 'left': el atleta SALIÓ del grupo
--     (el coach lo sacó o lo movió a otro). Distinto de 'completed' (acabó la
--     cadena por sí sola) y de 'detached' (se personalizó y puede volver).
--
-- ADITIVA E IDEMPOTENTE: ninguna fila cambia de significado; toda secuencia que
-- existe tiene nivel y días, así que sigue siendo una celda con su regla.

begin;

alter table program_sequences add column if not exists name text;

alter table program_sequences alter column level_id drop not null;
alter table program_sequences alter column days_per_week drop not null;

-- La restricción UNIQUE (coach, nivel, días) pasa a índice único PARCIAL: dos
-- grupos sin regla no chocan entre sí. Mismo nombre para que quien la busque la
-- encuentre. `on conflict` tiene que repetir el predicado (ver sequences.ts).
alter table program_sequences drop constraint if exists program_sequences_cell_uq;
drop index if exists program_sequences_cell_uq;
create unique index if not exists program_sequences_cell_uq
  on program_sequences (coach_id, level_id, days_per_week)
  where level_id is not null and days_per_week is not null;

-- Un nombre identifica un grupo en los selectores: dos iguales del mismo coach
-- (sin distinguir mayúsculas ni espacios de los bordes) serían indistinguibles.
create unique index if not exists program_sequences_name_uq
  on program_sequences (coach_id, lower(btrim(name)))
  where name is not null;

alter table program_sequences drop constraint if exists program_sequences_days_chk;
alter table program_sequences add constraint program_sequences_days_chk
  check (days_per_week is null or days_per_week between 1 and 7);

alter table program_sequences drop constraint if exists program_sequences_name_chk;
alter table program_sequences add constraint program_sequences_name_chk
  check (name is null or length(btrim(name)) between 1 and 80);

alter table program_sequences drop constraint if exists program_sequences_level_up_rule_chk;
alter table program_sequences add constraint program_sequences_level_up_rule_chk
  check (end_policy <> 'level_up' or (level_id is not null and days_per_week is not null));

alter table athlete_sequence_progress drop constraint if exists athlete_sequence_progress_status_chk;
alter table athlete_sequence_progress add constraint athlete_sequence_progress_status_chk
  check (status in ('active', 'completed', 'detached', 'left'));

comment on column program_sequences.name is
  '0215: nombre del grupo que pone el coach. NULL = sin nombre (la pantalla usa «Nivel X · N días»).';
comment on column program_sequences.level_id is
  '0215: anulable. Con days_per_week forma la regla OPCIONAL de pertenencia automática (celda nivel×días).';
comment on column program_sequences.days_per_week is
  '0215: anulable, 1–7. Con level_id forma la regla OPCIONAL de pertenencia automática.';
comment on column athlete_sequence_progress.status is
  'active = recorre el grupo | completed = acabó la cadena sola | detached = se personalizó, cursor guardado para volver (0164) | left = salió del grupo (0215).';

commit;
