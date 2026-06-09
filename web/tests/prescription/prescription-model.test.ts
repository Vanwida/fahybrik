// Pure unit tests for the unified PRESCRIPTION model
// (@fahybrid/shared/domain/prescription) — the typed per-set dosage shape that
// spans every modality with zero free text.
//
// Nothing here touches the DB: the model is pure (Zod schema + render/derive/
// parse helpers), so these are the highest-value, fastest tests. They stress the
// CANONICAL real cases Pablo writes (a strength pyramid, a paced run interval, a
// /500m erg, a cal sprint, a Z2 steady, a mixed/compromised concept) and lock the
// back-compat aliases (`{load, reps}`) + the `for_time` scheme round-trip.

import { describe, expect, test } from 'vitest';
import {
  BLOCK_EXERCISE_KEYS,
  TEMPLATE_SEGMENT_KEYS,
  legacyRowToPrescription,
  loadToTarget,
  prescriptionSchema,
  prescriptionToParams,
  prescriptionToText,
  safeParsePrescription,
  setMeasure,
  setTarget,
  targetToLoad,
  type Prescription,
  type Target,
} from '@fahybrid/shared/domain/prescription';

// ─────────────────────────────────────────────────────────────────────────────
// Schema: Target / Measure / Modality validation
// ─────────────────────────────────────────────────────────────────────────────
describe('prescriptionSchema — Target validation', () => {
  function withTarget(target: unknown): unknown {
    return { scheme: 'sets', sets: [{ measure: { kind: 'reps', value: 5 }, target }] };
  }

  test('accepts every target kind with a value', () => {
    const kinds: Target[] = [
      { kind: 'percent_rm', value: 75 },
      { kind: 'kg', value: 100 },
      { kind: 'rpe', value: 8 },
      { kind: 'rir', value: 2 },
      { kind: 'bodyweight' },
      { kind: 'pace', unit: 'per_km', value_s: 270 },
      { kind: 'hr_zone', value: 2 },
      { kind: 'hr_bpm', value: 150 },
      { kind: 'calories', value: 15 },
    ];
    for (const t of kinds) {
      expect(safeParsePrescription(withTarget(t)).success, JSON.stringify(t)).toBe(true);
    }
  });

  test('accepts range targets (min/max) and min_s/max_s for pace', () => {
    expect(safeParsePrescription(withTarget({ kind: 'percent_rm', min: 60, max: 75 })).success).toBe(true);
    expect(safeParsePrescription(withTarget({ kind: 'hr_zone', min: 3, max: 4 })).success).toBe(true);
    expect(
      safeParsePrescription(withTarget({ kind: 'pace', unit: 'per_km', min_s: 225, max_s: 240 })).success,
    ).toBe(true);
  });

  test('rejects a scalar target carrying neither value nor a range', () => {
    expect(safeParsePrescription(withTarget({ kind: 'percent_rm' })).success).toBe(false);
  });

  test('rejects min > max (scalar and pace)', () => {
    expect(safeParsePrescription(withTarget({ kind: 'percent_rm', min: 80, max: 60 })).success).toBe(false);
    expect(
      safeParsePrescription(withTarget({ kind: 'pace', unit: 'per_km', min_s: 300, max_s: 200 })).success,
    ).toBe(false);
  });

  test('rejects a pace target with no value_s/min_s/max_s', () => {
    expect(safeParsePrescription(withTarget({ kind: 'pace', unit: 'per_km' })).success).toBe(false);
  });

  test('enforces per-kind numeric bounds', () => {
    expect(safeParsePrescription(withTarget({ kind: 'hr_zone', value: 6 })).success).toBe(false); // > 5
    expect(safeParsePrescription(withTarget({ kind: 'rpe', value: 11 })).success).toBe(false); // > 10
    expect(safeParsePrescription(withTarget({ kind: 'hr_bpm', value: 300 })).success).toBe(false); // > 250
    expect(safeParsePrescription(withTarget({ kind: 'percent_rm', value: 150 })).success).toBe(true); // supramax OK
  });

  test('rejects unknown target kind / extra keys (strict)', () => {
    expect(safeParsePrescription(withTarget({ kind: 'made_up', value: 1 })).success).toBe(false);
    expect(
      safeParsePrescription(withTarget({ kind: 'percent_rm', value: 75, bogus: 1 })).success,
    ).toBe(false);
  });
});

describe('prescriptionSchema — Measure validation', () => {
  function withMeasure(measure: unknown): unknown {
    return { scheme: 'sets', sets: [{ measure }] };
  }
  test('accepts the four measure kinds', () => {
    expect(safeParsePrescription(withMeasure({ kind: 'reps', value: 10 })).success).toBe(true);
    expect(safeParsePrescription(withMeasure({ kind: 'distance', meters: 500 })).success).toBe(true);
    expect(safeParsePrescription(withMeasure({ kind: 'duration', seconds: 90 })).success).toBe(true);
    expect(safeParsePrescription(withMeasure({ kind: 'calories', value: 15 })).success).toBe(true);
  });
  test('reps must be a non-negative integer', () => {
    expect(safeParsePrescription(withMeasure({ kind: 'reps', value: 5.5 })).success).toBe(false);
    expect(safeParsePrescription(withMeasure({ kind: 'reps', value: -1 })).success).toBe(false);
  });
});

describe('prescriptionSchema — scheme + modality', () => {
  test('rejects an unknown scheme', () => {
    expect(safeParsePrescription({ scheme: 'tabata' }).success).toBe(false);
  });
  test('accepts the modality enum and rejects others', () => {
    expect(safeParsePrescription({ scheme: 'steady', modality: 'row' }).success).toBe(true);
    expect(safeParsePrescription({ scheme: 'steady', modality: 'crossfit' }).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Back-compat: legacy {load, reps} aliases still read through the schema
// ─────────────────────────────────────────────────────────────────────────────
describe('back-compat aliases', () => {
  test('legacy { load, reps } set normalizes onto measure/target', () => {
    const parsed = prescriptionSchema.parse({
      scheme: 'sets',
      sets: [{ reps: 8, load: { type: 'percent_rm', value: 70 } }],
    }) as Prescription;
    const s = parsed.sets![0]!;
    expect(setMeasure(s)).toEqual({ kind: 'reps', value: 8 });
    expect(setTarget(s)).toEqual({ kind: 'percent_rm', value: 70 });
  });

  test('legacy duration_s / distance_m / rpe / rir / hr_zone aliases lift', () => {
    const p = prescriptionSchema.parse({
      scheme: 'sets',
      sets: [
        { duration_s: 60, rpe: 8 },
        { distance_m: 400, rir: 2 },
        { reps: 10, hr_zone: 3 },
      ],
    }) as Prescription;
    expect(setMeasure(p.sets![0]!)).toEqual({ kind: 'duration', seconds: 60 });
    expect(setTarget(p.sets![0]!)).toEqual({ kind: 'rpe', value: 8 });
    expect(setMeasure(p.sets![1]!)).toEqual({ kind: 'distance', meters: 400 });
    expect(setTarget(p.sets![1]!)).toEqual({ kind: 'rir', value: 2 });
    expect(setTarget(p.sets![2]!)).toEqual({ kind: 'hr_zone', value: 3 });
  });

  test('block-level legacy hr_zone lifts to a block target', () => {
    const p = prescriptionSchema.parse({ scheme: 'steady', hr_zone: 2 }) as Prescription;
    expect(p.target).toEqual({ kind: 'hr_zone', value: 2 });
  });

  test('loadToTarget / targetToLoad round-trip strength loads', () => {
    expect(loadToTarget({ type: 'percent_rm', value: 75 })).toEqual({ kind: 'percent_rm', value: 75 });
    expect(loadToTarget({ type: 'bodyweight' })).toEqual({ kind: 'bodyweight' });
    expect(targetToLoad({ kind: 'kg', value: 100 })).toEqual({ type: 'kg', value: 100 });
    // pace/hr have no legacy Load form
    expect(targetToLoad({ kind: 'pace', unit: 'per_km', value_s: 270 })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// prescriptionToText
// ─────────────────────────────────────────────────────────────────────────────
describe('prescriptionToText', () => {
  test('renders run pace /km', () => {
    const p: Prescription = { scheme: 'steady', target: { kind: 'pace', unit: 'per_km', value_s: 270 } };
    expect(prescriptionToText(p)).toContain('4:30/km');
  });

  test('renders erg pace /500m', () => {
    const p: Prescription = { scheme: 'steady', target: { kind: 'pace', unit: 'per_500m', value_s: 110 } };
    expect(prescriptionToText(p)).toContain('1:50/500m');
  });

  test('renders zones Z2 and Z3-Z4', () => {
    expect(prescriptionToText({ scheme: 'steady', target: { kind: 'hr_zone', value: 2 } })).toContain('Z2');
    expect(prescriptionToText({ scheme: 'steady', target: { kind: 'hr_zone', min: 3, max: 4 } })).toContain('Z3-Z4');
  });

  test('renders calories goal "15 cal"', () => {
    expect(prescriptionToText({ scheme: 'amrap', target: { kind: 'calories', value: 15 } })).toContain('15 cal');
  });

  test('renders a %RM range "60-75%"', () => {
    const p: Prescription = { scheme: 'sets', sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', min: 60, max: 75 } }] };
    expect(prescriptionToText(p)).toContain('60-75%');
  });

  test('for_time renders "For Time" (rondas en castellano)', () => {
    expect(prescriptionToText({ scheme: 'for_time' })).toMatch(/For Time/i);
    expect(prescriptionToText({ scheme: 'for_time', rounds: 3 })).toMatch(/3 rondas For Time/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// prescriptionToParams
// ─────────────────────────────────────────────────────────────────────────────
describe('prescriptionToParams', () => {
  test('pace → pace_sec_per_km, with /500m normalized to /km', () => {
    const perKm = prescriptionToParams({ scheme: 'steady', target: { kind: 'pace', unit: 'per_km', value_s: 270 } });
    expect(perKm.pace_sec_per_km).toBe(270);
    expect(perKm.pace_unit).toBe('per_km');

    // 1:50/500m = 110s per 500m → 220s per 1000m (per_km).
    const per500 = prescriptionToParams({ scheme: 'steady', target: { kind: 'pace', unit: 'per_500m', value_s: 110 } });
    expect(per500.pace_sec_per_km).toBe(220);
    expect(per500.pace_unit).toBe('per_500m');
    expect(per500.pace_sec).toBe(110); // native unit preserved
  });

  test('hr_zone, calories, distance derive onto scalar params', () => {
    expect(prescriptionToParams({ scheme: 'steady', target: { kind: 'hr_zone', value: 2 } }).hr_zone).toBe(2);
    expect(prescriptionToParams({ scheme: 'amrap', target: { kind: 'calories', value: 15 } }).target_calories).toBe(15);

    const dist = prescriptionToParams({
      scheme: 'sets',
      sets: [{ measure: { kind: 'distance', meters: 500 } }],
    });
    expect(dist.distance_meters).toBe(500);
  });

  test('for_time marks scored_by=time and total_s as a CAP, not work duration', () => {
    const out = prescriptionToParams({ scheme: 'for_time', rounds: 3, total_s: 720 });
    expect(out.scored_by).toBe('time');
    expect(out.time_cap_seconds).toBe(720);
    expect(out.duration_seconds).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parse / legacyRowToPrescription — conservative, never fabricates
// ─────────────────────────────────────────────────────────────────────────────
describe('legacyRowToPrescription — conservative parsing', () => {
  test('parses "sub-3:40" as a pace CEILING (max_s)', () => {
    const { prescription } = legacyRowToPrescription(
      { params_json: { distance_meters: 1000 }, notes: 'easy run sub-3:40/km' },
      TEMPLATE_SEGMENT_KEYS,
    );
    const target = prescription.sets?.[0]?.target ?? prescription.target;
    expect(target).toMatchObject({ kind: 'pace', unit: 'per_km', max_s: 220 });
  });

  test('parses "@3:45-4:00/km" as a pace range', () => {
    const { prescription } = legacyRowToPrescription(
      { params_json: { distance_meters: 5000 }, notes: 'tempo @3:45-4:00/km' },
      TEMPLATE_SEGMENT_KEYS,
    );
    const target = prescription.sets?.[0]?.target ?? prescription.target;
    expect(target).toMatchObject({ kind: 'pace', unit: 'per_km', min_s: 225, max_s: 240 });
  });

  test('parses "1:50/500m" erg pace as a point', () => {
    const { prescription } = legacyRowToPrescription(
      { params_json: { distance_meters: 500 }, notes: 'row 500m @1:50/500m' },
      TEMPLATE_SEGMENT_KEYS,
    );
    const target = prescription.sets?.[0]?.target ?? prescription.target;
    expect(target).toMatchObject({ kind: 'pace', unit: 'per_500m', value_s: 110 });
  });

  test('parses "Z3-Z4" zone range', () => {
    const { prescription } = legacyRowToPrescription(
      { params_json: { time_seconds: 1200 }, notes: 'steady Z3-Z4' },
      TEMPLATE_SEGMENT_KEYS,
    );
    expect(prescription.target).toMatchObject({ kind: 'hr_zone', min: 3, max: 4 });
  });

  test('parses "15 cal" calories goal', () => {
    const { prescription } = legacyRowToPrescription(
      { params_json: {}, notes: 'ski 15 cal hard' },
      TEMPLATE_SEGMENT_KEYS,
    );
    expect(prescription.target).toMatchObject({ kind: 'calories', value: 15 });
  });

  test('does NOT fabricate a target from ambiguous prose', () => {
    const { prescription, needs_review } = legacyRowToPrescription(
      { params_json: { sets: 4, reps: 10 }, notes: 'work hard, feel it out' },
      BLOCK_EXERCISE_KEYS,
    );
    // No pace/zone/cal token → no invented target on the sets.
    const anyFabricated = (prescription.sets ?? []).some(
      (s) => s.target && s.target.kind !== 'percent_rm' && s.target.kind !== 'kg',
    );
    expect(anyFabricated).toBe(false);
    expect(prescription.target).toBeUndefined();
    expect(needs_review).toBe(false);
  });

  test('rpe in params is preserved as a note, not silently dropped', () => {
    const { prescription } = legacyRowToPrescription(
      { params_json: { time_seconds: 600, rpe: 7 }, notes: '' },
      TEMPLATE_SEGMENT_KEYS,
    );
    expect(prescription.note).toMatch(/RPE 7/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Canonical real cases (stress test the whole model end to end)
// ─────────────────────────────────────────────────────────────────────────────
describe('canonical real cases', () => {
  test('strength pyramid 10/10/8/8/6 @ 60-75% validates, renders, derives', () => {
    const reps = [10, 10, 8, 8, 6];
    const loads = [60, 65, 70, 70, 75];
    const p: Prescription = {
      scheme: 'sets',
      modality: 'strength',
      sets: reps.map((r, i) => ({
        measure: { kind: 'reps', value: r },
        target: { kind: 'percent_rm', value: loads[i]! },
        rest_s: 150,
      })),
    };
    expect(safeParsePrescription(p).success).toBe(true);
    const text = prescriptionToText(p);
    expect(text).toContain('10/10/8/8/6');
    const params = prescriptionToParams(p);
    expect(params.sets).toBe(5);
    expect(params.reps_scheme).toBe('10/10/8/8/6');
    expect(params.load_pct_seq).toBe('60/65/70/70/75');
    expect(params.rest_seconds).toBe(150);
  });

  test('run pace interval: 6 × 400m @ 4:00/km', () => {
    const p: Prescription = {
      scheme: 'interval',
      modality: 'run',
      rounds: 6,
      rest_s: 90,
      sets: Array.from({ length: 6 }, () => ({
        measure: { kind: 'distance', meters: 400 },
        target: { kind: 'pace', unit: 'per_km', value_s: 240 },
      })),
    };
    expect(safeParsePrescription(p).success).toBe(true);
    expect(prescriptionToText(p)).toContain('4:00/km');
    expect(prescriptionToParams(p).pace_sec_per_km).toBe(240);
  });

  test('row /500m piece: 2000m @ 1:50/500m', () => {
    const p: Prescription = {
      scheme: 'steady',
      modality: 'row',
      sets: [{ measure: { kind: 'distance', meters: 2000 }, target: { kind: 'pace', unit: 'per_500m', value_s: 110 } }],
    };
    expect(safeParsePrescription(p).success).toBe(true);
    expect(prescriptionToText(p)).toContain('1:50/500m');
    const params = prescriptionToParams(p);
    expect(params.pace_sec_per_km).toBe(220);
    expect(params.distance_meters).toBe(2000);
  });

  test('calorie sprint: AMRAP-ish ski 15 cal', () => {
    const p: Prescription = {
      scheme: 'sets',
      modality: 'ski',
      sets: [{ measure: { kind: 'calories', value: 15 }, target: { kind: 'calories', value: 15 } }],
    };
    expect(safeParsePrescription(p).success).toBe(true);
    expect(prescriptionToText(p)).toContain('15 cal');
    expect(prescriptionToParams(p).calories).toBe(15);
  });

  test('Z2 steady ride: 45 min @ Z2', () => {
    const p: Prescription = { scheme: 'steady', modality: 'bike', total_s: 2700, target: { kind: 'hr_zone', value: 2 } };
    expect(safeParsePrescription(p).success).toBe(true);
    expect(prescriptionToText(p)).toContain('Z2');
    expect(prescriptionToParams(p).hr_zone).toBe(2);
  });

  test('mixed/compromised concept: a run leg + a wall-ball leg are SEPARATE lines, each its own modality', () => {
    // A compromised block is multiple block items sharing a block_position — NOT
    // nested in one Prescription. Each line validates on its own.
    const runLine: Prescription = {
      scheme: 'steady',
      modality: 'run',
      sets: [{ measure: { kind: 'distance', meters: 1000 }, target: { kind: 'pace', unit: 'per_km', value_s: 240 } }],
    };
    const wallBallLine: Prescription = {
      scheme: 'sets',
      modality: 'functional',
      sets: [{ measure: { kind: 'reps', value: 50 } }],
    };
    expect(safeParsePrescription(runLine).success).toBe(true);
    expect(safeParsePrescription(wallBallLine).success).toBe(true);
    expect(runLine.modality).not.toBe(wallBallLine.modality);
  });

  test('for_time scheme round-trips through the schema', () => {
    const p: Prescription = {
      scheme: 'for_time',
      modality: 'functional',
      rounds: 3,
      total_s: 720,
      sets: [{ measure: { kind: 'reps', value: 21 } }],
    };
    const parsed = prescriptionSchema.parse(p) as Prescription;
    expect(parsed.scheme).toBe('for_time');
    expect(parsed.rounds).toBe(3);
    expect(parsed.total_s).toBe(720);
    expect(prescriptionToParams(parsed).scored_by).toBe('time');
  });
});
