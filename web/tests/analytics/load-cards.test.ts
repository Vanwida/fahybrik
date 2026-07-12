/**
 * Pure (no-DB) unit tests for the athlete CARGA cards (Forma + Carga semanal),
 * added with task #67. Exercises the TSB→reading thresholds, the honesty gate,
 * and the chart contract (series_kind / series_axis) in isolation — runs in every
 * CI pass, no TEST_DATABASE_URL needed.
 */

import { describe, expect, test } from 'vitest';
import type { LoadPoint } from '@/lib/training-load';
import {
  buildFormCard,
  buildWeeklyLoadCard,
  formZone,
  weeklyBuckets,
  type WeeklyLoad,
} from '@/lib/athlete/analytics/load';

function point(date: string, tsb: number): LoadPoint {
  return { date, tss: 0, ctl: 0, atl: 0, tsb };
}

function daySeq(n: number, tsbAt: (i: number) => number): LoadPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 3, 1) + i * 86_400_000).toISOString().slice(0, 10);
    return point(d, tsbAt(i));
  });
}

describe('formZone — TSB reading bands (never leaks the acronym)', () => {
  test('band boundaries are inclusive at the lower edge', () => {
    expect(formZone(25).label).toBe('Muy fresco');
    expect(formZone(20).label).toBe('Muy fresco');
    expect(formZone(19).label).toBe('Fresco');
    expect(formZone(5).label).toBe('Fresco');
    expect(formZone(4).label).toBe('En equilibrio');
    expect(formZone(-10).label).toBe('En equilibrio');
    expect(formZone(-11).label).toBe('En carga');
    expect(formZone(-30).label).toBe('En carga');
    expect(formZone(-31).label).toBe('Fatiga alta');
    expect(formZone(-200).label).toBe('Fatiga alta');
  });

  test('the reading is plain Spanish with no CTL/ATL/TSB jargon', () => {
    for (const tsb of [30, 10, 0, -20, -50]) {
      const r = formZone(tsb).reading;
      expect(r).not.toMatch(/tsb|ctl|atl/i);
      expect(r.length).toBeGreaterThan(10);
    }
  });
});

describe('buildFormCard — Forma (freshness line)', () => {
  test('gates to needs_logging without enough RPE (no fabricated series)', () => {
    const c = buildFormCard(daySeq(30, () => -5), false);
    expect(c.availability).toBe('needs_logging');
    expect(c.primary).toBeNull();
    expect(c.series).toEqual([]);
    expect(c.series_kind).toBeNull();
    expect(c.availability_note).toBeTruthy();
  });

  test('gates to needs_logging with a single point (no range)', () => {
    expect(buildFormCard([point('2026-04-01', -5)], true).availability).toBe('needs_logging');
  });

  test('with data → a real line whose hero is the current plain-Spanish state', () => {
    // Ramps from fatigued (−28 = en carga) to fresh (+8 = fresco).
    const tail = daySeq(60, (i) => -28 + (i * 36) / 59);
    const c = buildFormCard(tail, true);
    expect(c.availability).toBe('real');
    expect(c.series_kind).toBe('line');
    expect(c.primary?.value).toBe('Fresco'); // last point ≈ +8
    expect(c.series.length).toBe(tail.length);
    expect(c.series[c.series.length - 1]!.current).toBe(true);
    // Real y-axis labels (words), derived from actual extremes, never fabricated.
    expect(c.series_axis).not.toBeNull();
    expect(c.series_axis!.min_display).toBe('En carga');
    expect(c.series_axis!.max_display).toBe('Fresco');
    expect(c.meaning_es).toBe(formZone(8).reading);
  });

  test('every height is finite and within [0.08, 1] — no NaN reaches the client', () => {
    const tail = daySeq(40, (i) => (i % 2 === 0 ? -60 : 50)); // beyond the display scale
    const c = buildFormCard(tail, true);
    for (const p of c.series) {
      expect(Number.isFinite(p.height)).toBe(true);
      expect(p.height).toBeGreaterThanOrEqual(0.08);
      expect(p.height).toBeLessThanOrEqual(1);
      expect(typeof p.display).toBe('string');
    }
  });
});

describe('buildWeeklyLoadCard — Carga semanal (volume bars)', () => {
  const weeks = (tss: number[]): WeeklyLoad[] =>
    tss.map((v, i) => ({ week: `2026-04-${String(1 + i * 7).padStart(2, '0')}`, tss: v }));

  test('gates to needs_logging without enough RPE', () => {
    const c = buildWeeklyLoadCard(weeks([100, 120, 140]), false);
    expect(c.availability).toBe('needs_logging');
    expect(c.series).toEqual([]);
    expect(c.series_kind).toBeNull();
  });

  test('with data → bars, numeric displays, no line axis', () => {
    const c = buildWeeklyLoadCard(weeks([120, 200, 260, 300]), true);
    expect(c.availability).toBe('real');
    expect(c.series_kind).toBe('bars');
    expect(c.series_axis).toBeNull();
    expect(c.series.length).toBe(4);
    expect(c.series[c.series.length - 1]!.current).toBe(true);
    for (const p of c.series) {
      expect(p.display).toMatch(/^\d+$/); // integer load, never NaN
      expect(Number.isFinite(p.height)).toBe(true);
      expect(p.height).toBeGreaterThanOrEqual(0.08);
      expect(p.height).toBeLessThanOrEqual(1);
    }
  });

  test('trend hero reads Subiendo / Bajando / Estable from the shape', () => {
    expect(buildWeeklyLoadCard(weeks([80, 100, 140, 220, 260, 300]), true).primary?.value).toBe(
      'Subiendo',
    );
    expect(buildWeeklyLoadCard(weeks([300, 260, 220, 140, 100, 80]), true).primary?.value).toBe(
      'Bajando',
    );
    expect(buildWeeklyLoadCard(weeks([200, 205, 198, 202, 200, 203]), true).primary?.value).toBe(
      'Estable',
    );
  });
});

describe('weeklyBuckets — shared ISO-week aggregation', () => {
  test('sums daily TSS into ascending weekly buckets', () => {
    // 2026-04-01 is a Wed (week Mon 2026-03-30); 2026-04-06 starts the next week.
    const daily = [
      { date: '2026-04-01', tss: 40 },
      { date: '2026-04-02', tss: 60 },
      { date: '2026-04-06', tss: 50 },
      { date: '2026-04-07', tss: 30 },
    ];
    const buckets = weeklyBuckets(daily);
    expect(buckets).toEqual([
      { week: '2026-03-30', tss: 100 },
      { week: '2026-04-06', tss: 80 },
    ]);
  });

  test('empty input yields no buckets', () => {
    expect(weeklyBuckets([])).toEqual([]);
  });
});
