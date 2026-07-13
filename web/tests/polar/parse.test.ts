// Pure unit tests for the Polar field parsers (no I/O).

import { describe, expect, test } from 'vitest';
import { parseIso8601DurationSeconds, polarStartToUtcIso } from '@/lib/polar/parse';

describe('parseIso8601DurationSeconds', () => {
  test('parses H/M/S components', () => {
    expect(parseIso8601DurationSeconds('PT2H44M45S')).toBe(2 * 3600 + 44 * 60 + 45);
    expect(parseIso8601DurationSeconds('PT44M')).toBe(44 * 60);
    expect(parseIso8601DurationSeconds('PT30S')).toBe(30);
    expect(parseIso8601DurationSeconds('PT1H')).toBe(3600);
  });

  test('rounds fractional seconds', () => {
    expect(parseIso8601DurationSeconds('PT10.4S')).toBe(10);
    expect(parseIso8601DurationSeconds('PT10.6S')).toBe(11);
  });

  test('returns null for absent / empty / malformed input', () => {
    expect(parseIso8601DurationSeconds(undefined)).toBeNull();
    expect(parseIso8601DurationSeconds(null)).toBeNull();
    expect(parseIso8601DurationSeconds('')).toBeNull();
    expect(parseIso8601DurationSeconds('PT')).toBeNull();
    expect(parseIso8601DurationSeconds('2h44m')).toBeNull();
    expect(parseIso8601DurationSeconds('garbage')).toBeNull();
  });
});

describe('polarStartToUtcIso', () => {
  test('subtracts the UTC offset (minutes east) from local wall time', () => {
    // 10:40:02 local at UTC+3 → 07:40:02 UTC.
    expect(polarStartToUtcIso('2008-10-13T10:40:02', 180)).toBe('2008-10-13T07:40:02.000Z');
  });

  test('handles negative offsets (west of UTC)', () => {
    // 10:40:00 local at UTC-5 → 15:40:00 UTC.
    expect(polarStartToUtcIso('2020-01-01T10:40:00', -300)).toBe('2020-01-01T15:40:00.000Z');
  });

  test('treats a missing offset as already-UTC', () => {
    expect(polarStartToUtcIso('2020-01-01T08:00:00', undefined)).toBe('2020-01-01T08:00:00.000Z');
    expect(polarStartToUtcIso('2020-01-01T08:00:00', null)).toBe('2020-01-01T08:00:00.000Z');
  });

  test('tolerates a missing seconds component', () => {
    expect(polarStartToUtcIso('2020-01-01T08:00', 0)).toBe('2020-01-01T08:00:00.000Z');
  });

  test('returns null for unparseable input', () => {
    expect(polarStartToUtcIso(undefined, 0)).toBeNull();
    expect(polarStartToUtcIso('not-a-date', 0)).toBeNull();
  });
});
