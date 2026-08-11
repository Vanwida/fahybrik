import { describe, expect, it } from 'vitest';
import {
  inclusiveDaySpan,
  mergeSourceRows,
  sortSources,
  summarizeCoverage,
} from '@/lib/coach/data-coverage';

describe('inclusiveDaySpan', () => {
  it('cuenta el día de inicio y el de fin', () => {
    expect(inclusiveDaySpan('2026-01-01', '2026-01-01')).toBe(1);
    expect(inclusiveDaySpan('2026-01-01', '2026-01-10')).toBe(10);
  });

  it('devuelve 0 si el orden está al revés', () => {
    expect(inclusiveDaySpan('2026-02-01', '2026-01-01')).toBe(0);
  });
});

describe('mergeSourceRows', () => {
  it('fusiona streams y workouts de la misma fuente', () => {
    const sources = mergeSourceRows({
      streams: [
        { source: 'healthkit', first_day: '2025-06-01', last_day: '2026-08-01', n: 1000 },
        { source: 'garmin', first_day: '2026-07-01', last_day: '2026-08-01', n: 30 },
      ],
      workouts: [
        { source: 'healthkit', first_day: '2025-05-15', last_day: '2026-07-20', n: 40 },
        { source: 'polar', first_day: '2026-06-01', last_day: '2026-08-01', n: 12 },
      ],
    });

    expect(sources.map((s) => s.source)).toEqual(['healthkit', 'garmin', 'polar']);
    const hk = sources.find((s) => s.source === 'healthkit')!;
    expect(hk.first_day).toBe('2025-05-15');
    expect(hk.last_day).toBe('2026-08-01');
    expect(hk.samples).toBe(1000);
    expect(hk.workouts).toBe(40);
    expect(hk.span_days).toBe(inclusiveDaySpan('2025-05-15', '2026-08-01'));
  });
});

describe('sortSources', () => {
  it('pone las fuentes conocidas en orden de lectura y el resto al final', () => {
    expect(sortSources(['polar', 'zzz', 'healthkit', 'garmin'])).toEqual([
      'healthkit',
      'garmin',
      'polar',
      'zzz',
    ]);
  });
});

describe('summarizeCoverage', () => {
  const sources = mergeSourceRows({
    streams: [
      { source: 'healthkit', first_day: '2025-01-01', last_day: '2026-08-01', n: 10 },
    ],
    workouts: [],
  });

  it('calcula pre_plan_days cuando hay historia antes del plan', () => {
    const s = summarizeCoverage({ sources, plan_start: '2026-03-02' });
    expect(s.earliest_day).toBe('2025-01-01');
    expect(s.plan_start).toBe('2026-03-02');
    expect(s.pre_plan_days).toBeGreaterThan(300);
    expect(s.pre_plan_thin).toBe(false);
  });

  it('marca thin cuando no hay plan o el antes es corto', () => {
    expect(summarizeCoverage({ sources, plan_start: null }).pre_plan_thin).toBe(true);
    const short = mergeSourceRows({
      streams: [
        { source: 'healthkit', first_day: '2026-07-20', last_day: '2026-08-01', n: 5 },
      ],
      workouts: [],
    });
    const s = summarizeCoverage({ sources: short, plan_start: '2026-07-27' });
    expect(s.pre_plan_thin).toBe(true);
  });

  it('sin fuentes devuelve nulls honestos', () => {
    const s = summarizeCoverage({ sources: [], plan_start: '2026-01-01' });
    expect(s.earliest_day).toBeNull();
    expect(s.history_days).toBeNull();
    expect(s.pre_plan_days).toBeNull();
    expect(s.pre_plan_thin).toBe(true);
  });
});
