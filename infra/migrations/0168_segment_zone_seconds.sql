-- 0168_segment_zone_seconds.sql
--
-- LOS MINUTOS EN ZONA, GUARDADOS. Y LAS BANDAS, QUE SON DEL COACH.
--
-- Dos tablas de la misma obra: dónde viven los segundos que el motor calcula, y
-- dónde vive el método con el que los calcula.
--
--
-- ── 1. `segment_zone_seconds` ────────────────────────────────────────────────
--
-- POR QUE POR TRAMO Y NO POR EJECUCION. El plan aprobado
-- (docs/design/zonas-feedback-model.html §5A) enseña la grafica con un filtro por
-- tipo de entreno — Correr, Fuerza, WOD, Ergo — y una sesion de HYROX lleva los
-- cuatro dentro. Con una fila por ejecucion ese filtro solo podria contar la
-- sesion entera como carrera o dejarla fuera, y las dos respuestas son falsas.
-- La modalidad vive en `segment_executions.modality`, asi que el grano tiene que
-- ser el tramo: la semana es una suma y la ejecucion tambien. El propio plan lo
-- pide con todas las letras: «si mañana el coach quiere ver el reparto de un
-- mes, de un tramo o de un tipo de sesion, la suma ya esta donde toca».
--
-- Es ademas donde ya vive el unico reparto de zonas que hoy existe: el que
-- congela el movil dentro de `raw_lap_data_json -> zone_seconds`, por tramo (24
-- tramos de 241, medido el 10-ago-2026).
--
-- POR QUE `total_s` ES GENERADA. Es la altura de la barra apilada, y tiene que
-- ser exactamente la suma de lo que se apila. Calculada por Postgres no puede
-- discrepar de sus sumandos ni cuando la escribe otro camino.
--
-- POR QUE `no_hr_s` SE GUARDA Y LA DURACION DEL TRAMO NO SE USA COMO TOTAL.
-- Medido: el tramo 574 tiene `ended_at = started_at` (duracion 0) y 565 segundos
-- de zonas congeladas por el movil, y el 530 tiene 391 s de ventana con 392 s de
-- zonas. Restar la duracion daria un hueco NEGATIVO. El hecho medido son los
-- segundos por banda mas los que no se pudieron repartir, y la ventana del tramo
-- se queda donde estaba, en `segment_executions`.
--
-- LO QUE SE ESTAMPA, Y POR QUE. Los minutos se calculan con el ancla vigente EN
-- LA FECHA DEL ENTRENO y se congelan. Si luego llega un test de umbral, el
-- historico NO se reescribe solo: recomputar es un gesto explicito (una grafica
-- que cambia de forma sin que nadie la toque deja de ser evidencia). Para que se
-- pueda saber con que se conto, cada fila lleva de que peldaño salio el ancla y
-- con cuantas pulsaciones. Las BANDAS no se copian aqui: son la fila del coach
-- en `coach_hr_method`, y `computed_at` contra su `updated_at` dice si una fila
-- se calculo antes de que el coach las moviera — un dato, no diez columnas
-- repetidas en cada tramo.
--
-- SIN ANCLA NO HAY ZONAS, y el CHECK lo impone: sin ancla estampada, las cinco
-- bandas tienen que ser 0 y todo el tiempo cae en `no_hr_s`. Una banda
-- etiquetada pero fabricada es peor que una ausente.
--
--
-- ── 2. `coach_hr_method` ─────────────────────────────────────────────────────
--
-- HARD RULE Nº0. Clasificar un latido en una banda es MECANISMO. DONDE cortan
-- las bandas y que reparto se persigue es METODO: otro entrenador competente
-- pone el techo de Z2 en otro sitio y persigue otro reparto, asi que estos
-- numeros dejan de ser `const` y nacen como dato editable.
--
-- Hasta hoy vivian cableados en dos sitios y uno de ellos por duplicado: las
-- fracciones en `shared/domain/methodology/hr-zones.ts` y el objetivo 80/0/20 a
-- la vez en `shared/domain/coach/polarization.ts` y en
-- `web/lib/dashboard/coach/deep-dive-performance.ts`, con otro nombre.
--
-- Mismo patron que 0161 (`coach_signal_thresholds`) y 0149
-- (`coach_import_defaults`): una fila por coach, guardar reemplaza el conjunto
-- entero, columnas explicitas sin JSONB, y LOS DEFECTOS NO VIVEN AQUI como
-- `default` de columna sino en `shared/domain/coach/hr-method.ts`. Un coach que
-- no toca nada se comporta exactamente igual que antes de esta migracion. NO
-- copiar `coach_methodology` (0048), que horneo sus defectos en el DDL, nunca
-- tuvo escritor y esta muerta.
--
-- Aditiva. No toca ninguna tabla existente. Idempotente.

create table if not exists segment_zone_seconds (
  id                     bigint      generated always as identity primary key,
  segment_execution_id   bigint      not null references segment_executions(id) on delete cascade,

  -- Segundos en cada banda del atleta, en SU escalera (fraccion del umbral). Los
  -- `zone_seconds` que trae calculados un reloj NO entran aqui: Garmin reparte
  -- por porcentaje de FC maxima y su «Z3» no es esta. Se quedan donde estan, con
  -- su metodo, sin mezclarse en la misma pila.
  z1_s                   int         not null default 0,
  z2_s                   int         not null default 0,
  z3_s                   int         not null default 0,
  z4_s                   int         not null default 0,
  z5_s                   int         not null default 0,

  -- El hueco declarado. Dos motivos distintos —no hubo pulso, o no hay ancla— y
  -- a escala de semana significan lo mismo: ese tiempo no se puede repartir. El
  -- motivo se lee de `hr_origin` y de `computed_with_anchor`, no de un valor
  -- centinela metido en los segundos.
  no_hr_s                int         not null default 0,

  total_s                int         generated always as (z1_s + z2_s + z3_s + z4_s + z5_s + no_hr_s) stored,

  -- DE DONDE salieron los segundos. Es nuestro vocabulario de mecanismo, no el
  -- de ningun aparato, y por eso es texto con CHECK y no un enum nuevo.
  --   frozen_segment — el reparto que congelo el movil en el propio tramo. Es
  --                    medida, se respeta tal cual y no se recalcula.
  --   trace          — la serie de `workout_traces`, clasificada por nosotros.
  --   samples        — muestras sueltas de `biometric_streams` cruzadas por
  --                    ventana con el tramo (el historico que ya esta guardado).
  --   none           — se miro y no habia pulso. Distinto de no tener fila:
  --                    esto es una respuesta, no una ausencia.
  hr_origin              text        not null,

  -- QUIEN lo midio, cuando se sabe. Null para `frozen_segment` (ahi el aparato
  -- lo dice el propio tramo, en `segment_executions.hr_source`, y copiarlo seria
  -- abrir la puerta a que los dos se contradigan) y para `none`.
  hr_provider            biometric_source,

  -- CON QUE se clasifico: el peldaño del que salio el umbral y el numero.
  -- `resolveThresholdHr` los ordena medido > declarado > estimado, y esto guarda
  -- cual gano ESE dia. Null cuando el atleta no tenia ancla ninguna.
  computed_with_anchor   text,
  computed_with_lthr_bpm int,

  computed_at            timestamptz not null default now(),

  -- Un reparto por tramo. Recomputar reemplaza, nunca duplica.
  constraint segment_zone_seconds_segment_uq unique (segment_execution_id),

  constraint segment_zone_seconds_nonneg_chk check (
    z1_s >= 0 and z2_s >= 0 and z3_s >= 0 and z4_s >= 0 and z5_s >= 0 and no_hr_s >= 0
  ),

  constraint segment_zone_seconds_origin_chk check (
    hr_origin in ('frozen_segment', 'trace', 'samples', 'none')
  ),

  constraint segment_zone_seconds_anchor_chk check (
    computed_with_anchor is null
    or computed_with_anchor in ('lthr_measured', 'lthr_declared', 'from_max_hr', 'from_age')
  ),

  -- El ancla y su numero van juntos o no van: media procedencia no deja auditar
  -- nada, y un umbral sin peldaño no se puede volver a explicar.
  constraint segment_zone_seconds_anchor_pair_chk check (
    (computed_with_anchor is null) = (computed_with_lthr_bpm is null)
  ),

  -- Fuera de la banda fisiologica no es un umbral, es un dato corrupto.
  constraint segment_zone_seconds_lthr_range_chk check (
    computed_with_lthr_bpm is null or computed_with_lthr_bpm between 60 and 260
  ),

  -- SIN ANCLA NO HAY ZONAS. La regla del modelo, sostenida por la tabla: sin
  -- umbral estampado no puede haber ni un segundo clasificado.
  constraint segment_zone_seconds_no_anchor_no_zones_chk check (
    computed_with_anchor is not null
    or (z1_s = 0 and z2_s = 0 and z3_s = 0 and z4_s = 0 and z5_s = 0)
  )
);

comment on table segment_zone_seconds is
  'Segundos por zona de FC de un tramo ejecutado, en la escalera del ATLETA (fraccion de su umbral). Grano = tramo porque la modalidad vive ahi y la grafica se filtra por tipo de entreno. Congelado: se calcula con el ancla vigente el dia del entreno y recomputar es un gesto explicito, nunca un efecto de cambiar las anclas.';

-- El reconstructor pregunta «que tramos no tienen fila todavia», y la agregacion
-- semanal recorre las filas de un atleta por fecha. Las dos entran por el tramo,
-- que ya lleva su unique.

create table if not exists coach_hr_method (
  id                        bigint      generated always as identity primary key,
  coach_id                  bigint      not null references coaches(id) on delete cascade,

  -- Donde cortan las cinco bandas, como fraccion del umbral. Z1 no tiene suelo
  -- —no hay suelo para ir suave— asi que no hay `z1_lo`. Z4 cabalga sobre 1.00
  -- porque el umbral ES la banda de Z4.
  z1_hi_frac                numeric(4,3) not null,
  z2_lo_frac                numeric(4,3) not null,
  z2_hi_frac                numeric(4,3) not null,
  z3_lo_frac                numeric(4,3) not null,
  z3_hi_frac                numeric(4,3) not null,
  z4_lo_frac                numeric(4,3) not null,
  z4_hi_frac                numeric(4,3) not null,
  z5_lo_frac                numeric(4,3) not null,
  z5_hi_frac                numeric(4,3) not null,

  -- Donde se pliegan las cinco zonas en las tres bandas de polarizacion. Hay
  -- escuelas que dejan Z3 en el medio y otras que la suben al alto, asi que el
  -- corte tambien es suyo.
  polarization_low_max_zone smallint    not null,
  polarization_mid_max_zone smallint    not null,

  -- El reparto que persigue. El sistema no opina sobre si un reparto es bueno:
  -- solo dibuja el suyo al lado del medido.
  polarization_low_pct      smallint    not null,
  polarization_mid_pct      smallint    not null,
  polarization_high_pct     smallint    not null,

  updated_at                timestamptz not null default now(),

  constraint coach_hr_method_coach_uq unique (coach_id),

  -- Las bandas suben y no se pisan. Sin esto un coach podria dejar un hueco por
  -- el que caiga un pulso sin zona, o solapar dos bandas y que el mismo latido
  -- valiera para dos.
  constraint coach_hr_method_monotonic_chk check (
    z1_hi_frac < z2_lo_frac and z2_lo_frac <= z2_hi_frac
    and z2_hi_frac < z3_lo_frac and z3_lo_frac <= z3_hi_frac
    and z3_hi_frac < z4_lo_frac and z4_lo_frac <= z4_hi_frac
    and z4_hi_frac < z5_lo_frac and z5_lo_frac <= z5_hi_frac
  ),

  -- Rango fisiologico: por debajo de la mitad del umbral no es una zona de
  -- entrenamiento y por encima de dos veces tampoco existe.
  constraint coach_hr_method_range_chk check (
    z1_hi_frac > 0 and z5_hi_frac <= 2
  ),

  -- El pliegue tiene que dejar las tres bandas con sitio: algo facil, algo medio
  -- y algo duro por encima.
  constraint coach_hr_method_collapse_chk check (
    polarization_low_max_zone between 1 and 3
    and polarization_mid_max_zone between 2 and 4
    and polarization_low_max_zone < polarization_mid_max_zone
  ),

  -- Una tarta son 100 puntos.
  constraint coach_hr_method_target_chk check (
    polarization_low_pct between 0 and 100
    and polarization_mid_pct between 0 and 100
    and polarization_high_pct between 0 and 100
    and polarization_low_pct + polarization_mid_pct + polarization_high_pct = 100
  )
);

comment on table coach_hr_method is
  'Metodo de FC del coach (HARD RULE Nº0: donde cortan las bandas y que reparto se persigue es metodo, no mecanismo). Una fila por coach, el conjunto entero se reemplaza al guardar. Los defectos viven en shared/domain/coach/hr-method.ts, NUNCA como default de columna: un coach que no toca nada se comporta igual que hoy.';
