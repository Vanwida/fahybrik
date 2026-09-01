-- 0155_segment_round_index.sql
--
-- QUE UN CIRCUITO POR RONDAS QUEPA EN LA BASE.
--
-- El problema que cierra, y es literal. `segment_executions` tiene
-- `unique (execution_id, position)`. Una estacion que se repite en tres rondas necesita
-- tres filas con la MISMA position, asi que hoy no caben: el segundo insert viola el
-- constraint. No es que no lo midamos -- es que no hay donde ponerlo.
--
-- Y SI lo medimos. `FixedStationSplit` (ios/FAHYBRIK/Workout/LiveTramo.swift) lleva por
-- cada ronda su elapsed, su duracion, sus metros y sus calorias; `markRoundDone` lo
-- calcula y `WorkoutFormatHUDs` lo pinta en vivo como «Parcial». Un grep sobre todo el
-- repo confirma que no aparece ni una vez en `SegmentPayloadBuilder` ni en ningun DTO:
-- se enseña al atleta mientras entrena y se borra al guardar.
--
-- El caso que lo destapo: un brick de dos bloques x tres rondas x cinco estaciones. Son
-- 30 unidades de trabajo reales -- 18 de ellas tramos de 500 m de carrera, nueve
-- kilometros -- que hoy se guardan como cinco filas y un marcador final. El reloj del
-- atleta, que no conoce la estructura, registro «1,73 km a 42:25 min/km»: la media de
-- correr y de hacer burpees en el mismo saco. Nuestra ventaja frente a cualquier reloj es
-- que la estructura la escribimos nosotros y podemos atribuir cada minuto a su estacion.
-- Sin esta columna esa ventaja no se puede ejercer.
--
-- POR QUE `not null default 0` Y NO NULLABLE. En Postgres dos NULL no colisionan, asi que
-- un unique que incluyera una columna nullable dejaria de proteger: se podrian insertar
-- infinitas filas con la misma (execution_id, position) y round_index null. Con 0 por
-- defecto, las filas que ya existen quedan todas en la ronda 0 -- que es la verdad, son
-- de formatos sin rondas -- y el constraint sigue haciendo su trabajo.
--
-- QUE SIGNIFICA EL 0. «Esta unidad no se repite»: una serie de carrera, un ejercicio
-- suelto, una pieza continua. No es «la primera ronda»: la primera ronda de un circuito
-- de tres es 1. Asi un lector puede distinguir «no aplica» de «la primera de varias» sin
-- mirar la prescripcion.
--
-- POR QUE VA EN LA FILA DE EJECUCION Y NO SE DEDUCE DEL PLAN. Un entreno libre no tiene
-- `template_segment_id`, asi que deducir la estructura de la prescripcion dejaria sin
-- rondas justo al caso que mas las improvisa. La estructura de lo EJECUTADO es un hecho
-- de lo ejecutado, exista o no un plan detras.
--
-- CONSECUENCIA CONOCIDA Y ACEPTADA. La relacion ejecucion<->prescripcion deja de ser 1:1
-- por posicion y pasa a ser 1:N. Todo lo que empareja tramos con el plan --la vista de
-- sesion del coach, `run-compliance`, `session-actuals`-- tiene que agregar por ronda o
-- enseñara el mismo ejercicio repetido. Es el cambio con mas superficie de impacto del
-- lote y va documentado aqui para que nadie lo descubra por sorpresa.
--
-- Idempotente. Aditiva: ninguna fila existente cambia de significado.

begin;

alter table segment_executions
  add column if not exists round_index int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'segment_executions_round_chk'
  ) then
    alter table segment_executions add constraint segment_executions_round_chk
      check (round_index >= 0);
  end if;
end $$;

-- El unique pasa a incluir la ronda. Se hace en dos pasos y no con un ALTER porque el
-- constraint viejo es el que impide insertar la segunda ronda: hay que quitarlo antes.
alter table segment_executions
  drop constraint if exists segment_executions_position_unique;

alter table segment_executions
  add constraint segment_executions_position_unique
  unique (execution_id, position, round_index);

-- Leer «todas las rondas de la estacion N de esta ejecucion, en orden» es la consulta
-- que hace el reporte para calcular la degradacion, y es nueva.
create index if not exists segment_executions_round_idx
  on segment_executions (execution_id, position, round_index);

commit;
