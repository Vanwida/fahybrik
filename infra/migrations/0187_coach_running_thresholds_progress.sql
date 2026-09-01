-- 0187_coach_running_thresholds_progress.sql
--
-- "ESTOY MEJORANDO?" — LOS UMBRALES DE LA LECTURA DEL ATLETA.
--
-- La pantalla de analiticas de carrera del atleta (maqueta analiticas-correr,
-- aprobada 12-ago) da un VEREDICTO derivado de una escalera de evidencia. El
-- mecanismo (que peldano manda, como se detecta el exceso de carga, que
-- silencia una lectura) es del producto y vive en shared/domain/running/
-- progress.ts. Los NUEVE numeros que lo disparan son METODO del coach: la
-- pregunta que decide (HARD RULE No0, "otro entrenador competente lo haria
-- distinto?") da que si en los nueve.
--
-- El noveno, gradient_retires_pace_pct, cierra ademas un numero DUPLICADO:
-- la regla "pendiente >=3% retira el veredicto de ritmo" vivia solo en Swift
-- (ReglasDeLectura.pendienteQueRetiraElRitmoPct) y el servidor no la tenia.
-- Dos constantes que hoy coinciden por casualidad y manana no. Ahora nace
-- aqui como dato y el servidor se la manda al cliente en run_compliance, que
-- deja de tener numero propio.
--
-- MISMA TABLA, no una segunda. Son juicios sobre CARRERA y el coach es el
-- mismo, asi que partirlos habria obligado a resolver dos filas para
-- contestar una pregunta. Ademas min_pairs_for_compromised_trend (0184) ya
-- sirve a las dos lecturas — la curva de correr cansado es LA MISMA — y
-- duplicarla habria dejado dos umbrales capaces de discrepar sobre la misma
-- curva.
--
-- ANADE COLUMNAS a coach_running_thresholds (0183/0184, YA APLICADAS a
-- produccion) — no se editan migraciones aplicadas.
--
-- Los defectos viven en shared/domain/coach/running-thresholds.ts, NUNCA como
-- default de columna: una tabla con defaults en el DDL es lo que dejo muerta
-- a coach_methodology (0048), porque el defecto acaba escrito en dos sitios y
-- el codigo deja de ser la fuente.
--
-- Aditivo. Idempotente (add column if not exists). El runner envuelve el
-- fichero en UNA transaccion (sin begin/commit aqui) y corta por punto y
-- coma, asi que ningun comentario lleva uno.

alter table coach_running_thresholds
  add column if not exists min_weeks_to_judge smallint,
  add column if not exists meaningful_gain_s_per_km smallint,
  add column if not exists volume_surge_ratio numeric(4, 3),
  add column if not exists good_in_band_pct smallint,
  add column if not exists min_reps_to_judge_band smallint,
  add column if not exists same_hr_reference_zone smallint,
  add column if not exists same_hr_tolerance_bpm smallint,
  add column if not exists same_hr_min_distance_m integer,
  add column if not exists gradient_retires_pace_pct numeric(4, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coach_running_thresholds_progress_chk'
  ) then
    alter table coach_running_thresholds
      -- Los limites son los de shared/domain/coach/running-thresholds.ts, con
      -- nombre alli y repetidos aqui como CHECK: la base es la ultima linea de
      -- defensa, no la primera. Cada uno acota lo que sigue significando algo:
      --   min_weeks_to_judge      2..52  menos de dos semanas no es tendencia
      --   meaningful_gain_s_per_km 1..60 60 s/km ya no es ruido, es otra persona
      --   volume_surge_ratio  0.05..2    +5% es ruido de calendario, +200% no llega nunca
      --   good_in_band_pct      50..100  por debajo del 50% el listero seria "falla mas que acierta"
      --   min_reps_to_judge_band 3..200
      --   same_hr_reference_zone 2..5    la Z1 NO tiene suelo en el modelo de
      --                                  zonas, asi que no hay punto medio del
      --                                  que sacar una referencia. Aritmetica,
      --                                  no opinion: sin este limite, anclar en
      --                                  Z1 vaciaba la serie y la pantalla le
      --                                  decia al atleta que le faltaba
      --                                  historia, culpandole de una eleccion
      --                                  del coach
      --   same_hr_tolerance_bpm  2..15   por encima de 15 la correccion ya extrapola
      --   same_hr_min_distance_m 400..10000
      --   gradient_retires_pace_pct 1..15  por debajo del 1% es ruido de
      --                                  medicion, por encima del 15% es una
      --                                  pared y un umbral que no retira nada
      --                                  da igual que no exista
      add constraint coach_running_thresholds_progress_chk
      check (
        (min_weeks_to_judge is null or min_weeks_to_judge between 2 and 52)
        and (meaningful_gain_s_per_km is null or meaningful_gain_s_per_km between 1 and 60)
        and (volume_surge_ratio is null or volume_surge_ratio between 0.05 and 2)
        and (good_in_band_pct is null or good_in_band_pct between 50 and 100)
        and (min_reps_to_judge_band is null or min_reps_to_judge_band between 3 and 200)
        and (same_hr_reference_zone is null or same_hr_reference_zone between 2 and 5)
        and (same_hr_tolerance_bpm is null or same_hr_tolerance_bpm between 2 and 15)
        and (same_hr_min_distance_m is null or same_hr_min_distance_m between 400 and 10000)
        and (gradient_retires_pace_pct is null or gradient_retires_pace_pct between 1 and 15)
      );
  end if;
end $$;

-- Backfill: las filas ya escritas heredan el defecto del sistema, para que
-- "no tocar nada" siga significando "se comporta como el defecto" tambien
-- para el coach que guardo sus umbrales ANTES de que existieran estos ocho.
update coach_running_thresholds
set
  min_weeks_to_judge = coalesce(min_weeks_to_judge, 6),
  meaningful_gain_s_per_km = coalesce(meaningful_gain_s_per_km, 3),
  volume_surge_ratio = coalesce(volume_surge_ratio, 0.2),
  good_in_band_pct = coalesce(good_in_band_pct, 80),
  min_reps_to_judge_band = coalesce(min_reps_to_judge_band, 15),
  same_hr_reference_zone = coalesce(same_hr_reference_zone, 2),
  same_hr_tolerance_bpm = coalesce(same_hr_tolerance_bpm, 5),
  same_hr_min_distance_m = coalesce(same_hr_min_distance_m, 1000),
  gradient_retires_pace_pct = coalesce(gradient_retires_pace_pct, 3)
where
  min_weeks_to_judge is null
  or meaningful_gain_s_per_km is null
  or volume_surge_ratio is null
  or good_in_band_pct is null
  or min_reps_to_judge_band is null
  or same_hr_reference_zone is null
  or same_hr_tolerance_bpm is null
  or same_hr_min_distance_m is null
  or gradient_retires_pace_pct is null;

alter table coach_running_thresholds
  alter column min_weeks_to_judge set not null,
  alter column meaningful_gain_s_per_km set not null,
  alter column volume_surge_ratio set not null,
  alter column good_in_band_pct set not null,
  alter column min_reps_to_judge_band set not null,
  alter column same_hr_reference_zone set not null,
  alter column same_hr_tolerance_bpm set not null,
  alter column same_hr_min_distance_m set not null,
  alter column gradient_retires_pace_pct set not null;

comment on column coach_running_thresholds.min_weeks_to_judge is
  'Semanas de historial antes de afirmar una tendencia. Por debajo el veredicto dice "aun no" y dibuja el plazo. Metodo del coach.';

comment on column coach_running_thresholds.meaningful_gain_s_per_km is
  'Segundos por km a partir de los cuales un cambio deja de ser ruido. Metodo del coach.';

comment on column coach_running_thresholds.volume_surge_ratio is
  'Subida de volumen (0.2 = +20%) que, CRUZADA con el ritmo empeorando, dispara "cargando de mas". Sola no juzga nada. Metodo del coach.';

comment on column coach_running_thresholds.good_in_band_pct is
  'Porcentaje de repeticiones en banda a partir del cual el atleta clava lo que le piden. Metodo del coach.';

comment on column coach_running_thresholds.min_reps_to_judge_band is
  'Repeticiones evaluadas antes de JUZGAR ese porcentaje (por debajo la cifra sale sin color). Metodo del coach.';

comment on column coach_running_thresholds.same_hr_reference_zone is
  'Zona que ancla el "ritmo al mismo pulso" (2-5). Metodo del coach: hay quien ancla en umbral en vez de en aerobico suave. La Z1 no entra porque no tiene suelo en el modelo, asi que no tiene punto medio.';

comment on column coach_running_thresholds.same_hr_tolerance_bpm is
  'Media banda alrededor del pulso de referencia. Fuera de ella el tramo se descarta en vez de extrapolarse. Metodo del coach.';

comment on column coach_running_thresholds.same_hr_min_distance_m is
  'Metros minimos de un tramo para que su pulso medio signifique algo (en una serie corta el corazon todavia sube). Metodo del coach.';

comment on column coach_running_thresholds.gradient_retires_pace_pct is
  'Pendiente (%, valor absoluto) a partir de la cual el ritmo deja de compararse. Metodo del coach: quien entrena trail no lo retira al 3%. Viaja al cliente en run_compliance para que el movil no tenga su propia constante.';
