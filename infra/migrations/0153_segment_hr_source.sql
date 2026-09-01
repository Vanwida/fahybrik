-- 0153_segment_hr_source.sql
--
-- QUE avg_hr / max_hr SEPAN DE QUE APARATO SALIERON.
--
-- El problema que cierra. El motor en vivo (WorkoutSession.injectLiveHR) puede
-- tener DOS fuentes de pulso streameando a la vez -- una correa BLE + el Apple
-- Watch por HealthKit, o el Watch + una correa emparejada por el PM5 -- y los dos
-- escenarios son normales, no un edge case. El motor YA sabe resolver eso: una
-- jerarquia de prioridad (strap=3 > healthkit=2 > pm5=1) con una ventana de
-- silencio de 10s decide en cada instante que fuente es la DUENA. El fallo que
-- este mismo lote arregla en iOS era que esa jerarquia solo gobernaba la
-- ETIQUETA de la tira de conexion -- avg_hr/max_hr promediaban y maximaban la
-- UNION de las dos fuentes igualmente, asi que un artefacto de la fuente mas
-- debil (un salto de senal del PM5) podia colarse como el maximo grabado del
-- tramo aunque la correa nunca llegara ahi.
--
-- Arreglada la mezcla en el motor, esta columna deja constancia de QUE aparato
-- midio el pulso guardado -- distinto de `source`, que describe el TRAMO
-- (gps/pm5/treadmill/manual), no especificamente el pulso: un tramo de cinta
-- (source='treadmill') puede tener su unica FC medida por el Watch.
--
-- POR QUE NULL ES EL DEFECTO, Y POR QUE ESTA MIGRACION NO MUEVE UN SOLO DATO.
-- NULL significa "esta fila no tiene FC medida, o se registro antes de que el
-- cliente mandara esta columna" -- exactamente el estado de cada fila existente
-- hoy. Cero backfill: la procedencia del pulso de una ejecucion ya cerrada no se
-- puede reconstruir a partir de avg_hr/max_hr solos.
--
-- El CHECK acepta NULL a proposito (un CHECK con NULL evalua a NULL, no a falso,
-- y la fila pasa), asi que las filas viejas no necesitan tocarse.
--
-- El runner envuelve el fichero en UNA transaccion (sin begin/commit aqui). Ningun
-- comentario lleva ';'.

alter table segment_executions add column if not exists hr_source text;

alter table segment_executions drop constraint if exists segment_executions_hr_source_chk;
alter table segment_executions add constraint segment_executions_hr_source_chk
  check (hr_source is null or hr_source in ('strap', 'healthkit', 'pm5'));

comment on column segment_executions.hr_source is
  'De que aparato salio el pulso de avg_hr/max_hr: strap | healthkit | pm5. NULL = sin FC medida en esta fila, o fila anterior a esta columna. Distinto de source (que describe el tramo, no el pulso).';
