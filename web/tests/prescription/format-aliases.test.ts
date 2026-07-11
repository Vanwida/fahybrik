/**
 * Pure tests for the format catalog's legacy-alias folding
 * (shared/domain/prescription/format.ts). These guard the invariant the effort
 * CONTEXT backfill (migration 0120) relies on: SQL and TS canonicalize a legacy
 * `block_format`/`templates.format` string to the SAME canonical member. The
 * `simulation → hyrox_sim` alias in particular is exercised on both sides — the
 * SQL helper `_seg_ctx_canonical_format` mirrors this map exactly.
 */
import { describe, expect, test } from 'vitest';
import {
  LEGACY_FORMAT_ALIASES,
  WORKOUT_FORMATS,
  normalizeFormat,
} from '@fahybrid/shared/domain/prescription/format';

describe('format legacy aliases (canonicalization parity with SQL backfill)', () => {
  test('simulation folds to the canonical hyrox_sim', () => {
    expect(normalizeFormat('simulation')).toBe('hyrox_sim');
    expect(LEGACY_FORMAT_ALIASES.simulation).toBe('hyrox_sim');
  });

  test('every legacy block_format string seen in the demo DB canonicalizes', () => {
    // Real values observed in template_segments.block_format.
    const seen: Record<string, string> = {
      tempo: 'steady',
      intervals: 'intervals',
      hyrox_sim: 'hyrox_sim',
      for_time: 'for_time',
      strength_block: 'sets',
      circuit: 'rounds',
      emom: 'emom',
      amrap: 'amrap',
      steady: 'steady',
      simulation: 'hyrox_sim',
    };
    for (const [raw, canonical] of Object.entries(seen)) {
      expect(normalizeFormat(raw)).toBe(canonical);
    }
  });

  test('every alias target is itself a canonical catalog key', () => {
    for (const target of Object.values(LEGACY_FORMAT_ALIASES)) {
      expect(target in WORKOUT_FORMATS).toBe(true);
    }
  });

  test('null / unknown normalizes to undefined (no silent default)', () => {
    expect(normalizeFormat(null)).toBeUndefined();
    expect(normalizeFormat('')).toBeUndefined();
    expect(normalizeFormat('not_a_format')).toBeUndefined();
  });
});
