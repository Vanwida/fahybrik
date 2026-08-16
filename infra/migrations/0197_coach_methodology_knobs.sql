-- 0197_coach_methodology_knobs.sql
--
-- LOS 5 MANDOS DE METODOLOGIA SON METODO, NO MECANISMO (CLAUDE.md, HARD RULE Nº0).
--
-- Spec: docs/metodologia-coach.html. Un coach vacio no hereda la escuela de
-- otro club. Los defectos viven en shared/domain/coach/methodology-knobs.ts,
-- NUNCA como default de columna. NO copiar coach_methodology (0048): aquella
-- horneo 37 columnas en el DDL, no llego a tener escritor ni UI, y esta muerta.
--
-- Esta tabla es SOLO el almacen de los 5 mandos. No cablea plan, chat ni MCP.
-- No es un catalogo de fases. Vocabulario reutilizado, no reinventado:
--   hr_anchor / run_pace_anchor  — literales de 0048
--   block_end_policy             — program_sequences.end_policy (0059)
--   address_form                 — literales de 0048
--   sleep_min_hours              — nombre de 0048, sin el resto de gates
--
-- Una fila por coach. Guardar reemplaza el conjunto entero. Columnas
-- explicitas. default_test_slugs es text[] (lista de slugs, no un JSONB).
--
-- Aditivo. No toca ninguna tabla existente. Idempotente (create table if not
-- exists). El runner envuelve el fichero en UNA transaccion (sin begin/commit
-- aqui) y corta por punto y coma, asi que ningun comentario lleva uno.

create table if not exists coach_methodology_knobs (
  id                    bigint      generated always as identity primary key,
  coach_id              bigint      not null references coaches(id) on delete cascade,

  -- 1. Zonas
  hr_zone_count         smallint    not null,
  hr_anchor             text        not null,
  run_pace_anchor       text        not null,

  -- 2. Tests por defecto (vacio = ninguna bateria de marca)
  default_test_slugs    text[]      not null,

  -- 3. Fin de bloque
  block_end_policy      text        not null,

  -- 4. Cuando bajar el dia
  sleep_min_hours       numeric(3,1) not null,
  hrv_drop_pct          numeric(5,2) not null,
  load_tsb_floor        numeric(5,1) not null,

  -- 5. Tono al atleta
  tone_register         text        not null,
  address_form          text        not null,

  updated_at            timestamptz not null default now(),

  constraint coach_methodology_knobs_coach_uq unique (coach_id),
  constraint coach_methodology_knobs_hr_zone_count_chk
    check (hr_zone_count between 3 and 7),
  constraint coach_methodology_knobs_hr_anchor_chk
    check (hr_anchor in ('lthr', 'max_hr', 'tanaka')),
  constraint coach_methodology_knobs_run_pace_anchor_chk
    check (run_pace_anchor in ('5k', '10k', '1mile', 'threshold')),
  constraint coach_methodology_knobs_tests_len_chk
    check (cardinality(default_test_slugs) <= 20),
  constraint coach_methodology_knobs_block_end_chk
    check (block_end_policy in ('repeat', 'level_up', 'stop')),
  constraint coach_methodology_knobs_sleep_chk
    check (sleep_min_hours between 3 and 12),
  constraint coach_methodology_knobs_hrv_chk
    check (hrv_drop_pct between -50 and 0),
  constraint coach_methodology_knobs_tsb_chk
    check (load_tsb_floor between -50 and 0),
  constraint coach_methodology_knobs_tone_chk
    check (tone_register in ('neutral', 'directo', 'cercano', 'tecnico')),
  constraint coach_methodology_knobs_address_chk
    check (address_form in ('tu', 'usted'))
);

comment on table coach_methodology_knobs is
  'Los 5 mandos de metodologia por coach (spec docs/metodologia-coach.html). Una fila por coach. Sin fila = defectos de mecanismo en shared/domain/coach/methodology-knobs.ts, nunca la escuela de otro club. No rellena las 37 columnas de coach_methodology.';
