-- 0282 — El método del coach que la muñeca necesita para correr pasa a ser dato.
--
-- Rediseño de correr en el reloj (docs/reloj-muneca/modelo.md, plan del 29-09-2026).
-- HARD RULE Nº0: lo que un entrenador competente pondría distinto NO puede ser un
-- `const` del reloj. Hoy vivía cableado en el kit del doble (`REGLAS_AVISO_DEFECTO`,
-- `METODO_RESUMEN_DEFECTO`, `RPE_PALABRA_DEFECTO`) y en Swift (`Vivo.reglasAvisoDefecto`,
-- `UmbralesCorrer`, la vuelta de 1000 m en `Vivo+PlanDeSesion.swift`):
--
--   · avisos: holgura por eje, cadencia entre avisos, confirmación, gracia a zona,
--     avisar en calentamiento y en recuperación, hacia dónde avisa un rodaje a zona.
--   · preaviso del final de un paso y el paso más corto que lo lleva.
--   · vuelta automática (metros. 0 = apagada) y en qué clases de sesión.
--   · dónde empieza una tirada y hasta dónde llega un stride.
--   · si de calentar a las series se pasa solo o hasta pulsar.
--   · qué fracción de una serie cortada cuenta como hecha, y tras cuánto quieto se
--     guarda sola una sesión que ya acabó.
--   · las once palabras del RPE.
--
-- Va a `coach_signal_thresholds` como el resto de su método (mismo patrón que 0256):
-- una columna nullable por clave de COACH_THRESHOLD_SPEC, sin `default` de columna.
-- NULL = el defecto del dominio (shared/domain/coach/signal-thresholds.ts), que es
-- EXACTAMENTE el valor de hoy: un coach que no toca nada se comporta como hoy. Los
-- CHECK repiten los límites del spec. Los interruptores son smallint 0/1 y
-- `wrist_alert_continuous_zone` es la posición en una lista corta (0 nunca, 1 solo
-- por arriba, 2 los dos sentidos). La coherencia entre columnas (preaviso, vuelta
-- automática) la comprueba el PUT sobre los valores efectivos (`thresholdIssues`).
--
-- Las once palabras del RPE van como text[] (mismo criterio que `fuentes_*` en
-- coach_analytics_method, 0277): una lista ORDENADA y corta, no un JSON. El CHECK
-- exige once elementos, ninguno nulo ni vacío. El largo de cada palabra lo valida
-- el PUT (Zod), que es el único escritor.
--
-- Aditiva. No toca ninguna fila existente. Idempotente. El runner envuelve el
-- fichero en UNA transacción (sin begin/commit aquí) y corta por punto y coma, así
-- que ningún comentario lleva uno.

alter table coach_signal_thresholds
  add column if not exists wrist_slack_pace_s smallint,
  add column if not exists wrist_slack_hr_bpm smallint,
  add column if not exists wrist_slack_split500_s smallint,
  add column if not exists wrist_slack_watts smallint,
  add column if not exists wrist_slack_cadence_spm smallint,
  add column if not exists wrist_alert_gap_s smallint,
  add column if not exists wrist_alert_confirm_s smallint,
  add column if not exists wrist_alert_zone_grace_s smallint,
  add column if not exists wrist_alert_in_warmup smallint,
  add column if not exists wrist_alert_in_recovery smallint,
  add column if not exists wrist_alert_continuous_zone smallint,
  add column if not exists wrist_prewarn_s smallint,
  add column if not exists wrist_prewarn_m smallint,
  add column if not exists wrist_prewarn_min_step_s smallint,
  add column if not exists wrist_auto_lap_m smallint,
  add column if not exists wrist_auto_lap_rodaje smallint,
  add column if not exists wrist_auto_lap_tirada smallint,
  add column if not exists wrist_auto_lap_tempo smallint,
  add column if not exists wrist_auto_lap_progresivo smallint,
  add column if not exists wrist_auto_lap_carrera smallint,
  add column if not exists wrist_long_run_min smallint,
  add column if not exists wrist_long_run_km smallint,
  add column if not exists wrist_stride_max_s smallint,
  add column if not exists wrist_gate_manual smallint,
  add column if not exists wrist_short_rep_done_pct smallint,
  add column if not exists wrist_idle_save_min smallint,
  add column if not exists wrist_rpe_words text[];

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('wrist_slack_pace_s', 0, 30),
      ('wrist_slack_hr_bpm', 0, 20),
      ('wrist_slack_split500_s', 0, 30),
      ('wrist_slack_watts', 0, 100),
      ('wrist_slack_cadence_spm', 0, 30),
      ('wrist_alert_gap_s', 5, 300),
      ('wrist_alert_confirm_s', 0, 30),
      ('wrist_alert_zone_grace_s', 0, 300),
      ('wrist_alert_in_warmup', 0, 1),
      ('wrist_alert_in_recovery', 0, 1),
      ('wrist_alert_continuous_zone', 0, 2),
      ('wrist_prewarn_s', 0, 60),
      ('wrist_prewarn_m', 0, 500),
      ('wrist_prewarn_min_step_s', 0, 300),
      ('wrist_auto_lap_m', 0, 10000),
      ('wrist_auto_lap_rodaje', 0, 1),
      ('wrist_auto_lap_tirada', 0, 1),
      ('wrist_auto_lap_tempo', 0, 1),
      ('wrist_auto_lap_progresivo', 0, 1),
      ('wrist_auto_lap_carrera', 0, 1),
      ('wrist_long_run_min', 20, 300),
      ('wrist_long_run_km', 5, 60),
      ('wrist_stride_max_s', 5, 120),
      ('wrist_gate_manual', 0, 1),
      ('wrist_short_rep_done_pct', 50, 100),
      ('wrist_idle_save_min', 1, 60)
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

  begin
    alter table coach_signal_thresholds
      add constraint coach_signal_thresholds_wrist_rpe_words_chk
      check (
        wrist_rpe_words is null
        or (
          cardinality(wrist_rpe_words) = 11
          and array_position(wrist_rpe_words, null) is null
          and array_position(wrist_rpe_words, '') is null
        )
      );
  exception when duplicate_object then null;
  end;
end $$;
