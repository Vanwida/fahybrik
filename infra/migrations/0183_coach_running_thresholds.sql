-- 0183_coach_running_thresholds.sql
--
-- LOS UMBRALES DE LOS AGREGADOS DE CARRERA SON METODO, NO MECANISMO
-- (CLAUDE.md, HARD RULE Nº0). Mismo patron que coach_signal_thresholds
-- (0161): que exista una lectura de calibracion, o una alerta de frescura,
-- es MECANISMO — lo decide el modelo (una posicion con pocas repeticiones
-- no se le pone porcentaje; una carga que cae por debajo de un umbral es
-- una alerta). Cuantas repeticiones hacen falta, cuantas series, y a partir
-- de que frescura eso es un aviso, es METODO: la pregunta que decide
-- («otro entrenador competente lo haria distinto?») da que si para las tres
-- (mockup docs/carrera-en-el-panel.html, seccion 08 «Lo que es metodo del
-- coach»), asi que nacen como DATO editable, nunca como constante.
--
-- Tres columnas, no las seis que lista la seccion 08 del mockup: las otras
-- tres (parejas minimas para "carrera comprometida", que cuenta como trabajo
-- previo, dias de fondo/reciente de la carga) se quedan fuera de este lote a
-- proposito.
--   - "Carrera comprometida" no se construye esta ronda: verificado contra
--     produccion (10-ago-2026), solo hay UNA ejecucion con trabajo previo a
--     una serie de carrera, y esa fila ni siquiera tiene ritmo medio. Muy
--     por debajo del propio minimo del mockup (4 parejas). Anadir su columna
--     de metodo sin la lectura que la usa seria dato muerto. Vease
--     docs/DECISIONS.md.
--   - Los dias de fondo/reciente (42 y 7) son los tau de la EWMA de
--     banister.ts: hacerlos editables aqui moveria el NUMERO (no solo su
--     etiqueta) en cada pantalla que ya lee CTL/ATL/TSB — el panel de
--     carrera, la forma del atleta, la ficha general del coach, el
--     race-readiness. Cambiarlo solo para el panel de carrera divergiria del
--     resto; cambiarlo en todas partes es un refactor de mucho mas alcance
--     que este encargo. Deuda declarada, no descuido — vease
--     docs/DECISIONS.md.
--
-- Los defectos NO viven aqui como `default` de columna: viven en
-- shared/domain/coach/running-thresholds.ts. Un coach que no toca nada se
-- comporta igual que en las maquetas aprobadas.
--
-- Una fila por coach. Guardar reemplaza el conjunto entero: no hay parche
-- por campo. Columnas explicitas, sin JSONB.
--
-- Aditivo. No toca ninguna tabla existente. Idempotente (create table if not
-- exists). El runner envuelve el fichero en UNA transaccion (sin begin/commit
-- aqui) y corta por punto y coma, asi que ningun comentario lleva uno.

create table if not exists coach_running_thresholds (
  id                          bigint      generated always as identity primary key,
  coach_id                    bigint      not null references coaches(id) on delete cascade,
  -- Repeticiones evaluables minimas en UNA posicion de la serie para
  -- ponerle porcentaje a esa columna. Por debajo, la posicion se dibuja
  -- rayada con su cuenta ("2 aun"), sin porcentaje: un 0 % sostenido por
  -- dos observaciones seria una conclusion inventada.
  min_reps_per_position       smallint    not null,
  -- Series evaluables minimas (repeticiones de trabajo con ritmo objetivo,
  -- sumadas entre todas las posiciones) para que la tarjeta de calibracion
  -- entera se atreva a dar un porcentaje. Por debajo, dice cuantas lleva
  -- ("12 de 20") en vez de un numero.
  min_series_for_calibration  smallint    not null,
  -- TSB (frescura = fondo menos reciente) igual o por debajo del cual el
  -- panel de carga dice "esta apretando". Negativo por naturaleza: un TSB
  -- positivo es descanso, no aviso.
  freshness_alert_tsb         smallint    not null,
  updated_at                  timestamptz not null default now(),
  constraint coach_running_thresholds_coach_uq unique (coach_id),
  -- Por debajo de 2 repeticiones cualquier posicion saldria a 0 % o 100 %:
  -- no hay porcentaje que sea informativo con una sola observacion. Por
  -- encima de 20, el umbral deja de ser plausible para una serie real.
  constraint coach_running_thresholds_min_reps_chk
    check (min_reps_per_position between 2 and 20),
  -- Por debajo de 5 series no hay nada que llamar "calibracion". Por
  -- encima de 200, un atleta tardaria mas de un ano en alcanzar el
  -- minimo con series semanales.
  constraint coach_running_thresholds_min_series_chk
    check (min_series_for_calibration between 5 and 200),
  -- Entre 0 (alerta en cuanto la carga reciente iguala al fondo) y -50
  -- (practicamente nunca se dispara). Nunca positivo: un TSB positivo es
  -- frescura, no fatiga.
  constraint coach_running_thresholds_freshness_chk
    check (freshness_alert_tsb between -50 and 0)
);

comment on table coach_running_thresholds is
  'Umbrales de los agregados de carrera editables por el coach (HARD RULE No0: el umbral es metodo, no mecanismo). Una fila por coach, el conjunto entero se reemplaza al guardar. Los defectos viven en shared/domain/coach/running-thresholds.ts, NUNCA como default de columna.';
