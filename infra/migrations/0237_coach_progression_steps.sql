-- 0237 · Los pasos de «Progresar selección…» del editor de programas son del coach.
--
-- POR QUÉ (informe D §4.1, PLAN §6 «Programar», HARD RULE Nº0)
-- ------------------------------------------------------------
-- El editor de programas aplica a un rango de semanas «+x % de carga por
-- semana», «+n series» y «descarga −x % de volumen». CÓMO se aplica es mecanismo
-- (web/lib/dashboard/programming/progress-ops.ts); CUÁNTO es método: uno sube
-- 2,5 puntos por semana, otro 5; uno descarga un 30 %, otro un 50 %.
--
--   · `progression_load_step_pct`  — paso de carga por semana (puntos de %RM /
--     % de kg). Puede ser negativo nunca: el coach elige el signo al aplicar.
--   · `progression_sets_step`      — series que suma cada paso.
--   · `deload_volume_pct`          — cuánto volumen quita una descarga.
--
-- ANULABLES sin default de columna: el defecto es MÉTODO y vive como dato en
-- `shared/domain/coach/progression-steps.ts` (DECISIONS 2026-08-09). NULL = el
-- defecto; un coach que no toca nada ve los valores de siempre.
--
-- ADITIVA E IDEMPOTENTE.

begin;

alter table coaches add column if not exists progression_load_step_pct numeric(4,2);
alter table coaches add column if not exists progression_sets_step smallint;
alter table coaches add column if not exists deload_volume_pct smallint;

alter table coaches drop constraint if exists coaches_progression_load_step_chk;
alter table coaches add constraint coaches_progression_load_step_chk
  check (progression_load_step_pct is null or (progression_load_step_pct > 0 and progression_load_step_pct <= 20));
alter table coaches drop constraint if exists coaches_progression_sets_step_chk;
alter table coaches add constraint coaches_progression_sets_step_chk
  check (progression_sets_step is null or (progression_sets_step >= 1 and progression_sets_step <= 5));
alter table coaches drop constraint if exists coaches_deload_volume_pct_chk;
alter table coaches add constraint coaches_deload_volume_pct_chk
  check (deload_volume_pct is null or (deload_volume_pct >= 5 and deload_volume_pct <= 80));

comment on column coaches.progression_load_step_pct is
  'Paso de carga por semana de «Progresar» (puntos de %RM / % de kg). NULL = defecto de shared/domain/coach/progression-steps.ts.';
comment on column coaches.progression_sets_step is
  'Series que suma cada paso de «Progresar». NULL = defecto.';
comment on column coaches.deload_volume_pct is
  'Volumen que quita una descarga (%). NULL = defecto.';

commit;
