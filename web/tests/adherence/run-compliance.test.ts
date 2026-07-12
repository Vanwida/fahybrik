// Pure unit tests for the per-segment running-compliance engine (#66). No DB.
// Covers every verdict path on all three axes, the band builders + tolerances,
// and the session aggregate (incl. the honest null-pct floor).

import { describe, expect, test } from 'vitest';
import {
  PACE_POINT_TOLERANCE_S,
  RPE_POINT_TOLERANCE,
  RUN_COMPLIANCE_LABEL,
  RUN_COMPLIANCE_TIER,
  evaluateRunSegment,
  hrBandFromTarget,
  paceBandFromResolvedZone,
  paceBandFromTarget,
  rpeBandFromTarget,
  summarizeRunCompliance,
  type RunComplianceVerdict,
} from '@fahybrid/shared/domain/adherence';

describe('evaluateRunSegment — pace axis', () => {
  const band = paceBandFromResolvedZone(265, 275); // 4:25–4:35 /km

  test('in band → dentro (edges inclusive)', () => {
    expect(evaluateRunSegment(band, { pace_s: 270 })).toBe('dentro');
    expect(evaluateRunSegment(band, { pace_s: 265 })).toBe('dentro'); // exactly the fast edge
    expect(evaluateRunSegment(band, { pace_s: 275 })).toBe('dentro'); // exactly the slow edge
  });

  test('faster than the band → fuera_rapido', () => {
    expect(evaluateRunSegment(band, { pace_s: 258 })).toBe('fuera_rapido');
  });

  test('slower than the band → fuera_lento', () => {
    expect(evaluateRunSegment(band, { pace_s: 300 })).toBe('fuera_lento');
  });

  test('no pace captured → sin_dato', () => {
    expect(evaluateRunSegment(band, { pace_s: null })).toBe('sin_dato');
    expect(evaluateRunSegment(band, {})).toBe('sin_dato');
    expect(evaluateRunSegment(band, { pace_s: Number.NaN })).toBe('sin_dato');
  });

  test('open easy zone (no slow edge) → only fuera_rapido is possible', () => {
    const easy = paceBandFromResolvedZone(330, null); // Z1: slower than 5:30 is fine
    expect(evaluateRunSegment(easy, { pace_s: 400 })).toBe('dentro'); // jogging slow = ok
    expect(evaluateRunSegment(easy, { pace_s: 330 })).toBe('dentro');
    expect(evaluateRunSegment(easy, { pace_s: 300 })).toBe('fuera_rapido'); // too hard for easy
  });

  test('a band with no edges at all → sin_dato', () => {
    expect(evaluateRunSegment(paceBandFromResolvedZone(null, null), { pace_s: 270 })).toBe('sin_dato');
  });
});

describe('paceBandFromTarget — explicit pace', () => {
  test('a min/max band passes through as-is', () => {
    expect(paceBandFromTarget({ min_s: 265, max_s: 275 })).toEqual({ axis: 'pace', fast_s: 265, slow_s: 275 });
  });

  test('a single value widens by ±PACE_POINT_TOLERANCE_S', () => {
    const b = paceBandFromTarget({ value_s: 270 });
    expect(b).toEqual({ axis: 'pace', fast_s: 270 - PACE_POINT_TOLERANCE_S, slow_s: 270 + PACE_POINT_TOLERANCE_S });
    // within tolerance = dentro, just outside = fuera
    expect(evaluateRunSegment(b, { pace_s: 270 })).toBe('dentro');
    expect(evaluateRunSegment(b, { pace_s: 265 })).toBe('dentro'); // exactly at ±tol edge
    expect(evaluateRunSegment(b, { pace_s: 264 })).toBe('fuera_rapido');
    expect(evaluateRunSegment(b, { pace_s: 276 })).toBe('fuera_lento');
  });

  test('an empty pace target → an edgeless band (sin_dato on compare)', () => {
    expect(evaluateRunSegment(paceBandFromTarget({}), { pace_s: 270 })).toBe('sin_dato');
  });
});

describe('evaluateRunSegment — HR axis', () => {
  const band = hrBandFromTarget({ min: 150, max: 165 });

  test('in range → dentro', () => {
    expect(evaluateRunSegment(band, { hr_bpm: 158 })).toBe('dentro');
  });
  test('above the range (harder) → fuera_rapido', () => {
    expect(evaluateRunSegment(band, { hr_bpm: 172 })).toBe('fuera_rapido');
  });
  test('below the range (easier) → fuera_lento', () => {
    expect(evaluateRunSegment(band, { hr_bpm: 140 })).toBe('fuera_lento');
  });
  test('no HR captured → sin_dato', () => {
    expect(evaluateRunSegment(band, { hr_bpm: null })).toBe('sin_dato');
  });
});

describe('evaluateRunSegment — RPE axis', () => {
  test('band comparison both sides', () => {
    const band = rpeBandFromTarget({ min: 8, max: 9 });
    expect(evaluateRunSegment(band, { rpe: 8 })).toBe('dentro');
    expect(evaluateRunSegment(band, { rpe: 10 })).toBe('fuera_rapido');
    expect(evaluateRunSegment(band, { rpe: 6 })).toBe('fuera_lento');
    expect(evaluateRunSegment(band, { rpe: null })).toBe('sin_dato');
  });

  test('single value widens by ±RPE_POINT_TOLERANCE', () => {
    const band = rpeBandFromTarget({ value: 7 });
    expect(band).toEqual({ axis: 'rpe', min: 7 - RPE_POINT_TOLERANCE, max: 7 + RPE_POINT_TOLERANCE });
    expect(evaluateRunSegment(band, { rpe: 7 })).toBe('dentro');
    expect(evaluateRunSegment(band, { rpe: 9 })).toBe('fuera_rapido');
  });
});

describe('evaluateRunSegment — no target', () => {
  test('null band → sin_dato (no judgment on a tramo without objetivo)', () => {
    expect(evaluateRunSegment(null, { pace_s: 270, hr_bpm: 160 })).toBe('sin_dato');
  });
});

describe('summarizeRunCompliance', () => {
  test('% is over EVALUABLE tramos, excluding sin_dato', () => {
    const verdicts: RunComplianceVerdict[] = [
      'dentro',
      'dentro',
      'dentro',
      'fuera_rapido',
      'sin_dato', // warm-up, no objetivo — not counted in the denominator
    ];
    const s = summarizeRunCompliance(verdicts);
    expect(s).toEqual({
      total: 5,
      evaluable: 4,
      dentro: 3,
      fuera_rapido: 1,
      fuera_lento: 0,
      sin_dato: 1,
      pct_dentro: 75, // 3 / 4
    });
  });

  test('rounds to the nearest whole percent', () => {
    // 2 dentro of 3 evaluable = 66.67 → 67
    expect(summarizeRunCompliance(['dentro', 'dentro', 'fuera_lento']).pct_dentro).toBe(67);
  });

  test('all sin_dato → pct is null, never 0 or NaN', () => {
    const s = summarizeRunCompliance(['sin_dato', 'sin_dato']);
    expect(s.evaluable).toBe(0);
    expect(s.pct_dentro).toBeNull();
  });

  test('empty session → total 0, pct null', () => {
    expect(summarizeRunCompliance([])).toEqual({
      total: 0,
      evaluable: 0,
      dentro: 0,
      fuera_rapido: 0,
      fuera_lento: 0,
      sin_dato: 0,
      pct_dentro: null,
    });
  });
});

describe('verdict presentation maps', () => {
  test('tier: dentro=success, fuera_*=warning, sin_dato=neutral (no error/red)', () => {
    expect(RUN_COMPLIANCE_TIER.dentro).toBe('success');
    expect(RUN_COMPLIANCE_TIER.fuera_rapido).toBe('warning');
    expect(RUN_COMPLIANCE_TIER.fuera_lento).toBe('warning');
    expect(RUN_COMPLIANCE_TIER.sin_dato).toBe('neutral');
  });

  test('every verdict has a label', () => {
    for (const v of ['dentro', 'fuera_rapido', 'fuera_lento', 'sin_dato'] as const) {
      expect(RUN_COMPLIANCE_LABEL[v]).toBeTruthy();
    }
  });
});
