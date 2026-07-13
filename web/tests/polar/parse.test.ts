// Pure unit tests for the Polar v4 field parsers (no I/O).

import { describe, expect, test } from 'vitest';
import {
  polarLocalToUtcIso,
  millisToSeconds,
  parsePolarSecondsString,
} from '@/lib/polar/parse';

describe('polarLocalToUtcIso', () => {
  test('subtracts the UTC offset (minutes east) from local wall time', () => {
    // 10:12:33 local at UTC+3 (180) → 07:12:33 UTC. Millis suffix ignored.
    expect(polarLocalToUtcIso('2025-01-01T10:12:33.435', 180)).toBe('2025-01-01T07:12:33.000Z');
  });

  test('handles negative offsets (west of UTC)', () => {
    expect(polarLocalToUtcIso('2020-01-01T10:40:00', -300)).toBe('2020-01-01T15:40:00.000Z');
  });

  test('treats a missing offset as already-UTC', () => {
    expect(polarLocalToUtcIso('2020-01-01T08:00:00', undefined)).toBe('2020-01-01T08:00:00.000Z');
    expect(polarLocalToUtcIso('2020-01-01T08:00:00', null)).toBe('2020-01-01T08:00:00.000Z');
  });

  test('returns null for unparseable input', () => {
    expect(polarLocalToUtcIso(undefined, 0)).toBeNull();
    expect(polarLocalToUtcIso('not-a-date', 0)).toBeNull();
  });
});

describe('millisToSeconds', () => {
  test('rounds millis to whole seconds', () => {
    expect(millisToSeconds(3_600_000)).toBe(3600);
    expect(millisToSeconds(1500)).toBe(2);
    expect(millisToSeconds(0)).toBe(0);
  });
  test('null for absent / non-finite', () => {
    expect(millisToSeconds(undefined)).toBeNull();
    expect(millisToSeconds(null)).toBeNull();
    expect(millisToSeconds(NaN)).toBeNull();
  });
});

describe('parsePolarSecondsString', () => {
  test('parses protobuf duration strings', () => {
    expect(parsePolarSecondsString('27000s')).toBe(27000);
    expect(parsePolarSecondsString('3.000000001s')).toBe(3);
    expect(parsePolarSecondsString('90s')).toBe(90);
  });
  test('null for absent / malformed', () => {
    expect(parsePolarSecondsString(undefined)).toBeNull();
    expect(parsePolarSecondsString('')).toBeNull();
    expect(parsePolarSecondsString('27000')).toBeNull();
    expect(parsePolarSecondsString('PT10S')).toBeNull();
  });
});
