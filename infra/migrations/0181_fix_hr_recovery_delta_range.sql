-- 0181_fix_hr_recovery_delta_range.sql
--
-- `workout_executions_hr_chk` (0154) EXIGE hr_recovery_60_bpm ENTRE 30 Y 260 --
-- EL RANGO DE UN PULSO ABSOLUTO, NO DE UNA CAIDA.
--
-- El problema. `hr_recovery_60_bpm` no es un pulso: es "cuanto CAYO el pulso en
-- 60 s" (comentario de la propia 0154: "La caida de pulso 60 s despues del
-- esfuerzo"). El CHECK que la 0154 escribio la metio en el mismo `between 30 and
-- 260` que avg_hr/max_hr/min_hr -- un pulso absoluto de verdad va ahi, una CAIDA
-- no. Verificado contra produccion: `select (18 between 30 and 260)` -> false.
-- Una recuperacion de 18 lpm en un minuto es buena y corriente (HRRecoveryCapture,
-- el motor que esta columna existe para alimentar, la devuelve sin pestanear) y
-- el CHECK de hoy la rechaza. Cualquier caida por debajo de 30 -- la mayoria de
-- las reales -- revienta el insert.
--
-- Por que se descubre ahora y no en la 0154. La columna existe desde entonces
-- pero nadie la escribia todavia (el motor vive en HRRecoveryCapture y solo se
-- usaba en tests guiados) -- el bug estaba dormido. Esta tanda es la primera que
-- escribe `hr_recovery_60_bpm` desde una traza de carrera normal.
--
-- El arreglo. `hr_recovery_60_bpm` pasa a `between 0 and 150`:
--   - 0 de suelo, no negativo: HRRecoveryCapture ya convierte una caida negativa
--     (el pulso subio, no bajo) en null ANTES de guardar nada -- `drop >= 0 ?
--     drop : nil`. El valor que persiste nunca es negativo por construccion, asi
--     que el CHECK solo tiene que dejar pasar >= 0, no reservar hueco para algo
--     que el propio motor ya descarta.
--   - 150 de techo, generoso a proposito y no un limite fisiologico ajustado: es
--     una red de seguridad contra un bug de calculo (como el propio 260 lo es
--     para avg_hr), no una afirmacion sobre cual es la mejor recuperacion posible.
-- avg_hr / max_hr / min_hr NO cambian: esos si son pulsos absolutos y 30-260
-- siempre fue el rango correcto para ellos.
--
-- Ninguna fila existente se toca: `hr_recovery_60_bpm` esta vacia en todo el
-- historico (nadie la escribia). Ensanchar un CHECK nunca invalida una fila que
-- ya lo cumplia.
--
-- El runner envuelve el fichero en UNA transaccion (sin begin/commit aqui). Ningun
-- comentario lleva ';'.

alter table workout_executions drop constraint if exists workout_executions_hr_chk;
alter table workout_executions add constraint workout_executions_hr_chk check (
  (avg_hr is null or avg_hr between 30 and 260)
  and (max_hr is null or max_hr between 30 and 260)
  and (min_hr is null or min_hr between 30 and 260)
  and (hr_recovery_60_bpm is null or hr_recovery_60_bpm between 0 and 150)
);

comment on column workout_executions.hr_recovery_60_bpm is
  'Caida de pulso (lpm) en los 60 s tras el final del esfuerzo -- una DELTA, no un pulso absoluto. Rango 0-150: HRRecoveryCapture ya descarta una caida negativa antes de guardar. NULL = sin cobertura real a los 58 s, o sesion sin traza.';
