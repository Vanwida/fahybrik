// El readiness compuesto con el método del coach (0256): pesos relativos que se
// reparten entre las partes que hay, objetivo de sueño y castigo por adherencia.
// Un coach que no toca nada puntúa exactamente como antes.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_READINESS_METHOD,
  composeReadiness,
  readinessMethodOf,
  sleepComponentOf,
} from '@fahybrid/shared/domain/coach/athlete-daily-readiness';
import { mergeCoachThresholds } from '@fahybrid/shared/domain/coach/signal-thresholds';

const ALL = { sub_score: 60, hrv: 80, sleep: 90, rhr: 70, recovery: 50 };
const NONE = { sub_score: null, hrv: null, sleep: null, rhr: null, recovery: null };

describe('composeReadiness', () => {
  it('con los defectos da la media 0,35/0,25/0,2/0,1/0,1 de siempre', () => {
    // 60·0,35 + 80·0,25 + 90·0,2 + 70·0,1 + 50·0,1 = 21 + 20 + 18 + 7 + 5 = 71
    expect(composeReadiness(ALL, null)).toBe(71);
  });

  it('el peso de lo que falta se reparte entre lo que hay', () => {
    // Solo check-in (60) y VFC (80): 60·0,35/0,6 + 80·0,25/0,6 = 35 + 33,3 = 68
    expect(composeReadiness({ ...NONE, sub_score: 60, hrv: 80 }, null)).toBe(68);
  });

  it('sin ninguna parte no hay número (nunca un 50 inventado)', () => {
    expect(composeReadiness(NONE, 0.2)).toBeNull();
  });

  it('castiga la adherencia bajo el suelo del coach', () => {
    expect(composeReadiness(ALL, 0.59)).toBe(66);
    expect(composeReadiness(ALL, 0.6)).toBe(71);
    const lenient = readinessMethodOf(mergeCoachThresholds({ readiness_adherence_penalty: 0 }));
    expect(composeReadiness(ALL, 0.1, lenient)).toBe(71);
    const strict = readinessMethodOf(mergeCoachThresholds({ readiness_adherence_floor_pct: 80 }));
    expect(composeReadiness(ALL, 0.7, strict)).toBe(66);
  });

  it('los pesos del coach cambian el número; un peso 0 ignora esa parte', () => {
    const checkinOnly = readinessMethodOf(
      mergeCoachThresholds({
        readiness_weight_hrv: 0,
        readiness_weight_sleep: 0,
        readiness_weight_rhr: 0,
        readiness_weight_recovery: 0,
      }),
    );
    expect(checkinOnly.weights.sub_score).toBe(1);
    expect(composeReadiness(ALL, null, checkinOnly)).toBe(60);
    // Con solo el reloj (y la parte de check-in a 0), un check-in no da número.
    expect(composeReadiness({ ...NONE, hrv: 80 }, null, checkinOnly)).toBeNull();
  });
});

describe('objetivo de sueño', () => {
  it('8 h por defecto; el del coach manda', () => {
    expect(DEFAULT_READINESS_METHOD.sleep_target_hours).toBe(8);
    expect(sleepComponentOf(6)).toBe(75);
    const seven = readinessMethodOf(mergeCoachThresholds({ readiness_sleep_target_hours: 6 }));
    expect(sleepComponentOf(6, seven)).toBe(100);
  });
});
