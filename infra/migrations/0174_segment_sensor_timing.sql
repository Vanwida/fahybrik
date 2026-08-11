-- 0174_segment_sensor_timing.sql
-- Fase 1: trabajo real vs descanso medidos por el sensor de muñeca.

begin;

alter table segment_executions
  add column if not exists sensor_work_s real,
  add column if not exists sensor_rest_s real,
  add column if not exists sensor_timing_confidence real;

alter table segment_executions drop constraint if exists segment_executions_sensor_work_chk;
alter table segment_executions add constraint segment_executions_sensor_work_chk
  check (sensor_work_s is null or sensor_work_s >= 0);

alter table segment_executions drop constraint if exists segment_executions_sensor_rest_chk;
alter table segment_executions add constraint segment_executions_sensor_rest_chk
  check (sensor_rest_s is null or sensor_rest_s >= 0);

alter table segment_executions drop constraint if exists segment_executions_sensor_timing_conf_chk;
alter table segment_executions add constraint segment_executions_sensor_timing_conf_chk
  check (
    sensor_timing_confidence is null
    or (sensor_timing_confidence >= 0 and sensor_timing_confidence <= 1)
  );

comment on column segment_executions.sensor_work_s is
  'Segundos de trabajo real del tramo según el detector de energía de muñeca (fase 1). NULL = no medido.';
comment on column segment_executions.sensor_rest_s is
  'Segundos de descanso/colocación dentro del tramo según el sensor. NULL = no medido.';
comment on column segment_executions.sensor_timing_confidence is
  'Confianza [0,1] del detector trabajo/descanso. NULL = no medido.';

commit;
