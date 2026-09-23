import type { AthleteContextPack } from './coach-ia-context';

export type WeeklyVerdict = 'ok' | 'needs_adjustment';

/** Prefijo del código de trigger de una señal viva del cuerpo (`signal:readiness_low`). */
export const BODY_SIGNAL_TRIGGER = 'signal:';

/**
 * Reglas v1 — ver Decisiones cerradas plan maestro.
 *
 * Además de la semana evaluada, el veredicto lee las SEÑALES VIVAS del cuerpo
 * que el coach ve en Hoy (`pack.body_signals`: readiness, HRV, RPE con acción
 * «Proponer descarga»). Antes el motor miraba solo la semana pasada: el coach
 * pulsaba «Proponer descarga» por un readiness de hoy y el motor contestaba
 * «mantener» porque la adherencia era del 100 % (informe C, P0). Una señal que
 * pide descarga es, por sí sola, motivo de ajuste.
 *
 * DEUDA (HARD RULE Nº0): los números de las reglas de semana (0,6 · 40 · 45 · 2
 * · −15 %) siguen en código; deberían salir de los umbrales del coach como las
 * señales (`coach_signal_thresholds`).
 */
export function evaluateWeeklyVerdictFromContext(
  pack: AthleteContextPack,
): { verdict: WeeklyVerdict; triggers: string[] } {
  const triggers: string[] = [];

  for (const s of pack.body_signals ?? []) {
    const code = `${BODY_SIGNAL_TRIGGER}${s.kind}`;
    if (!triggers.includes(code)) triggers.push(code);
  }
  if (pack.compliance_7d != null && pack.compliance_7d < 0.6) {
    triggers.push('compliance_7d_below_60');
  }
  if (pack.readiness_sub_score != null && pack.readiness_sub_score < 40) {
    triggers.push('sub_score_below_40');
  }
  if (pack.readiness.score != null && pack.readiness.score < 45) {
    triggers.push('readiness_below_45');
  }
  if (pack.compliance.missed_7d >= 2) {
    triggers.push('missed_sessions_2plus');
  }
  if (pack.readiness.hrv_delta_pct != null && pack.readiness.hrv_delta_pct < -0.15) {
    triggers.push('hrv_drop_15');
  }

  const verdict: WeeklyVerdict = triggers.length > 0 ? 'needs_adjustment' : 'ok';
  return { verdict, triggers };
}
