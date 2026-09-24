-- 0243 — «Entrenos sin hacer» avisa por número Y por proporción de lo debido.
-- Con 100 atletas, «2 sin hacer» sin más saltaba para quien hizo 8 de 10 (una
-- semana normal). La proporción es MÉTODO del coach (otro exigirá más o menos),
-- así que va a `coach_signal_thresholds` como el resto. NULL = el defecto
-- (COACH_THRESHOLD_SPEC.missed_sessions_share_pct, 30); 0 = solo el número.
-- Nunca `default` de columna (DECISIONS 2026-08-09). Idempotente.

alter table coach_signal_thresholds add column if not exists missed_sessions_share_pct smallint;

do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_missed_share_chk
    check (missed_sessions_share_pct is null or missed_sessions_share_pct between 0 and 100);
exception when duplicate_object then null;
end $$;
