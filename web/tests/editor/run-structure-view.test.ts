// The sentence and the bars (editor redesign) — what a CLOSED row shows and what
// the intensity strip draws. If the sentence reads wrong here it reads wrong on
// the athlete's phone, so these are product copy tests as much as math tests.

import { describe, expect, it } from 'vitest';
import {
  elementSentence,
  segmentSentence,
  structureBars,
  structureTotals,
  totalsSentence,
} from '../../lib/dashboard/v2/run-structure-view';
import type { RunStructure, Segment } from '../../../shared/domain/prescription';

const work1k: Segment = {
  kind: 'work',
  measure: { type: 'distance', m: 1000 },
  target: { type: 'pace', value_s: 270 },
};
const rec2: Segment = {
  kind: 'recovery',
  measure: { type: 'duration', s: 120 },
  target: null,
  recovery_mode: 'parado',
};

describe('sentences', () => {
  it('a work bout reads like the coach says it', () => {
    expect(segmentSentence(work1k)).toBe('1 km @ 4:30/km');
    expect(segmentSentence({ ...work1k, measure: { type: 'distance', m: 400 } })).toBe('400 m @ 4:30/km');
  });

  it('a recovery reads as rec + mode', () => {
    expect(segmentSentence(rec2)).toBe("rec 2' · parado");
  });

  it('zones, RPE bands and extras all speak athlete', () => {
    expect(segmentSentence({ ...work1k, target: { type: 'pace_zone', zone: 3 } })).toBe('1 km · ritmo Z3');
    expect(segmentSentence({ ...work1k, target: { type: 'rpe', min: 7, max: 8 } })).toBe('1 km · RPE 7–8');
    expect(segmentSentence({ ...work1k, incline_pct: 5, cadence_spm: 180 })).toBe('1 km @ 4:30/km · 5% · 180 spm');
  });

  it('a repeat folds to one line: times × children', () => {
    expect(elementSentence({ times: 6, elements: [work1k, rec2] })).toBe("6 × 1 km @ 4:30/km · rec 2' · parado");
  });
});

describe('bars', () => {
  const structure: RunStructure = [
    { role: 'warmup', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'hr_zone', zone: 1 } }] },
    { role: 'main', elements: [{ times: 6, elements: [work1k, rec2] }] },
  ];

  it('expands a repeat into its passes, in execution order', () => {
    const bars = structureBars(structure);
    // 1 warmup + 6×(work+rec) = 13
    expect(bars).toHaveLength(13);
    expect(bars[0]!.kind).toBe('work'); // the warmup bout
    expect(bars[1]!.intensity).toBeGreaterThan(bars[2]!.intensity); // work over its recovery
  });

  it('a monster repeat aggregates instead of rendering 80 slivers', () => {
    const monster: RunStructure = [
      { role: 'main', elements: [
        { times: 20, elements: [work1k, rec2] },
        { times: 20, elements: [work1k, rec2] },
      ] },
    ];
    const bars = structureBars(monster);
    expect(bars.length).toBeLessThanOrEqual(8);
    // Width is preserved: the aggregated bar carries the whole repeat's seconds.
    expect(bars[0]!.seconds).toBe(270 * 20);
  });
});

describe('totals', () => {
  it('sums the session like the coach does in his head', () => {
    const structure: RunStructure = [
      { role: 'main', elements: [{ times: 6, elements: [work1k, rec2] }] },
    ];
    const t = structureTotals(structure);
    expect(t.total_m).toBe(6000); // recovery is standing → 0 m
    expect(t.total_s).toBe(6 * (270 + 120));
    expect(t.quality_m).toBe(6000);
    expect(totalsSentence(t)).toContain('6 km');
    expect(totalsSentence(t)).toContain('% trabajo');
  });
});
