-- 0244 — Con cuántos días de antelación avisa Hoy de que un atleta se da de baja
-- (canceló y su periodo termina). Era `renewal_alert_days: 7` en
-- web/lib/coach/signal-config.ts; es MÉTODO del coach (uno quiere hablar con
-- quien se va dos semanas antes, otro el último día), así que pasa a
-- `coach_signal_thresholds` como el resto de sus umbrales. NULL = el defecto
-- (COACH_THRESHOLD_SPEC.renewal_alert_days, 7), nunca `default` de columna
-- (DECISIONS 2026-08-09). Límites = los del dominio. Idempotente.

alter table coach_signal_thresholds add column if not exists renewal_alert_days smallint;

do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_renewal_alert_chk
    check (renewal_alert_days is null or renewal_alert_days between 1 and 60);
exception when duplicate_object then null;
end $$;
