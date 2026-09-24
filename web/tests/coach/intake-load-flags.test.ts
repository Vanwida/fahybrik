// Los avisos de sueño y estrés del alta usan los umbrales del coach (0256):
// sueño ≤ 4/10 y estrés ≥ 7/10 por defecto.

import { describe, expect, it } from 'vitest';
import { intakeLoadFlags } from '@/lib/coach/intake';
import { mergeCoachThresholds } from '@fahybrid/shared/domain/coach/signal-thresholds';

describe('intakeLoadFlags', () => {
  it('con los defectos avisa de sueño 4 y estrés 7, no de 5 y 6', () => {
    const t = mergeCoachThresholds(null);
    expect(intakeLoadFlags({ sleep_quality: 4, stress_level: 7 }, t)).toEqual(['sueño 4/10', 'estrés 7/10']);
    expect(intakeLoadFlags({ sleep_quality: 5, stress_level: 6 }, t)).toEqual([]);
    expect(intakeLoadFlags({ sleep_quality: null, stress_level: null }, t)).toEqual([]);
  });

  it('con los del coach', () => {
    const t = mergeCoachThresholds({ intake_low_sleep_max: 6, intake_high_stress_min: 9 });
    expect(intakeLoadFlags({ sleep_quality: 5, stress_level: 7 }, t)).toEqual(['sueño 5/10']);
  });
});
