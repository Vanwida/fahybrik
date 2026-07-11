import type { AthleteContextPack } from './coach-ia-context';

export type WeeklyVerdict = 'ok' | 'needs_adjustment';

/** Reglas v1 — ver Decisiones cerradas plan maestro. */
export function evaluateWeeklyVerdictFromContext(
  pack: AthleteContextPack,
): { verdict: WeeklyVerdict; triggers: string[] } {
  const triggers: string[] = [];

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
