import { describe, expect, test } from 'vitest';
import {
  ATL_DECAY_DAYS,
  CTL_DECAY_DAYS,
  computeAcr,
  computeLoadSeries,
  loadIntensityCoverage,
  summarizeLoad,
} from '@fahybrid/shared/domain/training-load/banister';
import { computeTss, intensityFactor } from '@fahybrid/shared/domain/training-load/tss';

describe('computeTss', () => {
  test('one hour at threshold (RPE 9) ≈ 100 TSS', () => {
    const tss = computeTss({ duration_seconds: 3600, rpe: 9 });
    expect(tss).toBeGreaterThan(95);
    expect(tss).toBeLessThan(110);
  });

  test('zero or negative duration returns 0', () => {
    expect(computeTss({ duration_seconds: 0, rpe: 8 })).toBe(0);
    expect(computeTss({ duration_seconds: -10, rpe: 8 })).toBe(0);
  });

  test('HR-based path takes precedence over RPE', () => {
    const hrTss = computeTss({ duration_seconds: 3600, rpe: 5, avg_hr: 175, lthr: { bpm: 175, estimated: false } });
    expect(hrTss).toBeCloseTo(100, 0);
  });

  // The HR anchor always RESOLVES (its last rung is 0.88 × Tanaka(age)), so
  // without this guard every athlete with a birth date would get HR-priced load
  // and the coverage report would call a birthday "intensidad conocida".
  test('an ESTIMATED threshold does not price the session — it falls through to RPE', () => {
    const estimated = computeTss({
      duration_seconds: 3600,
      rpe: 5,
      avg_hr: 175,
      lthr: { bpm: 175, estimated: true },
    });
    // RPE 5 → IF 0.70 → 49 TSS, NOT the 100 the HR mode would have claimed.
    expect(estimated).toBeCloseTo(49, 0);
  });

  test('an estimated threshold with no RPE to fall back on yields null, not invented load', () => {
    expect(
      computeTss({ duration_seconds: 3600, avg_hr: 175, lthr: { bpm: 175, estimated: true } }),
    ).toBeNull();
  });

  test('power-based path takes precedence over HR + RPE', () => {
    const tss = computeTss({
      duration_seconds: 3600,
      rpe: 3,
      avg_hr: 130,
      lthr: { bpm: 175, estimated: false },
      avg_power_watts: 250,
      ftp_watts: 250,
    });
    expect(tss).toBeCloseTo(100, 0);
  });
});

// LEY DE HONESTIDAD (docs/CONTRATO-UI.md §7) — an unrated session used to be
// priced at a default IF of 0.65, i.e. ~42 invented TSS per hour, and that
// number reached the coach's load trends as if it were evidence.
describe('computeTss · sin intensidad conocida no emite carga', () => {
  test('an hour of work with no RPE, no HR and no power yields null, not 42', () => {
    expect(computeTss({ duration_seconds: 3600 })).toBeNull();
    expect(computeTss({ duration_seconds: 3600, rpe: null })).toBeNull();
    expect(
      computeTss({ duration_seconds: 3600, rpe: null, avg_hr: 150, lthr: null }),
    ).toBeNull();
  });

  test('a broken RPE is unknown, never a mid-scale guess', () => {
    expect(computeTss({ duration_seconds: 3600, rpe: Number.NaN })).toBeNull();
    expect(intensityFactor({ duration_seconds: 3600, rpe: Number.POSITIVE_INFINITY })).toBeNull();
  });

  test('an out-of-range RPE still clamps to the scale (a 12 is a 10)', () => {
    expect(computeTss({ duration_seconds: 3600, rpe: 12 })).toBe(
      computeTss({ duration_seconds: 3600, rpe: 10 }),
    );
    expect(computeTss({ duration_seconds: 3600, rpe: 0 })).toBe(
      computeTss({ duration_seconds: 3600, rpe: 1 }),
    );
  });

  test('no duration is no work, whatever the intensity evidence', () => {
    expect(computeTss({ duration_seconds: 0 })).toBe(0);
  });
});

describe('loadIntensityCoverage', () => {
  test('reports the share of the chronic window we could price', () => {
    const daily = Array.from({ length: 28 }, (_, i) => ({
      date: addDays('2026-01-01', i),
      tss: 60,
      known_seconds: 3600,
      unknown_seconds: i === 0 ? 3600 : 0,
    }));
    const s = summarizeLoad(daily);
    expect(s.known_seconds_28d).toBe(28 * 3600);
    expect(s.unknown_seconds_28d).toBe(3600);
    expect(loadIntensityCoverage(s)).toBeCloseTo(28 / 29, 5);
  });

  test('null when nothing was executed — no work is not 0 % coverage', () => {
    const daily = Array.from({ length: 28 }, (_, i) => ({
      date: addDays('2026-01-01', i),
      tss: 0,
      known_seconds: 0,
      unknown_seconds: 0,
    }));
    expect(loadIntensityCoverage(summarizeLoad(daily))).toBeNull();
  });
});

describe('computeLoadSeries', () => {
  test('CTL/ATL converge towards constant daily TSS', () => {
    // 400 days is well past 6× the longest decay constant (42d) → near-perfect convergence.
    const daily = Array.from({ length: 400 }, (_, i) => ({
      date: addDays('2026-01-01', i),
      tss: 80,
    }));
    const series = computeLoadSeries(daily);
    const last = series[series.length - 1];
    expect(last.ctl).toBeGreaterThan(79.9);
    expect(last.atl).toBeGreaterThan(79.99);
    expect(Math.abs(last.tsb)).toBeLessThan(0.5);
  });

  test('TSB drops sharply when load spikes', () => {
    const daily: Array<{ date: string; tss: number }> = [];
    for (let i = 0; i < 60; i++) daily.push({ date: addDays('2026-01-01', i), tss: 50 });
    for (let i = 0; i < 7; i++) daily.push({ date: addDays('2026-01-01', 60 + i), tss: 200 });
    const series = computeLoadSeries(daily);
    const last = series[series.length - 1];
    expect(last.atl).toBeGreaterThan(last.ctl); // fatigue > fitness after spike
    expect(last.tsb).toBeLessThan(0);
  });

  test('seed values are honored', () => {
    const series = computeLoadSeries(
      [{ date: '2026-01-01', tss: 80 }],
      { ctl_seed: 60, atl_seed: 60 },
    );
    expect(series[0].tsb).toBeCloseTo(0, 5);     // pre-update CTL/ATL diff
    expect(series[0].ctl).toBeCloseTo(60 + (80 - 60) / CTL_DECAY_DAYS, 5);
    expect(series[0].atl).toBeCloseTo(60 + (80 - 60) / ATL_DECAY_DAYS, 5);
  });

  test('empty input yields empty output', () => {
    expect(computeLoadSeries([])).toEqual([]);
  });
});

describe('computeAcr', () => {
  test('ACR = 1.0 when last 7 days match prior 28-day average', () => {
    const daily = Array.from({ length: 28 }, (_, i) => ({
      date: addDays('2026-01-01', i),
      tss: 60,
    }));
    const { acr, last_7d_tss, last_28d_tss } = computeAcr(daily);
    expect(acr).toBeCloseTo(1.0, 5);
    expect(last_7d_tss).toBe(60 * 7);
    expect(last_28d_tss).toBe(60 * 28);
  });

  test('returns zeros for empty input', () => {
    expect(computeAcr([])).toEqual({ acr: 0, last_7d_tss: 0, last_28d_tss: 0 });
  });
});

describe('summarizeLoad', () => {
  test('produces consistent CTL/ATL/TSB/ACR', () => {
    // 200 days at constant 70 TSS — both EWMAs near 70, TSB tiny, ACR ≈ 1.0
    const daily = Array.from({ length: 200 }, (_, i) => ({
      date: addDays('2026-01-01', i),
      tss: 70,
    }));
    const s = summarizeLoad(daily);
    expect(s.ctl).toBeGreaterThan(65);
    expect(s.acr).toBeCloseTo(1.0, 1);
    expect(Math.abs(s.tsb)).toBeLessThan(2);
  });
});

function addDays(iso: string, n: number): string {
  const [y, mo, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
