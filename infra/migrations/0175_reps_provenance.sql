-- 0175_reps_provenance.sql
-- Fase 2: quién contó las repeticiones y con qué confianza.

begin;

alter table segment_executions
  add column if not exists reps_source text,
  add column if not exists reps_confidence real;

alter table segment_executions drop constraint if exists segment_executions_reps_source_chk;
alter table segment_executions add constraint segment_executions_reps_source_chk
  check (
    reps_source is null
    or reps_source in ('athlete_tap', 'sensor', 'sensor_corrected')
  );

alter table segment_executions drop constraint if exists segment_executions_reps_confidence_chk;
alter table segment_executions add constraint segment_executions_reps_confidence_chk
  check (
    reps_confidence is null
    or (reps_confidence >= 0 and reps_confidence <= 1)
  );

comment on column segment_executions.reps_source is
  'Procedencia del conteo: athlete_tap | sensor | sensor_corrected. NULL = no aplica o pre-fase-2.';
comment on column segment_executions.reps_confidence is
  'Confianza [0,1] del contador de sensor. NULL si la fuente no es sensor.';

-- También por serie, porque una serie de fuerza es el grano real del contador.
alter table set_executions
  add column if not exists reps_source text,
  add column if not exists reps_confidence real;

alter table set_executions drop constraint if exists set_executions_reps_source_chk;
alter table set_executions add constraint set_executions_reps_source_chk
  check (
    reps_source is null
    or reps_source in ('athlete_tap', 'sensor', 'sensor_corrected')
  );

alter table set_executions drop constraint if exists set_executions_reps_confidence_chk;
alter table set_executions add constraint set_executions_reps_confidence_chk
  check (
    reps_confidence is null
    or (reps_confidence >= 0 and reps_confidence <= 1)
  );

commit;
