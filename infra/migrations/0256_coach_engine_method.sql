-- 0256 — El método de los motores secundarios pasa a ser dato del coach.
--
-- Eran `const` en código y son MÉTODO (HARD RULE Nº0: otro entrenador competente
-- los pondría distinto): los pesos del readiness compuesto, las horas de sueño
-- que puntúan entero y el castigo por adherencia baja
-- (shared/domain/coach/athlete-daily-readiness.ts); los pesos del índice de
-- disposición y su ventana de TSB (race-readiness.ts); los umbrales de «Listo
-- para progresar» (progress-readiness.ts); los días de pausa por año
-- (pause-budget.ts); y los avisos de sueño/estrés del alta (web/lib/coach/intake.ts).
--
-- Van a `coach_signal_thresholds` como el resto de sus umbrales: una columna
-- nullable por clave de COACH_THRESHOLD_SPEC. NULL = el defecto del dominio (el
-- valor de hoy), nunca `default` de columna (DECISIONS 2026-08-09). Los CHECK
-- repiten los límites de la tabla; la coherencia entre columnas (ACWR bajo <
-- alto, un grupo de pesos no todo a cero) la comprueba el PUT sobre los valores
-- efectivos (`thresholdIssues`). Idempotente.

alter table coach_signal_thresholds
  add column if not exists readiness_weight_checkin smallint,
  add column if not exists readiness_weight_hrv smallint,
  add column if not exists readiness_weight_sleep smallint,
  add column if not exists readiness_weight_rhr smallint,
  add column if not exists readiness_weight_recovery smallint,
  add column if not exists readiness_sleep_target_hours smallint,
  add column if not exists readiness_adherence_floor_pct smallint,
  add column if not exists readiness_adherence_penalty smallint,
  add column if not exists race_readiness_weight_freshness smallint,
  add column if not exists race_readiness_weight_adherence smallint,
  add column if not exists race_readiness_weight_hrv smallint,
  add column if not exists race_readiness_weight_activity smallint,
  add column if not exists race_readiness_tsb_span smallint,
  add column if not exists progress_adherence_min_pct smallint,
  add column if not exists progress_acr_high_pct smallint,
  add column if not exists progress_acr_low_pct smallint,
  add column if not exists progress_tsb_fatigue smallint,
  add column if not exists progress_benchmark_drop_pct smallint,
  add column if not exists pause_budget_days smallint,
  add column if not exists intake_low_sleep_max smallint,
  add column if not exists intake_high_stress_min smallint;

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('readiness_weight_checkin', 0, 100),
      ('readiness_weight_hrv', 0, 100),
      ('readiness_weight_sleep', 0, 100),
      ('readiness_weight_rhr', 0, 100),
      ('readiness_weight_recovery', 0, 100),
      ('readiness_sleep_target_hours', 5, 12),
      ('readiness_adherence_floor_pct', 0, 100),
      ('readiness_adherence_penalty', 0, 30),
      ('race_readiness_weight_freshness', 0, 100),
      ('race_readiness_weight_adherence', 0, 100),
      ('race_readiness_weight_hrv', 0, 100),
      ('race_readiness_weight_activity', 0, 100),
      ('race_readiness_tsb_span', 3, 50),
      ('progress_adherence_min_pct', 0, 100),
      ('progress_acr_high_pct', 100, 300),
      ('progress_acr_low_pct', 10, 100),
      ('progress_tsb_fatigue', 5, 80),
      ('progress_benchmark_drop_pct', 0, 20),
      ('pause_budget_days', 0, 365),
      ('intake_low_sleep_max', 1, 10),
      ('intake_high_stress_min', 1, 10)
    ) as t(col, lo, hi)
  loop
    begin
      execute format(
        'alter table coach_signal_thresholds add constraint %I check (%I is null or %I between %s and %s)',
        'coach_signal_thresholds_' || c.col || '_chk', c.col, c.col, c.lo, c.hi
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
