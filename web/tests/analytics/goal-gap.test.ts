// Pure unit tests for the GOAL / prediction / gap engine (no DB).
// Exercises every domain rule: budget apportionment that always closes to the
// goal, the cohort vs own-race source, the TIME-WEIGHTED personal transfer factor,
// the observado → estimado → sin_datos prediction cascade (run ×8, erg ×2,
// functional ×1, roxzone), the CONTINUOUS ageing of a race split, the total that
// refuses to cost unknown segments at the athlete's own goal, the per-segment
// bands, the predicted-vs-real comparison + insight, and the goal label.

import { describe, expect, it } from 'vitest';
import {
  accuracyLabel,
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

/** A TrainedLevel with the provenance fields defaulted — tests that don't care
 *  about the source say so once, here, instead of on every literal. */
function trained(partial: Partial<TrainedLevel> & Pick<TrainedLevel, 'slug' | 'kind'>): TrainedLevel {
  return {
    trained_value_s: null,
    race_value_s: null,
    source: 'ejecuciones',
    weakened: false,
    from_slug: null,
    ...partial,
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
  it('weights each ratio by the seconds that segment costs IN THE RACE', () => {
    const levels: TrainedLevel[] = [
      // Run: 300 s/km competed → 2400 s of race. Ratio 1.20.
      trained({ slug: 'run', kind: 'run', trained_value_s: 250, race_value_s: 300 }),
      // SkiErg: 132 s/500 m competed → 264 s of race. Ratio 1.10.
      trained({ slug: 'ski-erg', kind: 'ski', trained_value_s: 120, race_value_s: 132 }),
      trained({ slug: 'row', kind: 'row', trained_value_s: 110 }), // no race side → ignored
    ];
    // (1.20×2400 + 1.10×264) / (2400 + 264) = 3170.4 / 2664 = 1.19009…
    expect(personalTransferFactor(levels)).toBeCloseTo(1.19009, 4);
  });

  /**
   * THE BUG THIS PINS: the factor used to be a plain mean of the ratios, so one
   * three-minute functional station spoke as loudly as the eight kilometres of
   * running. Here the run (2400 s of race) taxes at 1.05 and a single 100-second
   * station at 2.00. The unweighted mean says 1.525 — the athlete is told they
   * race 50% slower than they train, off one bad station. Weighted by race time it
   * is 1.088, which is what the clock actually says.
   */
  it('a short station can no longer outvote the running (the old mean could)', () => {
    const levels: TrainedLevel[] = [
      trained({ slug: 'run', kind: 'run', trained_value_s: 285.714286, race_value_s: 300 }), // 1.05 · 2400 s
      trained({ slug: 'hyrox-farmer-carry', kind: 'functional', trained_value_s: 50, race_value_s: 100 }), // 2.00 · 100 s
    ];
    const unweightedMean = (1.05 + 2.0) / 2;
    const factor = personalTransferFactor(levels)!;
    expect(factor).toBeCloseTo((1.05 * 2400 + 2.0 * 100) / 2500, 4);
    expect(factor).toBeLessThan(unweightedMean - 0.4);
  });

  it('is null when no cross target has both sides (no race)', () => {
    expect(personalTransferFactor([trained({ slug: 'run', kind: 'run', trained_value_s: 250 })])).toBeNull();
  });
});

// ── predictSegment ────────────────────────────────────────────────────────────
describe('predictSegment', () => {
  const runSeg = SEGMENTS[0]!;
  const skiSeg = SEGMENTS[1]!;
  const wallSeg = SEGMENTS[8]!;
  const roxSeg = SEGMENTS[9]!;

  const skiTrained = (v: number, race: number | null = null) =>
    new Map<string, TrainedLevel>([['ski-erg', trained({ slug: 'ski-erg', kind: 'ski', trained_value_s: v, race_value_s: race })]]);

  it('observado: a fresh own-race split with nothing to blend into is used raw', () => {
    const p = predictSegment(runSeg, ownRace({ age_days: 10 }), new Map(), 1.2);
    expect(p.predicted_s).toBe(1850);
    expect(p.tier).toBe('observado');
    expect(p.source).toBe('carrera');
    // Ley 1: it still carries a band, narrow but never zero.
    expect(p.band_s).toBeGreaterThan(0);
  });

  it('estimado: a stale own race falls to trained × conversion × factor (erg ×2)', () => {
    // Stale by ~7 half-lives → the race's weight is ≈0.008, so the estimate owns it.
    const p = predictSegment(skiSeg, ownRace({ age_days: RECENT_RACE_DAYS * 7 }), skiTrained(120, 132), 1.1);
    expect(p.tier).toBe('estimado');
    expect(p.predicted_s).toBe(264); // 120 (s/500 m) ×2 ×1.1; the 0.8% of race left rounds away
  });

  it('estimado: functional station is ×1 × factor', () => {
    const t = new Map<string, TrainedLevel>([
      ['hyrox-wall-balls', trained({ slug: 'hyrox-wall-balls', kind: 'functional', trained_value_s: 300, race_value_s: 345 })],
    ]);
    const p = predictSegment(wallSeg, null, t, 1.15);
    expect(p).toMatchObject({ predicted_s: 345, tier: 'estimado', source: 'ejecuciones' });
  });

  it('estimado without factor uses the trained level as-is, and pays for it in the band', () => {
    const t = new Map<string, TrainedLevel>([['run', trained({ slug: 'run', kind: 'run', trained_value_s: 250 })]]);
    // no race → factor null → 250 ×8 ×1 = 2000.
    const withFactor = predictSegment(runSeg, null, t, 1.0);
    const withoutFactor = predictSegment(runSeg, null, t, null);
    expect(withoutFactor.predicted_s).toBe(2000);
    expect(withFactor.predicted_s).toBe(2000);
    // Same number, wider band: the competition tax is unknown, not zero.
    expect(withoutFactor.band_s!).toBeGreaterThanOrEqual(withFactor.band_s!);
  });

  it('sin_datos when neither a split nor a trained level exists — and no band', () => {
    const p = predictSegment(skiSeg, null, new Map(), 1.1);
    expect(p).toMatchObject({ predicted_s: null, tier: 'sin_datos', band_s: null });
  });

  /**
   * THE BUG THIS PINS (ley 2). The roxzone used to fall back to its own BUDGET —
   * and a budget is the athlete's GOAL split into ten pieces. An athlete with no
   * race at all was therefore told their transitions would land exactly on target.
   * With no race there is no roxzone evidence, full stop.
   */
  it('roxzone: own race ages like any split; with NO race it is sin_datos, never the goal', () => {
    expect(predictSegment(roxSeg, ownRace({ age_days: 5, roxzone_s: 168 }), new Map(), 1.1)).toMatchObject({
      predicted_s: 168,
      tier: 'observado',
    });
    expect(predictSegment(roxSeg, ownRace({ age_days: 400, roxzone_s: 168 }), new Map(), 1.1)).toMatchObject({
      predicted_s: 168,
      tier: 'estimado',
    });
    expect(predictSegment(roxSeg, null, new Map(), 1.1)).toMatchObject({ predicted_s: null, tier: 'sin_datos' });
  });
});

// ── La evidencia envejece (ley 3) ─────────────────────────────────────────────
describe('predictSegment · ageing', () => {
  const skiSeg = SEGMENTS[1]!;
  // The race said 245 s for the SkiErg; today's training says 280 (140 s/500 m ×2).
  // A wide gap on purpose: it is what makes the slide visible second by second.
  const t = new Map<string, TrainedLevel>([
    ['ski-erg', trained({ slug: 'ski-erg', kind: 'ski', trained_value_s: 140, race_value_s: 122.5 })],
  ]);
  const predictAt = (age_days: number) => predictSegment(skiSeg, ownRace({ age_days }), t, 1.0).predicted_s!;

  /**
   * THE BUG THIS PINS. Under the old cliff every age below 180 days returned the
   * race split to the second — 245, 245, 245 — and then jumped to the estimate on
   * day 180. Five months of training could not move the number, and then it moved
   * all at once. Now it slides.
   */
  it('slides continuously from the race split toward the estimate — no cliff', () => {
    const fresh = predictAt(0);
    const oneMonth = predictAt(30);
    const halfLife = predictAt(RECENT_RACE_DAYS);
    const ancient = predictAt(RECENT_RACE_DAYS * 8);

    expect(fresh).toBe(245); // day 0 = the split itself
    expect(oneMonth).toBeGreaterThan(fresh); // a month of training already moved it
    expect(oneMonth).toBeLessThan(halfLife);
    expect(halfLife).toBe(263); // one half-life = the midpoint of 245 and 280
    expect(ancient).toBe(280); // long gone = the estimate

    // Monotonic across the whole first half-life: no step, no plateau.
    const walk = [0, 15, 45, 90, 135, 179].map(predictAt);
    for (let i = 1; i < walk.length; i++) expect(walk[i]!).toBeGreaterThan(walk[i - 1]!);
  });

  it('the tier still flips at one half-life, so the shipped chip keeps its meaning', () => {
    expect(predictSegment(skiSeg, ownRace({ age_days: RECENT_RACE_DAYS - 1 }), t, 1.0).tier).toBe('observado');
    expect(predictSegment(skiSeg, ownRace({ age_days: RECENT_RACE_DAYS + 1 }), t, 1.0).tier).toBe('estimado');
  });

  it('with nothing to blend into, age widens the BAND instead of moving the value', () => {
    const fresh = predictSegment(skiSeg, ownRace({ age_days: 5 }), new Map(), null);
    const old = predictSegment(skiSeg, ownRace({ age_days: 900 }), new Map(), null);
    expect(old.predicted_s).toBe(fresh.predicted_s); // the only number there is
    expect(old.band_s!).toBeGreaterThan(fresh.band_s!);
  });
});

// ── computeGoalGap (end to end) ───────────────────────────────────────────────
describe('computeGoalGap', () => {
  const cohort5 = () => Array.from({ length: MIN_COHORT_RACES }, () => makeCohortRace());

  it('builds budget + prediction over full coverage, and reads the gap', () => {
    // A recent own race covers all ten segments; trained only feeds the factor.
    const res = computeGoalGap({
      goal_total_s: 3600,
      segments: SEGMENTS,
      cohort: cohort5(),
      own_race: ownRace({ age_days: 20 }),
      trained: [trained({ slug: 'run', kind: 'run', trained_value_s: 220, race_value_s: 231 })],
    });
    expect(res.budget_source).toBe('cohorte');
    expect(res.segments).toHaveLength(10);
    expect(res.segments.reduce((a, s) => a + (s.budget_s ?? 0), 0)).toBe(3600);

    // Every segment is covered → a race total exists and the gap is readable.
    expect(res.coverage).toMatchObject({ known: 10, total: 10, complete: true, unknown_slugs: [] });
    expect(res.predicted_total_s).toBe(res.projection.known_total_s);
    expect(res.gap_s).toBe(res.predicted_total_s! - 3600);
    for (const s of res.segments) expect(s.delta_s).toBe(s.predicted_s! - s.budget_s!);
  });

  /**
   * THE BUG THIS PINS (ley 2, and the one that hurt paying athletes most).
   *
   * The unknown segments used to be costed at their BUDGET, and the budget is the
   * athlete's own GOAL cut into ten pieces. So the more of the race we could not
   * see, the closer the "prediction" sat to the goal: a beginner with a run pace
   * and nothing else was told they were on track for a sub-60 they had no business
   * being on track for. The gap tended to zero exactly where it should have been
   * widest.
   *
   * Now: no goal-derived number ever enters the total, and while anything is
   * unknown there is NO race total at all — only what we can account for, named.
   */
  it('never costs an unknown segment at the goal — the total goes null instead', () => {
    const goal = 3600;
    const res = computeGoalGap({
      goal_total_s: goal,
      segments: SEGMENTS,
      cohort: cohort5(),
      own_race: null,
      trained: [trained({ slug: 'run', kind: 'run', trained_value_s: 225 })],
    });

    const runRes = res.segments.find((s) => s.slug === 'run')!;
    expect(runRes).toMatchObject({ tier: 'estimado', predicted_s: 1800 }); // 225 ×8

    // The nine segments with no evidence are named, not costed.
    expect(res.coverage.complete).toBe(false);
    expect(res.coverage.known).toBe(1);
    expect(res.coverage.unknown_slugs).toContain('ski-erg');
    expect(res.coverage.unknown_slugs).toContain('roxzone');
    for (const s of res.segments) {
      if (s.slug !== 'run') expect(s.predicted_s).toBeNull();
    }

    // No fabricated race time, and therefore no fabricated gap.
    expect(res.predicted_total_s).toBeNull();
    expect(res.gap_s).toBeNull();

    // What DOES exist is the honest partial, which is nowhere near the goal.
    expect(res.projection.known_total_s).toBe(1800);
    expect(res.projection.known_total_s).toBeLessThan(goal / 1.5);
  });

  it('emits a range and what would sharpen it, even with almost nothing to go on', () => {
    const res = computeGoalGap({
      goal_total_s: 3600,
      segments: SEGMENTS,
      cohort: cohort5(),
      own_race: null,
      trained: [trained({ slug: 'run', kind: 'run', trained_value_s: 225, source: 'vo2max' })],
    });
    const { projection } = res;
    expect(projection.band_s).toBeGreaterThan(0);
    expect(projection.low_s).toBeLessThan(projection.known_total_s);
    expect(projection.high_s).toBeGreaterThan(projection.known_total_s);
    // Nothing here came from a race clock.
    expect(projection.observed_share_pct).toBe(0);
    // The holes come first, and the ones the athlete can measure alone lead.
    expect(projection.next_inputs.length).toBeGreaterThan(0);
    expect(['ski-erg', 'row']).toContain(projection.next_inputs[0]!.slug);
    expect(projection.next_inputs[0]!.action_es).toMatch(/^Mide/);
  });

  it('a measured mark narrows the band against the same value from training', () => {
    const build = (source: TrainedLevel['source']) =>
      computeGoalGap({
        goal_total_s: 3600,
        segments: SEGMENTS,
        cohort: cohort5(),
        own_race: null,
        trained: [trained({ slug: 'run', kind: 'run', trained_value_s: 225, race_value_s: 236, source })],
      });
    const fromMark = build('marca');
    const fromTraining = build('ejecuciones');
    expect(fromMark.projection.known_total_s).toBe(fromTraining.projection.known_total_s);
    expect(fromMark.projection.band_s).toBeLessThan(fromTraining.projection.band_s);
  });

  it('still predicts when no budget can be built — the projection does not need a goal', () => {
    const res = computeGoalGap({
      goal_total_s: 3600,
      segments: SEGMENTS,
      cohort: [],
      own_race: null,
      trained: [trained({ slug: 'run', kind: 'run', trained_value_s: 225 })],
    });
    expect(res.budget_source).toBeNull();
    expect(res.segments).toHaveLength(10);
    expect(res.segments.every((s) => s.budget_s === null)).toBe(true);
    expect(res.segments.every((s) => s.delta_s === null)).toBe(true);
    expect(res.predicted_total_s).toBeNull();
    // …but the run is still predicted and still ranged.
    expect(res.projection.known_total_s).toBe(1800);
    expect(res.projection.band_s).toBeGreaterThan(0);
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
    // 97 ≥ 97 → the top precision tier travels with the accuracy.
    expect(res.accuracy_label_es).toBe('clavado');
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

// ── accuracyLabel ─────────────────────────────────────────────────────────────
describe('accuracyLabel', () => {
  it('maps accuracy_pct to the precision tier, boundaries inclusive', () => {
    expect(accuracyLabel(100)).toBe('clavado');
    expect(accuracyLabel(97)).toBe('clavado');
    expect(accuracyLabel(96)).toBe('muy afinado');
    expect(accuracyLabel(93)).toBe('muy afinado');
    expect(accuracyLabel(92)).toBe('afinando');
    expect(accuracyLabel(85)).toBe('afinando');
    expect(accuracyLabel(84)).toBe('aún lejos');
    expect(accuracyLabel(0)).toBe('aún lejos');
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
