import { describe, it, expect } from 'vitest';
import {
  matchVisionSegments,
  type DetectedSegmentForMatch,
  type PrescribedSegmentForMatch,
} from './vision-segment-match';

// Small builders keep the cases readable — only the fields a case exercises.
function det(
  modality: DetectedSegmentForMatch['modality'],
  m: Partial<Omit<DetectedSegmentForMatch, 'modality'>> = {},
): DetectedSegmentForMatch {
  return {
    modality,
    distance_meters: m.distance_meters ?? null,
    duration_seconds: m.duration_seconds ?? null,
    calories: m.calories ?? null,
  };
}
function presc(
  id: number,
  modality: PrescribedSegmentForMatch['modality'],
  measure_kind: PrescribedSegmentForMatch['measure_kind'] = null,
  measure_value: number | null = null,
): PrescribedSegmentForMatch {
  return { template_segment_id: id, modality, measure_kind, measure_value };
}

describe('matchVisionSegments', () => {
  it('links a clean 1:1 run against its prescribed distance', () => {
    const detected = [det('run', { distance_meters: 5000, duration_seconds: 1400 })];
    const prescribed = [presc(10, 'run', 'distance', 5000)];
    expect(matchVisionSegments(detected, prescribed)).toEqual([10]);
  });

  it('accepts honest under-performance within tolerance (4.2 km on a 5 km run)', () => {
    const detected = [det('run', { distance_meters: 4200 })];
    const prescribed = [presc(10, 'run', 'distance', 5000)];
    expect(matchVisionSegments(detected, prescribed)).toEqual([10]);
  });

  it('returns null for every lap when 8 detected laps face 1 prescribed run (granularity mismatch, no misattribution)', () => {
    const detected = Array.from({ length: 8 }, () => det('run', { distance_meters: 1000 }));
    const prescribed = [presc(10, 'run', 'distance', 5000)];
    expect(matchVisionSegments(detected, prescribed)).toEqual(
      Array.from({ length: 8 }, () => null),
    );
  });

  it('links 2 detected rows to 2 prescribed rows by relative order (no measures)', () => {
    const detected = [det('row'), det('row')];
    const prescribed = [presc(21, 'row'), presc(22, 'row')];
    expect(matchVisionSegments(detected, prescribed)).toEqual([21, 22]);
  });

  it('links 2 detected rows to 2 prescribed rows by relative order (confirming measures)', () => {
    const detected = [
      det('row', { distance_meters: 1000 }),
      det('row', { distance_meters: 500 }),
    ];
    const prescribed = [presc(21, 'row', 'distance', 1000), presc(22, 'row', 'distance', 500)];
    expect(matchVisionSegments(detected, prescribed)).toEqual([21, 22]);
  });

  it('reorders by measure when the app lists laps out of prescribed order', () => {
    // Detected order is 500 m then 1000 m; prescription order is 1000 m then 500 m.
    const detected = [
      det('row', { distance_meters: 500 }),
      det('row', { distance_meters: 1000 }),
    ];
    const prescribed = [presc(21, 'row', 'distance', 1000), presc(22, 'row', 'distance', 500)];
    // 500 m → the 500 m block (22), 1000 m → the 1000 m block (21).
    expect(matchVisionSegments(detected, prescribed)).toEqual([22, 21]);
  });

  it('returns null when the detected modality has no prescribed counterpart', () => {
    const detected = [det('bike', { distance_meters: 8000 })];
    const prescribed = [presc(10, 'run', 'distance', 5000), presc(11, 'strength', 'reps', 10)];
    expect(matchVisionSegments(detected, prescribed)).toEqual([null]);
  });

  it('vetoes an out-of-tolerance order pair rather than misattribute', () => {
    // Single row detected at 5000 m but prescription asks a 500 m row: 900% off
    // → refuse the link (better null than a poisoned analytics row).
    const detected = [det('row', { distance_meters: 5000 })];
    const prescribed = [presc(30, 'row', 'distance', 500)];
    expect(matchVisionSegments(detected, prescribed)).toEqual([null]);
  });

  it('matches each modality independently within a mixed prescription', () => {
    const detected = [det('run', { distance_meters: 1000 }), det('ski', { distance_meters: 1000 })];
    const prescribed = [
      presc(1, 'run', 'distance', 1000),
      presc(2, 'ski', 'distance', 1000),
      presc(3, 'strength', 'reps', 12),
    ];
    expect(matchVisionSegments(detected, prescribed)).toEqual([1, 2]);
  });

  it('ignores prescribed items with no modality', () => {
    const detected = [det('run', { distance_meters: 3000 })];
    const prescribed = [presc(9, null, 'distance', 3000), presc(10, 'run', 'distance', 3000)];
    expect(matchVisionSegments(detected, prescribed)).toEqual([10]);
  });

  it('returns an empty array for no detected segments', () => {
    expect(matchVisionSegments([], [presc(1, 'run', 'distance', 5000)])).toEqual([]);
  });

  it('falls back to relative order when only one side exposes measures', () => {
    // Prescribed carries durations, detected carries none → measures can\'t
    // decide, so order pairs 1:1 (both incomparable pairs are accepted).
    const detected = [det('run'), det('run')];
    const prescribed = [presc(41, 'run', 'time', 300), presc(42, 'run', 'time', 600)];
    expect(matchVisionSegments(detected, prescribed)).toEqual([41, 42]);
  });
});
