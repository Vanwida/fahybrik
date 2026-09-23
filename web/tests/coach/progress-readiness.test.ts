// The progression engine must never turn ABSENCE of evidence into a green light.
// Both holes it can have — nobody was scheduled yet, and part of the executed
// work has no intensity — used to be filled with a flattering default: adherence
// 1 (perfect) and an intensity factor of 0.65. Either one alone was enough to
// put "listo para progresar · confianza alta" in Pablo's queue for an athlete
// who had not trained. See docs/CONTRATO-UI.md §7.

import { describe, expect, test } from 'vitest';
import {
  assessProgressReadiness,
  DEFAULT_PROGRESS_METHOD,
  progressMethodOf,
  type ProgressReadinessInput,
} from '@fahybrid/shared/domain/coach/progress-readiness';
import { mergeCoachThresholds } from '@fahybrid/shared/domain/coach/signal-thresholds';

/** A microciclo finished cleanly, with load fully measured and benchmarks up. */
function baseInput(over: Partial<ProgressReadinessInput> = {}): ProgressReadinessInput {
  return {
    week_index: 4,
    week_count: 4,
    compliance_pct: 0.95,
    load: { ctl: 60, atl: 55, tsb: 5, acr: 1.0, intensity_coverage: 1 },
    benchmark_progression_pct: 3.2,
    ...over,
  };
}

describe('assessProgressReadiness · adherencia', () => {
  test('a real, high adherence still advances — the honest cases keep working', () => {
    const r = assessProgressReadiness(baseInput());
    expect(r.recommendation).toBe('advance');
    expect(r.confidence).toBe('high');
    expect(r.flags).not.toContain('compliance_unknown');
  });

  test('UNKNOWN adherence never advances, and says why', () => {
    const r = assessProgressReadiness(baseInput({ compliance_pct: null }));
    expect(r.recommendation).toBe('hold');
    expect(r.confidence).toBe('low');
    expect(r.flags).toContain('compliance_unknown');
    expect(r.flags).not.toContain('compliance_low');
    expect(r.reasons.join(' ')).toContain('no se puede medir');
  });

  test('unknown adherence is NOT read as 0 % either — it is not a low-adherence verdict', () => {
    const unknown = assessProgressReadiness(baseInput({ compliance_pct: null }));
    const zero = assessProgressReadiness(baseInput({ compliance_pct: 0 }));
    expect(zero.flags).toContain('compliance_low');
    expect(zero.confidence).toBe('high'); // a measured 0 % IS a confident hold
    expect(unknown.confidence).toBe('low'); // an unmeasured one is not
  });

  test('a measured low adherence still holds with high confidence', () => {
    const r = assessProgressReadiness(baseInput({ compliance_pct: 0.4 }));
    expect(r.recommendation).toBe('hold');
    expect(r.confidence).toBe('high');
    expect(r.flags).toContain('compliance_low');
  });
});

describe('assessProgressReadiness · carga parcialmente conocida', () => {
  test('a load reading with holes cannot support an advance', () => {
    const r = assessProgressReadiness(
      baseInput({ load: { ctl: 60, atl: 55, tsb: 5, acr: 1.0, intensity_coverage: 0.5 } }),
    );
    expect(r.recommendation).toBe('hold');
    expect(r.confidence).toBe('low');
    expect(r.flags).toContain('load_partial');
    expect(r.reasons.join(' ')).toContain('lectura parcial');
  });

  test('"infraentrenado" is not claimed while there is work we could not price', () => {
    const partial = assessProgressReadiness(
      baseInput({ load: { ctl: 60, atl: 20, tsb: 40, acr: 0.2, intensity_coverage: 0.5 } }),
    );
    expect(partial.flags).not.toContain('undertrained');

    const measured = assessProgressReadiness(
      baseInput({ load: { ctl: 60, atl: 20, tsb: 40, acr: 0.2, intensity_coverage: 1 } }),
    );
    expect(measured.flags).toContain('undertrained');
  });

  test('measured overload still wins — unpriced work can only add more of it', () => {
    const r = assessProgressReadiness(
      baseInput({ load: { ctl: 60, atl: 110, tsb: -50, acr: 1.9, intensity_coverage: 0.4 } }),
    );
    expect(r.recommendation).toBe('regress');
    expect(r.confidence).toBe('high');
    expect(r.flags).toContain('overreaching');
  });

  test('no executed work at all is not "partial" — there is no hole, just no load', () => {
    const r = assessProgressReadiness(
      baseInput({ load: { ctl: 0, atl: 0, tsb: 0, acr: 0, intensity_coverage: null } }),
    );
    expect(r.flags).not.toContain('load_partial');
    expect(r.recommendation).toBe('advance');
  });
});

describe('assessProgressReadiness · umbrales del coach (0256)', () => {
  test('sin fila: 75 % · ACWR 1,5 / 0,5 · TSB −25 · tests −2 %', () => {
    expect(DEFAULT_PROGRESS_METHOD).toEqual({
      compliance_min: 0.75,
      acr_overreach: 1.5,
      acr_undertrained: 0.5,
      tsb_overreach: -25,
      benchmark_regression_pct: -2,
    });
  });

  test('un coach más exigente con la adherencia frena lo que el defecto dejaba pasar', () => {
    const input = baseInput({ compliance_pct: 0.8 });
    expect(assessProgressReadiness(input).recommendation).toBe('advance');
    const strict = progressMethodOf(mergeCoachThresholds({ progress_adherence_min_pct: 90 }));
    const r = assessProgressReadiness(input, strict);
    expect(r.recommendation).toBe('hold');
    expect(r.flags).toContain('compliance_low');
    expect(r.reasons.join(' ')).toContain('umbral 90%');
  });

  test('su TSB de fatiga y su ACWR de sobrecarga', () => {
    const tired = baseInput({ load: { ctl: 60, atl: 80, tsb: -20, acr: 1.3, intensity_coverage: 1 } });
    expect(assessProgressReadiness(tired).recommendation).toBe('advance');
    const m = progressMethodOf(mergeCoachThresholds({ progress_tsb_fatigue: 15, progress_acr_high_pct: 120 }));
    expect(assessProgressReadiness(tired, m).flags).toContain('overreaching');
  });
});
