-- 0280 — El «¿mejoro?» por familia de las analíticas rehechas (docs/analiticas/modelo.md
-- §3 filas 5-6, A6 y A9, 29-09-2026): el cambio que cuenta en cada familia y
-- cuántas reps admite una serie para estimar su 1RM.
--
-- HARD RULE Nº0. Lo que un entrenador competente pondría distinto nace como dato:
--   · qué cambio entre dos periodos cuenta como cambio en un ergo, en fuerza, en
--     una estación, en un WOD repetido o en un test (correr ya lo tenía:
--     `coach_running_thresholds.meaningful_gain_s_per_km`, que se sigue usando)
--   · hasta cuántas reps se fía de una serie para estimar un 1RM (la FÓRMULA ya
--     es suya en `coach_methodology.one_rm_estimation`, la misma con la que se
--     guardan sus tests de fuerza: no se duplica aquí).
--
-- Mismo patrón que 0277: columnas nullable sin `default`, NULL = el defecto del
-- producto (shared/domain/analytics/metodo.ts). Un coach que no toca nada ve los
-- defectos. Los CHECK repiten ANALYTICS_METHOD_BOUNDS.
--
-- Aditiva. Idempotente. El runner envuelve el fichero en UNA transacción (sin
-- begin/commit aquí) y corta por punto y coma, así que ningún comentario lleva uno.

alter table coach_analytics_method
  add column if not exists cambio_ergo_pct        numeric(3,1),
  add column if not exists cambio_fuerza_pct      numeric(3,1),
  add column if not exists cambio_estaciones_pct  numeric(3,1),
  add column if not exists cambio_wod_pct         numeric(3,1),
  add column if not exists cambio_test_pct        numeric(3,1),
  add column if not exists fuerza_1rm_reps_max    smallint;

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('cambio_ergo_pct',        0.5, 20),
      ('cambio_fuerza_pct',      0.5, 20),
      ('cambio_estaciones_pct',  0.5, 30),
      ('cambio_wod_pct',         0.5, 30),
      ('cambio_test_pct',        0.5, 30),
      ('fuerza_1rm_reps_max',    1, 20)
    ) as t(col, lo, hi)
  loop
    begin
      execute format(
        'alter table coach_analytics_method add constraint %I check (%I is null or %I between %s and %s)',
        'coach_analytics_method_' || c.col || '_chk', c.col, c.col, c.lo, c.hi
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

comment on column coach_analytics_method.cambio_ergo_pct is
  'Cambio entre periodos que cuenta en un ergo (remo, ski, bici), en % del ritmo o de los vatios. NULL = 1.';
comment on column coach_analytics_method.cambio_fuerza_pct is
  'Cambio entre periodos que cuenta en el 1RM estimado (o en las reps a peso corporal), en %. NULL = 2,5.';
comment on column coach_analytics_method.cambio_estaciones_pct is
  'Cambio entre periodos que cuenta en el tiempo de una estación a la misma dosis y carga, en %. NULL = 3.';
comment on column coach_analytics_method.cambio_wod_pct is
  'Cambio entre periodos que cuenta en la puntuación de un WOD repetido (tiempo o reps), en %. NULL = 3.';
comment on column coach_analytics_method.cambio_test_pct is
  'Cambio entre periodos que cuenta en el resultado de un test del coach, en %. NULL = 2.';
comment on column coach_analytics_method.fuerza_1rm_reps_max is
  'Reps máximas de una serie para estimar su 1RM con la fórmula del coach (coach_methodology.one_rm_estimation). NULL = 10.';
