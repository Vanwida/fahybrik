-- 0154_execution_measured_header.sql
--
-- QUE UNA SESION SEPA COMO FUE, Y NO SOLO CUANTO DURO.
--
-- El problema que cierra. `workout_executions` guarda hoy duracion, RPE, notas y el
-- marcador de un metcon. Nada mas. Ni pulso, ni potencia, ni distancia total, ni
-- calorias, ni desnivel. Eso tiene tres consecuencias que no son de pantalla:
--
--   1. El TSS solo puede salir del RPE. `shared/domain/training-load/tss.ts` tiene
--      escritos y con tests los modos por POTENCIA/FTP (modo 1) y por FC/LTHR (modo 2),
--      y su propio comentario dice por que nunca disparan: «Today only mode 3 can ever
--      fire: workout_executions stores total_duration_seconds and perceived_exertion
--      and nothing else -- there is no HR column, no power column». Una sesion sin RPE
--      no puntua nada, y eso deja huecos en las curvas de carga del coach.
--
--   2. Lo que ya nos mandan las fuentes externas se tira por no tener donde ponerlo.
--      Verificado: `web/lib/polar/normalize.ts` parsea `calories` y `distanceMeters` de
--      cada sesion y `ingest-polar.ts` no los escribe -- no porque se olvidara, sino
--      porque no hay columna. Lo mismo con las calorias de HealthKit a nivel de workout.
--
--   3. Los totales se recalculan sumando tramos en cada lectura, y una sesion importada
--      de un tercero que solo trae totales (sin vueltas) no tiene forma de expresarlos.
--
-- POR QUE ESTAS COLUMNAS Y NO OTRAS. Son las que un atleta busca hoy en la app de su
-- reloj y aqui no encuentra: son el estandar del sector (Garmin Connect, TrainingPeaks,
-- Apple Fitness ensenan exactamente esto en la cabecera de una actividad). No se inventa
-- ninguna metrica nueva.
--
--   avg_hr / max_hr / min_hr   La FC de la sesion. `min_hr` no existia en ningun sitio
--                              del esquema y si aparece en la ficha de cualquier
--                              competidor. Es la que desbloquea el modo 2 del TSS.
--
--   avg_power_w                Potencia media. Desbloquea el modo 1 del TSS. Numeric y
--                              no int: un ergo da decimales.
--
--   total_distance_m           Distancia de la sesion. Hoy solo existe por tramo.
--   total_calories             Idem. Es el dato que Polar ya nos manda y tiramos.
--
--   elevation_gain_m /         Desnivel acumulado. Tres fuentes nos lo dan hoy y ninguna
--   elevation_loss_m           se lee: la altitud del CLLocation, el Elevation Gain del
--                              characteristic FTMS de la cinta, y el HKWorkoutRoute que
--                              graba el propio Apple Watch. Separados y no netos: subir
--                              300 y bajar 300 no es lo mismo que un llano, y el neto lo
--                              borraria.
--
--   moving_seconds             Tiempo EN MOVIMIENTO, distinto del total. Sin el, la
--                              media de un entreno con transiciones miente: es
--                              exactamente lo que produjo el «42:25 min/km» de la
--                              captura que abrio este trabajo -- el reloj dividio el
--                              tiempo entero, paradas incluidas, por la distancia.
--
--   hr_recovery_60_bpm         La caida de pulso 60 s despues del esfuerzo. El mecanismo
--                              ya existe y esta bien hecho (`HRRecoveryCapture`, media en
--                              ±5 s y exige cobertura real a 58 s o devuelve null), pero
--                              hoy solo se usa en los tests guiados de calibracion.
--
--   decoupling_pct             Deriva cardiaca (Pa:HR). Se GUARDA en vez de calcularse al
--                              leer porque exige recorrer la traza entera, y la traza no
--                              cambia nunca. Nota: `methodology_system` ya tiene un
--                              `decoupling_target_pct` editable por el coach desde hace
--                              tiempo -- un umbral que hasta hoy no alimentaba ningun
--                              dato.
--
-- QUE NO ENTRA AQUI, Y POR QUE. Ni TSS ni IF. Los dos dependen del umbral y del FTP del
-- atleta, que cambian con cada test: guardados se quedarian mintiendo sobre todo el
-- historico. Se siguen calculando al leer, que es lo que ya hace `tss.ts`. La regla del
-- lote: se guarda lo que depende de la TRAZA (cara de recalcular, inmutable), se calcula
-- lo que depende del ATLETA (barato, y cambia).
--
-- TODAS NULLABLE. «No se sabe» es null y nunca un cero -- §7 del contrato de UI y la
-- decision del 28-jul («No se sabe es un valor de primera clase»). Un 0 en calorias es
-- indistinguible de una sesion sin medir, y acabaria contando como evidencia.
--
-- Idempotente via `if not exists`. Aditiva pura: ninguna lectura existente cambia.

begin;

alter table workout_executions
  add column if not exists avg_hr             int,
  add column if not exists max_hr             int,
  add column if not exists min_hr             int,
  add column if not exists avg_power_w        numeric(7,2),
  add column if not exists total_distance_m   numeric(10,2),
  add column if not exists total_calories     numeric(8,2),
  add column if not exists elevation_gain_m   numeric(8,2),
  add column if not exists elevation_loss_m   numeric(8,2),
  add column if not exists moving_seconds     int,
  add column if not exists hr_recovery_60_bpm int,
  add column if not exists decoupling_pct     numeric(5,2);

-- Mismos limites que ya tiene `segment_executions` para la FC, para que un valor
-- imposible no entre por la cabecera despues de que el tramo lo rechace.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workout_executions_hr_chk'
  ) then
    alter table workout_executions add constraint workout_executions_hr_chk check (
      (avg_hr is null or avg_hr between 30 and 260)
      and (max_hr is null or max_hr between 30 and 260)
      and (min_hr is null or min_hr between 30 and 260)
      and (hr_recovery_60_bpm is null or hr_recovery_60_bpm between 30 and 260)
    );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workout_executions_totals_chk'
  ) then
    alter table workout_executions add constraint workout_executions_totals_chk check (
      (avg_power_w is null or avg_power_w >= 0)
      and (total_distance_m is null or total_distance_m >= 0)
      and (total_calories is null or total_calories >= 0)
      and (elevation_gain_m is null or elevation_gain_m >= 0)
      and (elevation_loss_m is null or elevation_loss_m >= 0)
      -- El tiempo en movimiento nunca puede pasar del total: si pasa, es un bug de
      -- acumulacion, no un dato raro del atleta.
      and (moving_seconds is null or moving_seconds >= 0)
      and (
        moving_seconds is null or total_duration_seconds is null
        or moving_seconds <= total_duration_seconds
      )
    );
  end if;
end $$;

commit;
