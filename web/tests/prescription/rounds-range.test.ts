/**
 * `Prescription.rounds_max` — un coach que escribe «3-4 rondas» está
 * prescribiendo una banda, igual que `Measure.max` para reps (docs/DECISIONS.md,
 * 2026-08-05 «Una medida de trabajo puede ser un RANGO»). Fase 2, ago-2026.
 */
import { describe, expect, test } from 'vitest';
import {
  parsePrescription,
  prescriptionSchema,
  roundsIsRange,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription';

describe('rounds_max — schema', () => {
  test('accepts a valid band (floor < ceiling)', () => {
    const p = parsePrescription({ scheme: 'rounds', rounds: 3, rounds_max: 4, work_s: 60 });
    expect(p.rounds).toBe(3);
    expect(p.rounds_max).toBe(4);
  });

  test('a fixed count (no rounds_max) still parses — additive field', () => {
    const p = parsePrescription({ scheme: 'rounds', rounds: 5, work_s: 60 });
    expect(p.rounds_max).toBeUndefined();
  });

  test('rejects an inverted band — a typo, not a range', () => {
    const result = prescriptionSchema.safeParse({ scheme: 'rounds', rounds: 4, rounds_max: 3 });
    expect(result.success).toBe(false);
  });

  test('rounds_max equal to rounds is a no-op range, not an error', () => {
    const p = parsePrescription({ scheme: 'rounds', rounds: 3, rounds_max: 3 });
    expect(p.rounds_max).toBe(3);
  });
});

describe('roundsIsRange', () => {
  test('true only when max is strictly above the floor', () => {
    expect(roundsIsRange({ rounds: 3, rounds_max: 4 })).toBe(true);
    expect(roundsIsRange({ rounds: 3, rounds_max: 3 })).toBe(false);
    expect(roundsIsRange({ rounds: 3 })).toBe(false);
    expect(roundsIsRange({})).toBe(false);
  });
});

describe('prescriptionToText — el atleta ve la banda, no solo el suelo', () => {
  test('rounds scheme: "3-4×90\'\'" instead of "3×90\'\'"', () => {
    const p: Prescription = { scheme: 'rounds', rounds: 3, rounds_max: 4, work_s: 90 };
    expect(prescriptionToText(p)).toContain("3-4×90''");
  });

  test('EMOM: "EMOM 3-4\'"', () => {
    const p: Prescription = { scheme: 'emom', rounds: 3, rounds_max: 4, work_s: 60 };
    expect(prescriptionToText(p)).toContain("EMOM 3-4'");
  });

  test('for_time: "3-4 rondas For Time"', () => {
    const p: Prescription = { scheme: 'for_time', rounds: 3, rounds_max: 4 };
    expect(prescriptionToText(p)).toContain('3-4 rondas For Time');
  });

  test('a fixed count still reads as a plain number, unchanged', () => {
    const p: Prescription = { scheme: 'emom', rounds: 10, work_s: 60 };
    expect(prescriptionToText(p)).toContain("EMOM 10'");
    expect(prescriptionToText(p)).not.toContain('-');
  });
});
