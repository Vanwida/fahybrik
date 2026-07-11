// Pure unit tests for the GOAL / prediction / gap engine (no DB).
// Exercises every domain rule: budget apportionment that always closes to the
// goal, the cohort vs own-race source, the personal transfer factor, the
// observado → estimado → sin_datos prediction cascade (run ×8, erg ×2, functional
// ×1, roxzone), the predicted-total convention (sin_datos held at budget), the
// gap sign, the predicted-vs-real comparison + insight, and the goal label.

import { describe, expect, it } from 'vitest';
import {
  computeBudget,
  computeGoalGap,
  computePredictionReview,
  goalLabel,
  largestRemainder,
  personalTransferFactor,
  predictSegment,
  MIN_COHORT_RACES,
  RECENT_RACE_DAYS,
  type CohortRace,
  type OwnRace,
  type SegmentDef,
  type TrainedLevel,
} from '@fahybrid/shared/domain/goal-gap';

// ── The canonical 10-segment skeleton (run, 8 stations, roxzone) ──────────────
const SEGMENTS: SegmentDef[] = [
  { slug: 'run', label_es: 'Carrera a pie', kind: 'run', station_index: null },
  { slug: 'ski-erg', label_es: 'SkiErg 1km', kind: 'station', station_index: 2 },
  { slug: 'hyrox-sled-push', label_es: 'Sled push', kind: 'station', station_index: 4 },
  { slug: 'hyrox-sled-pull', label_es: 'Sled pull', kind: 'station', station_index: 6 },
  { slug: 'hyrox-burpee-broad-jump', label_es: 'Burpee broad jump 80m', kind: 'station', station_index: 8 },
  { slug: 'row', label_es: 'Row 1km', kind: 'station', station_index: 10 },
  { slug: 'hyrox-farmer-carry', label_es: 'Farmer carry 200m', kind: 'station', station_index: 12 },
  { slug: 'hyrox-sandbag-lunges', label_es: 'Sandbag lunge 200m', kind: 'station', station_index: 14 },
  { slug: 'hyrox-wall-balls', label_es: 'Wall ball 100', kind: 'station', station_index: 16 },
  { slug: 'roxzone', label_es: 'Roxzone', kind: 'roxzone', station_index: null },
];

// A realistic ~60-minute singles race (sums to 3600).
function makeCohortRace(scale = 1): CohortRace {
  return {
    run_total_s: Math.round(1800 * scale),
    station_s: {
      2: Math.round(240 * scale),
      4: Math.round(150 * scale),
      6: Math.round(200 * scale),
      8: Math.round(230 * scale),
      10: Math.round(230 * scale),
      12: Math.round(120 * scale),
      14: Math.round(190 * scale),
      16: Math.round(280 * scale),
    },
    roxzone_s: Math.round(160 * scale),
    result_s: Math.round(3600 * scale),
  };
}

function ownRace(partial: Partial<OwnRace>): OwnRace {
  return {
    race_id: 747,
    date_iso: '2026-05-01',
    age_days: 10,
    run_total_s: 1850,
    station_s: { 2: 245, 4: 155, 6: 205, 8: 235, 10: 235, 12: 122, 14: 195, 16: 290 },
    roxzone_s: 168,
    result_s: 3700, // = run 1850 + stations 1682 + roxzone 168 (self-consistent)
    complete: true,
    ...partial,
  };
}

// ── largestRemainder ──────────────────────────────────────────────────────────
describe('largestRemainder', () => {
  it('apportions to an exact integer sum, no residue lost', () => {
    const out = largestRemainder([0.5, 0.3, 0.2], 3600);
    expect(out.reduce((a, b) => a + b, 0)).toBe(3600);
  });

  it('hands the leftover to the largest fractional parts first', () => {
    // raw = [12.4, 12.4, 6.2] → floors [12,12,6] sum 30, residue 1 → first (tie by order)
    const out = largestRemainder([0.4, 0.4, 0.2], 31);
    expect(out).toEqual([13, 12, 6]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(31);
  });
});

// ── computeBudget ─────────────────────────────────────────────────────────────
describe('computeBudget', () => {
  it('uses the cohort mean fractions when >= MIN_COHORT_RACES and closes to the goal', () => {
    const cohort = Array.from({ length: MIN_COHORT_RACES }, () => makeCohortRace());
    const out = computeBudget(4200, SEGMENTS, cohort, null);
    expect(out?.source).toBe('cohorte');
    expect(out?.budgets.reduce((a, b) => a + b, 0)).toBe(4200);
    // Run is ~half of the race → ~2100 of 4200.
    expect(out?.budgets[0]).toBeGreaterThan(2000);
    expect(out?.budgets[0]).toBeLessThan(2200);
  });

  it('falls back to the own complete race (tu_carrera), scaled to the goal', () => {
    const out = computeBudget(3600, SEGMENTS, [], ownRace({}));
    expect(out?.source).toBe('tu_carrera');
    expect(out?.budgets.reduce((a, b) => a + b, 0)).toBe(3600);
    // Own segments sum to 3700; run is exactly half → 1850/3700 × 3600 = 1800.
    expect(out?.budgets[0]).toBeGreaterThanOrEqual(1795);
    expect(out?.budgets[0]).toBeLessThanOrEqual(1805);
  });

  it('prefers cohort over the own race when both are available', () => {
    const cohort = Array.from({ length: MIN_COHORT_RACES }, () => makeCohortRace());
    const out = computeBudget(3600, SEGMENTS, cohort, ownRace({}));
    expect(out?.source).toBe('cohorte');
  });

  it('ignores a cohort below MIN_COHORT_RACES', () => {
    const cohort = Array.from({ length: MIN_COHORT_RACES - 1 }, () => makeCohortRace());
    const out = computeBudget(3600, SEGMENTS, cohort, ownRace({}));
    expect(out?.source).toBe('tu_carrera');
  });

  it('gates (null) with no cohort and no complete own race', () => {
    expect(computeBudget(3600, SEGMENTS, [], null)).toBeNull();
    expect(computeBudget(3600, SEGMENTS, [], ownRace({ complete: false }))).toBeNull();
  });
});

// ── personalTransferFactor ────────────────────────────────────────────────────
describe('personalTransferFactor', () => {
  it('is the mean race ÷ trained across cross targets with both sides', () => {
    const trained: TrainedLevel[] = [
      { slug: 'run', kind: 'run', trained_value_s: 250, race_value_s: 300 }, // 1.20
      { slug: 'ski-erg', kind: 'ski', trained_value_s: 120, race_value_s: 132 }, // 1.10
      { slug: 'row', kind: 'row', trained_value_s: 110, race_value_s: null }, // ignored
    ];
    expect(personalTransferFactor(trained)).toBeCloseTo(1.15, 5);
  });

  it('is null when no cross target has both sides (no race)', () => {
    const trained: TrainedLevel[] = [{ slug: 'run', kind: 'run', trained_value_s: 250, race_value_s: null }];
    expect(personalTransferFactor(trained)).toBeNull();
  });
});

// ── predictSegment ────────────────────────────────────────────────────────────
describe('predictSegment', () => {
  const runSeg = SEGMENTS[0]!;
  const skiSeg = SEGMENTS[1]!;
  const wallSeg = SEGMENTS[8]!;
  const roxSeg = SEGMENTS[9]!;

  it('observado: a recent own-race split is used raw', () => {
    const p = predictSegment(runSeg, ownRace({ age_days: 10 }), new Map(), 1.2, 1800);
    expect(p).toEqual({ predicted_s: 1850, tier: 'observado' });
  });

  it('estimado: a stale own race falls to trained × conversion × factor (erg ×2)', () => {
    const trained = new Map<string, TrainedLevel>([
      ['ski-erg', { slug: 'ski-erg', kind: 'ski', trained_value_s: 120, race_value_s: 132 }],
    ]);
    // stale (>= RECENT) → not observado; 120 (s/500m) ×2 ×1.1 = 264.
    const p = predictSegment(skiSeg, ownRace({ age_days: RECENT_RACE_DAYS + 5 }), trained, 1.1, 250);
    expect(p).toEqual({ predicted_s: 264, tier: 'estimado' });
  });

  it('estimado: functional station is ×1 × factor', () => {
    const trained = new Map<string, TrainedLevel>([
      ['hyrox-wall-balls', { slug: 'hyrox-wall-balls', kind: 'functional', trained_value_s: 300, race_value_s: 345 }],
    ]);
    const p = predictSegment(wallSeg, null, trained, 1.15, 280);
    expect(p).toEqual({ predicted_s: 345, tier: 'estimado' });
  });

  it('estimado without factor uses the trained level as-is', () => {
    const trained = new Map<string, TrainedLevel>([
      ['run', { slug: 'run', kind: 'run', trained_value_s: 250, race_value_s: null }],
    ]);
    // no race → factor null → 250 ×8 ×1 = 2000.
    const p = predictSegment(runSeg, null, trained, null, 1900);
    expect(p).toEqual({ predicted_s: 2000, tier: 'estimado' });
  });

  it('sin_datos when neither a recent split nor a trained level exists', () => {
    const p = predictSegment(skiSeg, null, new Map(), 1.1, 240);
    expect(p).toEqual({ predicted_s: null, tier: 'sin_datos' });
  });

  it('roxzone: recent own → observado; stale own → estimado; cohort → estimado; none → sin_datos', () => {
    expect(predictSegment(roxSeg, ownRace({ age_days: 5, roxzone_s: 168 }), new Map(), 1.1, 160)).toEqual({
      predicted_s: 168,
      tier: 'observado',
    });
    expect(predictSegment(roxSeg, ownRace({ age_days: 400, roxzone_s: 168 }), new Map(), 1.1, 160)).toEqual({
      predicted_s: 168,
      tier: 'estimado',
    });
    expect(predictSegment(roxSeg, null, new Map(), 1.1, 160)).toEqual({ predicted_s: 160, tier: 'estimado' });
    expect(predictSegment(roxSeg, null, new Map(), 1.1, 0)).toEqual({ predicted_s: null, tier: 'sin_datos' });
  });
});

// ── computeGoalGap (end to end) ───────────────────────────────────────────────
describe('computeGoalGap', () => {
  it('builds budget + prediction, holds sin_datos at budget, and reads the gap', () => {
    const cohort = Array.from({ length: MIN_COHORT_RACES }, () => makeCohortRace());
    // A recent own race → every segment observado; trained only used for the factor.
    const trained: TrainedLevel[] = [
      { slug: 'run', kind: 'run', trained_value_s: 220, race_value_s: 231 },
    ];
    const res = computeGoalGap({
      goal_total_s: 3600,
      segments: SEGMENTS,
      cohort,
      own_race: ownRace({ age_days: 20 }),
      trained,
    });
    expect(res.budget_source).toBe('cohorte');
    expect(res.segments).toHaveLength(10);
    // budget closes to the goal.
    expect(res.segments.reduce((a, s) => a + s.budget_s, 0)).toBe(3600);
    // recent own race → observado everywhere, predicted total ≈ the own race total.
    expect(res.segments.every((s) => s.tier === 'observado')).toBe(true);
    expect(res.predicted_total_s).toBe(1850 + 245 + 155 + 205 + 235 + 235 + 122 + 195 + 290 + 168);
    expect(res.gap_s).toBe((res.predicted_total_s ?? 0) - 3600);
    // delta = predicted − budget per segment.
    for (const s of res.segments) expect(s.delta_s).toBe((s.predicted_s ?? 0) - s.budget_s);
  });

  it('a sin_datos segment is held at its budget in the predicted total', () => {
    // No own race, trained only for the run → run estimado, the rest sin_datos,
    // roxzone estimado from the cohort typical.
    const cohort = Array.from({ length: MIN_COHORT_RACES }, () => makeCohortRace());
    const trained: TrainedLevel[] = [{ slug: 'run', kind: 'run', trained_value_s: 225, race_value_s: null }];
    const res = computeGoalGap({ goal_total_s: 3600, segments: SEGMENTS, cohort, own_race: null, trained });
    const runRes = res.segments.find((s) => s.slug === 'run')!;
    expect(runRes.tier).toBe('estimado'); // 225 ×8 = 1800
    expect(runRes.predicted_s).toBe(1800);
    const skiRes = res.segments.find((s) => s.slug === 'ski-erg')!;
    expect(skiRes.tier).toBe('sin_datos');
    expect(skiRes.predicted_s).toBeNull();
    // predicted total = Σ (predicted ?? budget).
    const expected = res.segments.reduce((a, s) => a + (s.predicted_s ?? s.budget_s), 0);
    expect(res.predicted_total_s).toBe(expected);
  });

  it('gates when the budget cannot be built', () => {
    const res = computeGoalGap({ goal_total_s: 3600, segments: SEGMENTS, cohort: [], own_race: null, trained: [] });
    expect(res.budget_source).toBeNull();
    expect(res.segments).toHaveLength(0);
    expect(res.predicted_total_s).toBeNull();
    expect(res.gap_s).toBeNull();
  });
});

// ── computePredictionReview ───────────────────────────────────────────────────
describe('computePredictionReview', () => {
  const snapshot = [
    { slug: 'run', label_es: 'Carrera a pie', predicted_s: 1800 },
    { slug: 'hyrox-sled-push', label_es: 'Sled push', predicted_s: 150 },
    { slug: 'hyrox-wall-balls', label_es: 'Wall ball 100', predicted_s: 300 },
    { slug: 'ski-erg', label_es: 'SkiErg 1km', predicted_s: null }, // sin_datos → skipped
  ];

  it('compares only segments with both sides, computes accuracy + worst-delta insight', () => {
    const res = computePredictionReview({
      predicted_total_s: 3600,
      actual_total_s: 3700,
      snapshot_segments: snapshot,
      actual_by_slug: { run: 1820, 'hyrox-sled-push': 190, 'hyrox-wall-balls': 300, 'ski-erg': 240 },
    });
    // ski-erg predicted null → not compared.
    expect(res.segments.map((s) => s.slug)).toEqual(['run', 'hyrox-sled-push', 'hyrox-wall-balls']);
    // accuracy = 100 - |3600-3700|/3700*100 = 100 - 2.7 ≈ 97.
    expect(res.accuracy_pct).toBe(97);
    // worst positive delta = sled push (+40) → insight names it.
    expect(res.insight_es).toBe('El Sled push perdió 0:40 más de lo previsto.');
  });

  it('all segments at or better than predicted → the positive insight', () => {
    const res = computePredictionReview({
      predicted_total_s: 3600,
      actual_total_s: 3550,
      snapshot_segments: snapshot,
      actual_by_slug: { run: 1780, 'hyrox-sled-push': 150, 'hyrox-wall-balls': 290 },
    });
    expect(res.insight_es).toBe('Cumpliste la predicción: cada segmento fue igual o mejor de lo previsto.');
  });

  it('no comparable segments → the honest empty insight', () => {
    const res = computePredictionReview({
      predicted_total_s: 3600,
      actual_total_s: 3600,
      snapshot_segments: [{ slug: 'run', label_es: 'Carrera a pie', predicted_s: null }],
      actual_by_slug: {},
    });
    expect(res.segments).toHaveLength(0);
    expect(res.insight_es).toBe('Sin segmentos comparables entre la predicción y la carrera.');
  });
});

// ── goalLabel ─────────────────────────────────────────────────────────────────
describe('goalLabel', () => {
  it('names ANY whole-minute goal "Sub-<minutes>" — goals are spoken in minutes', () => {
    expect(goalLabel(3600)).toBe('Sub-60');
    expect(goalLabel(4200)).toBe('Sub-70');
    expect(goalLabel(4500)).toBe('Sub-75');
    expect(goalLabel(5400)).toBe('Sub-90');
    expect(goalLabel(3540)).toBe('Sub-59'); // a real athlete goal, not "59:00"
    expect(goalLabel(3660)).toBe('Sub-61');
  });

  it('shows the exact clock only for a non-round goal', () => {
    expect(goalLabel(3723)).toBe('1:02:03');
    expect(goalLabel(3512)).toBe('58:32');
  });
});
