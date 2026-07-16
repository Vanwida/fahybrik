import { describe, expect, test } from 'vitest';
import {
  checkPrescriptionCompleteness,
  prescriptionSchema,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';

// The gate exists because `prescriptionSchema` answers a different question. Every
// "garbage" case below PARSES — that is the whole point: well-formed and empty of
// prescription are not mutually exclusive, and only this gate separates them.
function p(raw: unknown): Prescription {
  return prescriptionSchema.parse(raw);
}

describe('checkPrescriptionCompleteness — universal floor', () => {
  test('a bare scheme is well-formed and is NOT a workout', () => {
    // The real regression: "Batería 1RM" was three exercise names, nothing else.
    const bare = p({ scheme: 'sets' });
    expect(bare).toBeTruthy(); // parses clean…
    const r = checkPrescriptionCompleteness(bare, { modality: 'strength' });
    expect(r.ok).toBe(false); // …and still prescribes nothing.
    expect(r.reasons.join(' ')).toMatch(/dosis|series/i);
  });

  test('a capped scheme must state its cap', () => {
    const noCap = p({ scheme: 'amrap', sets: [{ measure: { kind: 'reps', value: 10 } }] });
    const r = checkPrescriptionCompleteness(noCap, { modality: 'functional' });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/límite|duración|rondas/i);
  });
});

describe('checkPrescriptionCompleteness — run', () => {
  test('rejects a run with no target (the "Run" item that shipped)', () => {
    const r = checkPrescriptionCompleteness(
      p({ scheme: 'steady', sets: [{ measure: { kind: 'distance', meters: 1000 } }] }),
      { modality: 'run' },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/ritmo|zona|RPE/i);
  });

  test('accepts distance + pace', () => {
    const r = checkPrescriptionCompleteness(
      p({
        scheme: 'steady',
        sets: [
          {
            measure: { kind: 'distance', meters: 5000 },
            target: { kind: 'pace', unit: 'per_km', value_s: 270 },
          },
        ],
      }),
      { modality: 'run' },
    );
    expect(r.ok).toBe(true);
  });

  test('accepts duration + HR zone (Z2 rodaje)', () => {
    const r = checkPrescriptionCompleteness(
      p({
        scheme: 'steady',
        sets: [{ measure: { kind: 'duration', seconds: 3600 }, target: { kind: 'hr_zone', value: 2 } }],
      }),
      { modality: 'run' },
    );
    expect(r.ok).toBe(true);
  });

  test('a set inherits the block-level target', () => {
    const r = checkPrescriptionCompleteness(
      p({
        scheme: 'steady',
        target: { kind: 'hr_zone', value: 2 },
        sets: [{ measure: { kind: 'duration', seconds: 1800 } }],
      }),
      { modality: 'run' },
    );
    expect(r.ok).toBe(true);
  });

  test('intervals need a recovery between reps', () => {
    const noRest = p({
      scheme: 'intervals',
      sets: Array.from({ length: 5 }, () => ({
        measure: { kind: 'distance' as const, meters: 1000 },
        target: { kind: 'pace' as const, unit: 'per_km' as const, value_s: 225 },
      })),
    });
    expect(checkPrescriptionCompleteness(noRest, { modality: 'run' }).ok).toBe(false);

    const withRest = p({
      scheme: 'intervals',
      sets: Array.from({ length: 5 }, () => ({
        measure: { kind: 'distance' as const, meters: 1000 },
        target: { kind: 'pace' as const, unit: 'per_km' as const, value_s: 225 },
        rest_s: 120,
      })),
    });
    expect(checkPrescriptionCompleteness(withRest, { modality: 'run' }).ok).toBe(true);
  });

  test('a warm-up jog needs no target — its dose is unambiguous', () => {
    const jog = p({ scheme: 'warmup', sets: [{ measure: { kind: 'duration', seconds: 600 } }] });
    expect(checkPrescriptionCompleteness(jog, { modality: 'run', role: 'calentamiento' }).ok).toBe(true);
    // …but the same line in the main block is ambiguous: at what pace?
    expect(checkPrescriptionCompleteness(jog, { modality: 'run', role: 'principal' }).ok).toBe(false);
  });
});

describe('checkPrescriptionCompleteness — strength', () => {
  test('rejects reps with no load', () => {
    const r = checkPrescriptionCompleteness(
      p({ scheme: 'sets', sets: [{ measure: { kind: 'reps', value: 5 }, rest_s: 180 }] }),
      { modality: 'strength' },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/carga/i);
  });

  test('rejects load with no rest — 5×5 at 2min and at 4min are different sessions', () => {
    const r = checkPrescriptionCompleteness(
      p({
        scheme: 'sets',
        sets: Array.from({ length: 5 }, () => ({
          measure: { kind: 'reps' as const, value: 5 },
          target: { kind: 'percent_rm' as const, value: 80 },
        })),
      }),
      { modality: 'strength' },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/descanso/i);
  });

  test('accepts 5×5 @80% rest 3min tempo 30X1', () => {
    const r = checkPrescriptionCompleteness(
      p({
        scheme: 'sets',
        sets: Array.from({ length: 5 }, () => ({
          measure: { kind: 'reps' as const, value: 5 },
          target: { kind: 'percent_rm' as const, value: 80 },
          rest_s: 180,
          tempo: '30X1',
        })),
      }),
      { modality: 'strength' },
    );
    expect(r.ok).toBe(true);
  });

  test('accepts RIR and bodyweight as loads', () => {
    for (const target of [{ kind: 'rir' as const, value: 2 }, { kind: 'bodyweight' as const }]) {
      const r = checkPrescriptionCompleteness(
        p({ scheme: 'sets', sets: [{ measure: { kind: 'reps', value: 8 }, target, rest_s: 90 }] }),
        { modality: 'strength' },
      );
      expect(r.ok).toBe(true);
    }
  });
});

describe('checkPrescriptionCompleteness — ergo / functional / core', () => {
  test('accepts row 2000m @ 1:50/500m', () => {
    const r = checkPrescriptionCompleteness(
      p({
        scheme: 'steady',
        sets: [
          {
            measure: { kind: 'distance', meters: 2000 },
            target: { kind: 'pace', unit: 'per_500m', value_s: 110 },
          },
        ],
      }),
      { modality: 'row' },
    );
    expect(r.ok).toBe(true);
  });

  test('rejects an erg effort with no intensity', () => {
    const r = checkPrescriptionCompleteness(
      p({ scheme: 'steady', sets: [{ measure: { kind: 'calories', value: 50 } }] }),
      { modality: 'ski' },
    );
    expect(r.ok).toBe(false);
  });

  test('a WOD movement needs a measure, not a load — 10 burpees is 10 burpees', () => {
    const r = checkPrescriptionCompleteness(
      p({ scheme: 'amrap', total_s: 720, sets: [{ measure: { kind: 'reps', value: 10 } }] }),
      { modality: 'functional' },
    );
    expect(r.ok).toBe(true);
  });

  test('accepts core holds by time', () => {
    const r = checkPrescriptionCompleteness(
      p({
        scheme: 'sets',
        sets: Array.from({ length: 3 }, () => ({ measure: { kind: 'duration' as const, seconds: 45 } })),
      }),
      { modality: 'core' },
    );
    expect(r.ok).toBe(true);
  });
});

describe('checkPrescriptionCompleteness — unknown modality', () => {
  test('falls back to the floor rather than inventing a stricter rule', () => {
    const r = checkPrescriptionCompleteness(
      p({ scheme: 'steady', sets: [{ measure: { kind: 'duration', seconds: 600 } }] }),
      { modality: null },
    );
    expect(r.ok).toBe(true);
    expect(checkPrescriptionCompleteness(p({ scheme: 'steady' }), { modality: null }).ok).toBe(false);
  });
});
