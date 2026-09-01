-- 0189 — El METODO del coach en las analiticas del atleta.
--
-- HARD RULE No0: mecanismo vs metodo. La pregunta que decide es «otro
-- entrenador competente lo haria distinto?», y para todo lo de aqui la
-- respuesta es que si:
--
--   * COMO se calcula una media movil exponencial de la carga es MECANISMO
--     (banister.ts): es aritmetica, no hay dos maneras correctas.
--   * SOBRE CUANTOS DIAS se promedia es METODO: 42/7 es el reparto que usa
--     media industria, pero hay escuelas que trabajan a 28/7 porque su bloque
--     dura cuatro semanas y un fondo de seis les llega tarde.
--   * QUE un ajuste de velocidad critica con dos esfuerzos casi iguales no
--     signifique nada es MECANISMO. CUANTA separacion exigir es METODO.
--
-- Los defectos NO viven aqui como `default` de columna: viven en
-- shared/domain/analytics/metodo.ts, y son EXACTAMENTE el comportamiento de
-- hoy. Un coach que no toca nada ve los mismos numeros que veia.
--
-- Esto salda parte de la deuda que 0183 declaro explicitamente: alli se dijo
-- que mover CTL/ATL cambiaria el numero en todas las pantallas que ya leen
-- fondo, reciente y frescura, y se dejo como `const`. Sigue siendo cierto que
-- lo mueve — por eso el defecto es el valor de siempre y el cambio es un acto
-- deliberado del coach, no un efecto secundario de esta migracion.
--
-- Una fila por coach. Guardar reemplaza el conjunto entero: no hay parche por
-- campo. Columnas explicitas, sin JSONB.
--
-- Aditivo. No toca ninguna tabla existente. Idempotente (create table if not
-- exists). El runner envuelve el fichero en UNA transaccion (sin begin/commit
-- aqui) y corta por punto y coma, asi que ningun comentario lleva uno.

create table if not exists coach_analytics_method (
  id                              bigint      generated always as identity primary key,
  coach_id                        bigint      not null references coaches(id) on delete cascade,

  -- ── LA CARGA ────────────────────────────────────────────────────────────
  -- Dias de la media movil del FONDO (carga cronica) y de lo RECIENTE (aguda).
  ctl_days                        smallint    not null,
  atl_days                        smallint    not null,
  -- Cuanto puede crecer el fondo en una semana antes de que el ritmo de subida
  -- avise. Un fondo de 60 alcanzado en cuatro meses es un atleta en forma, el
  -- mismo 60 en tres semanas es una lesion esperando.
  ramp_alert_tss_per_week         smallint    not null,
  -- Bandas del cociente reciente/fondo.
  acr_low                         numeric(3,2) not null,
  acr_high                        numeric(3,2) not null,

  -- ── LA CAPACIDAD (velocidad critica y deposito) ──────────────────────────
  cs_min_efforts                  smallint    not null,
  -- Ventana de duracion admisible de cada esfuerzo. Fuera de ella el modelo de
  -- dos parametros deja de describir a un humano: por debajo manda la potencia
  -- de arranque y la velocidad critica sale inflada, por encima entra la
  -- reserva de combustible, que el modelo no contempla, y sale hundida.
  cs_min_duration_s               smallint    not null,
  cs_max_duration_s               smallint    not null,
  cs_min_spread_ratio             numeric(4,2) not null,
  cs_min_fit_r2_pct               smallint    not null,
  -- Cuanto puede alejarse la velocidad critica del umbral ya medido antes de
  -- retirar el resultado. Miden casi lo mismo por caminos distintos: si no se
  -- parecen, los esfuerzos no fueron maximos.
  cs_max_drift_from_threshold_pct smallint    not null,

  -- ── LA RECUPERACION ─────────────────────────────────────────────────────
  sleep_target_hours              numeric(3,1) not null,
  -- Noches minimas de basal para que la variabilidad tenga contra que
  -- compararse. Un basal de tres noches se mueve con cada noche nueva, y
  -- entonces el delta mide el basal, no al atleta.
  hrv_min_nights_baseline         smallint    not null,
  hrv_min_nights_recent           smallint    not null,

  updated_at                      timestamptz not null default now(),

  constraint coach_analytics_method_coach_uq unique (coach_id),

  -- Rangos por campo. Los mismos numeros viven en ANALYTICS_METHOD_BOUNDS
  -- (shared/domain/analytics/metodo.ts) para que el formulario del coach y la
  -- base de datos no puedan discrepar sobre que es admisible.
  constraint coach_analytics_method_ctl_days_chk check (ctl_days between 14 and 90),
  constraint coach_analytics_method_atl_days_chk check (atl_days between 3 and 21),
  constraint coach_analytics_method_ramp_chk check (ramp_alert_tss_per_week between 1 and 50),
  constraint coach_analytics_method_acr_low_chk check (acr_low between 0.30 and 1.00),
  constraint coach_analytics_method_acr_high_chk check (acr_high between 1.00 and 3.00),
  constraint coach_analytics_method_cs_efforts_chk check (cs_min_efforts between 3 and 10),
  constraint coach_analytics_method_cs_min_dur_chk check (cs_min_duration_s between 60 and 600),
  constraint coach_analytics_method_cs_max_dur_chk check (cs_max_duration_s between 300 and 3600),
  constraint coach_analytics_method_cs_spread_chk check (cs_min_spread_ratio between 1.50 and 10.00),
  constraint coach_analytics_method_cs_r2_chk check (cs_min_fit_r2_pct between 50 and 100),
  constraint coach_analytics_method_cs_drift_chk check (cs_max_drift_from_threshold_pct between 5 and 50),
  constraint coach_analytics_method_sleep_chk check (sleep_target_hours between 5.0 and 12.0),
  constraint coach_analytics_method_hrv_base_chk check (hrv_min_nights_baseline between 3 and 60),
  constraint coach_analytics_method_hrv_recent_chk check (hrv_min_nights_recent between 1 and 14),

  -- Reglas que ningun par de valores puede romper aunque cada uno este dentro
  -- de su rango. Espejo de `validarMetodoAnalitico` en metodo.ts.
  constraint coach_analytics_method_windows_chk check (atl_days < ctl_days),
  constraint coach_analytics_method_acr_band_chk check (acr_low < acr_high),
  constraint coach_analytics_method_cs_window_chk check (cs_min_duration_s < cs_max_duration_s),
  constraint coach_analytics_method_hrv_nights_chk check (hrv_min_nights_recent < hrv_min_nights_baseline)
);

comment on table coach_analytics_method is
  'Metodo del coach para las analiticas del atleta: ventanas de la carga, umbral de aviso del ritmo de subida, bandas del cociente, puertas del ajuste de velocidad critica y minimos de recuperacion (HARD RULE No0: el umbral es metodo, no mecanismo). Una fila por coach, el conjunto entero se reemplaza al guardar. Los defectos viven en shared/domain/analytics/metodo.ts, NUNCA como default de columna.';

comment on column coach_analytics_method.ctl_days is
  'Dias de la media movil del fondo. Defecto 42 en metodo.ts: el mismo CTL_DECAY_DAYS que el motor ya usaba, para que nada se mueva sin que el coach lo decida.';

comment on column coach_analytics_method.ramp_alert_tss_per_week is
  'Subida de fondo por semana a partir de la cual el ritmo de subida avisa. Defecto 5. Es la unica de las tres de carga que NO existia antes: hasta ahora la subida no se medía.';
