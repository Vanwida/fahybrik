-- 0157: SEMANA CERO — los días entre que el coach asigna el plan y el lunes
-- que arranca.
--
-- EL HUECO
-- --------
-- Un plan siempre empieza en lunes (el materializador alinea a lunes; una
-- semana ES lunes-domingo en analíticas, adherencia y periodización). La vía de
-- asignación por defecto arranca el lunes SIGUIENTE, así que un atleta al que
-- se le asigna un martes tiene 6 días sin nada, y uno al que se le asigna un
-- lunes tiene 7 — el peor caso, y justo el día en que un coach hace papeleo.
-- Hasta ahora esos días eran un vacío mudo.
--
-- QUÉ CAMBIA AQUÍ, Y POR QUÉ ES TAN POCO
-- ---------------------------------------
-- El modelo ya sabía COLOCAR contenido relativo al plan: `coach_test_schedule`
-- es (test, week_offset, day_of_week) y el inyector automático corre en todas
-- las vías de asignación. Lo único que faltaba era poder decir «ANTES de la
-- semana 1» — y los días huérfanos son siempre la cola de la semana previa, así
-- que encajan en el mismo (week_offset, day_of_week) con offset 0. No hace
-- falta tabla nueva ni concepto nuevo: solo ensanchar en uno el rango.
--
--   week_offset = 0  → semana cero (antes de empezar)
--   week_offset = 1  → primera semana del plan   ← lo de siempre
--
-- El defecto de la columna sigue siendo 1: nada de lo que ya existe cambia de
-- comportamiento, y los 8 schedules reales en producción están todos en 1.
--
-- SEPARACIÓN Y MARGEN — método del coach, no constante nuestra
-- ------------------------------------------------------------
-- Un 5K control o una batería de 1RM FATIGAN: ponerlos pegados entre sí, o el
-- día antes de que arranque el plan, sabotea la semana 1. Cuánto margen dejar
-- es criterio del coach (HARD RULE Nº0: si otro entrenador competente lo haría
-- distinto, es dato editable), así que viven como columnas con un defecto
-- sensato y no cableados:
--
--   rest_days_after       — días libres que pide esta pieza detrás (0 = ninguno)
--   coaches.zero_week_buffer_days — días de descanso antes de que arranque el plan
--
-- Idempotente: `if not exists` / `drop constraint if exists` en todo.

begin;

-- ── 1 · week_offset admite 0 ─────────────────────────────────────────────────
alter table coach_test_schedule
  drop constraint if exists coach_test_schedule_week_chk;

alter table coach_test_schedule
  add constraint coach_test_schedule_week_chk check (week_offset >= 0);

comment on column coach_test_schedule.week_offset is
  '0 = semana cero (los días antes de que arranque el plan); 1+ = semana N del plan (1-based).';

-- ── 2 · Cuántos días libres pide una pieza detrás ────────────────────────────
-- Un test duro no puede ir pegado al siguiente. 0 = puede encadenarse (una
-- movilidad, una activación). El defecto es 0 para no cambiar el comportamiento
-- de las 8 filas que ya existen: quien quiera separación la declara.
alter table coach_test_schedule
  add column if not exists rest_days_after smallint not null default 0;

alter table coach_test_schedule
  drop constraint if exists coach_test_schedule_rest_after_chk;

alter table coach_test_schedule
  add constraint coach_test_schedule_rest_after_chk
  check (rest_days_after >= 0 and rest_days_after <= 3);

comment on column coach_test_schedule.rest_days_after is
  'Días libres que esta pieza pide DETRÁS (0 = se puede encadenar). Método del coach: un 5K control pide 1, una movilidad 0.';

-- ── 3 · Margen antes de que arranque el plan ─────────────────────────────────
-- Días de la semana cero que se dejan libres pegados al lunes, para que el
-- atleta no arranque la semana 1 fatigado. Es del COACH, no del sistema: uno
-- querrá 2 días de margen y otro ninguno. Defecto 1 (un día de respiro), que es
-- lo conservador sin ser restrictivo.
alter table coaches
  add column if not exists zero_week_buffer_days smallint not null default 1;

alter table coaches
  drop constraint if exists coaches_zero_week_buffer_chk;

alter table coaches
  add constraint coaches_zero_week_buffer_chk
  check (zero_week_buffer_days >= 0 and zero_week_buffer_days <= 3);

comment on column coaches.zero_week_buffer_days is
  'Días de la semana cero que se dejan libres justo antes de que arranque el plan, para no empezar fatigado. Método del coach; defecto 1.';

commit;
