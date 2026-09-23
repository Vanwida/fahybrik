// Readiness evaluator — frente a la BASE PROPIA del atleta, con persistencia y
// frescura (SPEC §8 «tendencia, no foto»; auditoría del panel, informe B H4).
//
// Antes saltaba con UNA lectura bajo 67 (la banda de pintar), sin base, sin
// persistencia y sin fecha: 49 de 100 atletas en Hoy. Ahora:
//   - CRÍTICO si la última lectura está bajo el suelo del coach (defecto 40) y el
//     atleta ya tiene base; sin base, VIGILAR como mucho (y la acción es
//     preguntarle, no una descarga: `signalAction` en signals-read.ts);
//   - VIGILAR si lleva N días seguidos ≥ X puntos bajo su mediana de 28 días;
//   - nada si la última lectura tiene más de M días.
// Los números son del coach (`coach_signal_thresholds`); el cómo, de
// `readiness-baseline.ts`. La evidencia dice valor, fecha, base y ventana con LA
// frase de `readinessEvidence` (la misma en Hoy, vistazo, roster y ficha).

import {
  type SignalEvaluator,
  type SignalResult,
  dedupeKey,
} from '@fahybrid/shared/domain/coach/signals';
import { dias } from '@fahybrid/shared/domain/coach/athlete-state';
import { readinessEvidence } from '@fahybrid/shared/domain/coach/readiness-evidence';
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

    const parts: string[] = [
      readinessEvidence({
        value: a.latest.score,
        baseline: a.baseline,
        baseline_readings: a.baseline_readings,
        observed_on: a.latest.on,
        today: facts.today_iso,
      }),
    ];
    if (a.below_floor) parts.push(`bajo tu suelo de ${thresholds.readiness_critical_floor}`);
    if (a.drop_streak_days >= 2) parts.push(`${dias(a.drop_streak_days)} seguidos`);

    return {
      kind: 'readiness_low',
      fires: true,
      severity: a.severity,
      value: a.latest.score,
      baseline: a.baseline,
      trend: 'down',
      // El número va en la evidencia, con su fecha y su base: la etiqueta dice qué pasa.
      label: 'Readiness baja',
      detail: parts.join(' · '),
      observed_at: `${a.latest.on}T12:00:00.000Z`,
      window_label: '28 d',
      // El episodio (primer día de la racha actual) es la identidad: si el coach lo
      // da por hecho y el atleta se recupera y vuelve a caer, es otro episodio.
      dedupe_key: dedupeKey('readiness_low', facts.athlete_id, a.episode_start ?? a.latest.on),
    };
  },
};
