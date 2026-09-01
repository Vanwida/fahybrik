-- 0176_set_velocity.sql
-- Fase 3: velocidad de barra por serie. El RIR tecleado se queda; esto lo calibra.

begin;

alter table set_executions
  add column if not exists mean_velocity_first_m_s real,
  add column if not exists mean_velocity_last_m_s real,
  add column if not exists velocity_loss_pct real,
  add column if not exists rom_m real,
  add column if not exists velocity_confidence real;

alter table set_executions drop constraint if exists set_executions_velocity_first_chk;
alter table set_executions add constraint set_executions_velocity_first_chk
  check (mean_velocity_first_m_s is null or mean_velocity_first_m_s >= 0);

alter table set_executions drop constraint if exists set_executions_velocity_last_chk;
alter table set_executions add constraint set_executions_velocity_last_chk
  check (mean_velocity_last_m_s is null or mean_velocity_last_m_s >= 0);

alter table set_executions drop constraint if exists set_executions_velocity_loss_chk;
alter table set_executions add constraint set_executions_velocity_loss_chk
  check (velocity_loss_pct is null or velocity_loss_pct >= 0);

alter table set_executions drop constraint if exists set_executions_rom_chk;
alter table set_executions add constraint set_executions_rom_chk
  check (rom_m is null or rom_m >= 0);

alter table set_executions drop constraint if exists set_executions_velocity_conf_chk;
alter table set_executions add constraint set_executions_velocity_conf_chk
  check (
    velocity_confidence is null
    or (velocity_confidence >= 0 and velocity_confidence <= 1)
  );

comment on column set_executions.mean_velocity_first_m_s is
  'Velocidad media concéntrica de la primera rep de la serie (m/s). NULL = no medido o no fiable.';
comment on column set_executions.mean_velocity_last_m_s is
  'Velocidad media concéntrica de la última rep de la serie (m/s).';
comment on column set_executions.velocity_loss_pct is
  'Pérdida de velocidad (primera→última) en tanto por ciento.';
comment on column set_executions.rom_m is
  'Recorrido medio estimado de la barra (m).';
comment on column set_executions.velocity_confidence is
  'Confianza [0,1] del estimador. Por debajo del umbral del coach no se enseña.';

commit;
