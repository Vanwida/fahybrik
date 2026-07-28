// A station bar is a claim about where the athlete placed in the field. Without
// a rank or a field size there is no such claim to make — and a bar at half mast
// with a "slightly_worse" verdict, which is what this used to emit, reads as a
// measured mediocre result. Ley de honestidad del dato, docs/CONTRATO-UI.md §7.
//
// Every race in production carries field_size = NULL today, so this rule decides
// what all eight stations of every imported race look like.

import { describe, expect, test } from 'vitest';
import { stationFieldReading } from '@/lib/athlete/race-context';

describe('stationFieldReading', () => {
  test('no field size → no bar and no verdict, never a neutral 0.5', () => {
    const r = stationFieldReading(120, null);
    expect(r.fraction).toBeNull();
    expect(r.severity).toBeNull();
  });

  test('no rank → no bar and no verdict', () => {
    expect(stationFieldReading(null, 480)).toEqual({ fraction: null, severity: null });
  });

  test('a non-positive rank or field is not data either', () => {
    expect(stationFieldReading(0, 480)).toEqual({ fraction: null, severity: null });
    expect(stationFieldReading(120, 0)).toEqual({ fraction: null, severity: null });
    expect(stationFieldReading(-3, -3)).toEqual({ fraction: null, severity: null });
  });

  test('a real placing still reads exactly as before — top quartile is "better"', () => {
    const r = stationFieldReading(100, 1000);
    expect(r.severity).toBe('better');
    expect(r.fraction).toBeCloseTo(0.15, 5); // floor keeps a near-best bar visible
  });

  test('the percentile bands are unchanged for measured placings', () => {
    expect(stationFieldReading(250, 1000).severity).toBe('better'); // 25 %
    expect(stationFieldReading(400, 1000).severity).toBe('slightly_worse'); // 40 %
    expect(stationFieldReading(500, 1000).severity).toBe('slightly_worse'); // 50 %
    expect(stationFieldReading(510, 1000).severity).toBe('worse'); // 51 %
    expect(stationFieldReading(1000, 1000).fraction).toBe(1);
  });

  test('bar and verdict are inseparable — one never appears without the other', () => {
    for (const [rank, field] of [
      [120, 480],
      [null, 480],
      [120, null],
      [null, null],
    ] as Array<[number | null, number | null]>) {
      const r = stationFieldReading(rank, field);
      expect(r.fraction === null).toBe(r.severity === null);
    }
  });
});
