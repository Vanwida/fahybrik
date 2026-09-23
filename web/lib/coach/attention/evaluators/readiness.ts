// Readiness evaluator — frente a la BASE PROPIA del atleta, con persistencia y
// frescura (SPEC §8 «tendencia, no foto»; auditoría del panel, informe B H4).
//
// Antes saltaba con UNA lectura bajo 67 (la banda de pintar), sin base, sin
// persistencia y sin fecha: 49 de 100 atletas en Hoy. Ahora:
//   - CRÍTICO si la última lectura está bajo el suelo del coach (defecto 40);
//   - VIGILAR si lleva N días seguidos ≥ X puntos bajo su mediana de 28 días;
//   - nada si la última lectura tiene más de M días.
// Los números son del coach (`coach_signal_thresholds`); el cómo, de
// `readiness-baseline.ts`. La evidencia dice valor, base, ventana y fecha.

import {
  type SignalEvaluator,
  type SignalResult,
  dedupeKey,
} from '@fahybrid/shared/domain/coach/signals';
import { relativeDay, dias } from '@fahybrid/shared/domain/coach/athlete-state';
import { assessReadiness } from '../readiness-baseline';

export const readinessLowEvaluator: SignalEvaluator = {
  kind: 'readiness_low',
  default_severity: 'critical',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    const a = assessReadiness(facts.readiness_series, facts.today_iso, {
      readiness_critical_floor: thresholds.readiness_critical_floor!,
      readiness_drop_points: thresholds.readiness_drop_points!,
      readiness_drop_days: thresholds.readiness_drop_days!,
      readiness_max_age_days: thresholds.readiness_max_age_days!,
    });
    if (!a.fires || a.latest == null || a.severity == null) return null;

    const when = relativeDay(a.latest.on, facts.today_iso);
    const parts: string[] = [];
    if (a.baseline != null) {
      const diff = a.latest.score - a.baseline;
      parts.push(`${diff >= 0 ? '+' : '−'}${Math.abs(diff)} vs su base ${a.baseline} (28 d)`);
    } else {
      parts.push(`sin base aún (${a.baseline_readings} ${a.baseline_readings === 1 ? 'lectura' : 'lecturas'})`);
    }
    if (a.below_floor) parts.push(`bajo tu suelo de ${thresholds.readiness_critical_floor}`);
    if (a.drop_streak_days >= 2) parts.push(`${dias(a.drop_streak_days)} seguidos`);
    parts.push(when);

    return {
      kind: 'readiness_low',
      fires: true,
      severity: a.severity,
      value: a.latest.score,
      baseline: a.baseline,
      trend: 'down',
      label: `Readiness ${a.latest.score}`,
      detail: parts.join(' · '),
      observed_at: `${a.latest.on}T12:00:00.000Z`,
      window_label: '28 d',
      // El episodio (primer día de la racha actual) es la identidad: si el coach lo
      // da por hecho y el atleta se recupera y vuelve a caer, es otro episodio.
      dedupe_key: dedupeKey('readiness_low', facts.athlete_id, a.episode_start ?? a.latest.on),
    };
  },
};
