-- 0242 — Cuántos días espera el panel antes de volver a proponer una revisión 1:1
-- al mismo atleta (el antispam de `proposeReview`). Era `const 14` en
-- web/lib/citas/reviews.ts; es MÉTODO del coach (otro la re-propondría a la
-- semana o al mes), así que pasa a `coach_signal_thresholds` como el resto de sus
-- umbrales. NULL = el defecto (COACH_THRESHOLD_SPEC.review_reproposal_days, 14),
-- nunca `default` de columna (DECISIONS 2026-08-09). Límites = los del dominio.
-- Idempotente.

alter table coach_signal_thresholds add column if not exists review_reproposal_days smallint;

do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_review_reproposal_chk
    check (review_reproposal_days is null or review_reproposal_days between 1 and 90);
exception when duplicate_object then null;
end $$;
