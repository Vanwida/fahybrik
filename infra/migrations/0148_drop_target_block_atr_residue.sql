-- 0148 — ATR sale del esquema. La periodización es del coach, no del producto.
--
-- EL PROBLEMA
-- -----------
-- Las migraciones 0064 y 0068 retiraron ATR: borraron `atr_blocks`,
-- `atr_macrocycles` y el enum `atr_block_type`, y dejaron escrito el porqué en
-- docs/DECISIONS.md — «el ORDEN de los microciclos ES la periodización».
--
-- Pero aquella limpieza buscó por el NOMBRE, y la columna viva no se llama
-- `atr_` sino `target_block`. Así que sobrevivió entera, con su propio enum
-- `target_block ('ACC','TRANS','REAL','any')`, NOT NULL sobre `templates`. Un
-- mes después seguía ahí, y `compose-week` seguía metiendo `bloque=ACC` en el
-- prompt del modelo que compone la semana: imponerle a cualquier entrenador que
-- use el producto el vocabulario de una escuela concreta (Acumulación /
-- Transformación / Realización, periodización por bloques de Issurin).
--
-- Esto es exactamente lo que la HARD RULE Nº0 prohíbe: el MÉTODO es del coach y
-- vive en dato editable; el MECANISMO es nuestro y vive en código. «Cómo se
-- llaman sus fases» es método. Nunca debió ser un enum.
--
-- QUÉ DICEN LOS DATOS (verificado contra producción, 29-jul-2026)
-- ---------------------------------------------------------------
--   templates = 125 filas.
--     ACC 64 · TRANS 4 · REAL 1  → las 69, TODAS del coach 4 («alexsole»), la
--                                  cuenta de desarrollo más vieja.
--     any 56                     → coaches 60 / 61 / 62 (los reales) + 4 huérfanas.
--
-- Es decir: ningún coach de verdad ha clasificado nunca un entreno por fase ATR.
-- Lo que crean los coaches reales es 'any', que no dice nada. No se pierde
-- información de nadie — por eso la columna se BORRA en vez de migrarse.
--
-- LA DECISIÓN (Alex, 29-jul-2026)
-- -------------------------------
-- ATR desaparece del repo. Y no se sustituye por otro catálogo de fases: el
-- canal agnóstico para «qué toca esta semana» YA existe y ya llega al modelo —
-- `focus`, texto libre del coach (2-400 chars), que `planWeekSkeleton` le pasa
-- literal («Foco de la semana (literal del coach): …»). El coach lo dice con sus
-- palabras; nosotros no le ofrecemos un desplegable con la doctrina de otro.
--
-- QUÉ TOCA ESTA MIGRACIÓN
-- -----------------------
--   1. `templates.target_block` — la columna (y con ella el índice compuesto
--      `templates_format_block_idx`, que la incluye).
--   2. El enum `target_block`.
--   3. El valor `atr_transition_suggested` de `notification_type` — 0 filas lo
--      usan (en producción solo hay recovery_alert, chat_message y
--      plan_published). Postgres no sabe quitar un valor de un enum, así que se
--      recrea el tipo sin él.
--   4. Los enums HUÉRFANOS `block_status` y `macrocycle_status`: los dejó el
--      motor ATR al morir en 0068 y desde entonces no hay ni una columna que los
--      use. Residuo, no dato.
--   5. Los comentarios que enseñaban ATR al siguiente que los leyera.
--
-- LO QUE NO TOCA: `microcycles` (agnóstica desde 0068), `methodology_blocks`
-- (0 filas, nadie la lee; su forma de catálogo de fases queda REPORTADA aparte,
-- no se decide aquí) y las entradas de docs/DECISIONS.md que cuentan todo esto.

-- 1. La columna ------------------------------------------------------------
-- El índice `templates_format_block_idx (format, target_block)` cae solo con la
-- columna, pero se tira explícito para que quede dicho en vez de deducido.
drop index if exists templates_format_block_idx;

alter table templates drop column if exists target_block;

-- 2. El enum ---------------------------------------------------------------
drop type if exists target_block;

-- 3. `notification_type` sin `atr_transition_suggested` ---------------------
-- Recrear el tipo es la única forma de quitar un valor. Seguro aquí porque
-- ninguna fila lo usa; si alguna lo usara, el cast de abajo fallaría en vez de
-- perder el dato en silencio, que es como debe fallar.
do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notification_type' and e.enumlabel = 'atr_transition_suggested'
  ) then
    alter type notification_type rename to notification_type_pre_0148;

    create type notification_type as enum (
      'workout_assigned',
      'workout_edited',
      'chat_message',
      'event_reminder',
      'recovery_alert',
      'milestone',
      'system',
      'week_adjustment_pending',
      'monthly_block_pending',
      'intake_pending',
      'plan_published'
    );

    alter table notifications
      alter column type type notification_type
      using type::text::notification_type;

    drop type notification_type_pre_0148;
  end if;
end $$;

-- 4. Enums huérfanos del motor ATR -----------------------------------------
drop type if exists block_status;
drop type if exists macrocycle_status;

-- 5. Comentarios que enseñaban ATR -----------------------------------------
comment on table methodology_blocks is
  'Definiciones de bloque por coach (Áreas 2 y 3 — periodización y progresión intra-bloque). '
  'El tipo, la etiqueta y el orden son DATO DEL COACH: el producto no trae catálogo de fases.';

comment on table program_sequences is
  '0059: celda agnóstica de la matriz de periodización (coach × athlete_level × days_per_week). '
  'Los microciclos ordenados viven en program_sequence_items. end_policy/progression_* mueven el '
  'recorrido automático. Niveles vía athlete_levels (NO el enum program_level). El ORDEN de los '
  'microciclos ES la periodización: no hay entidad «fase» ni catálogo de fases (ver 0064/0068).';
