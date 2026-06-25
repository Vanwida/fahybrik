// Round-trip integrity for the v2 session-save WRITE path.
//
// Proves the write side (sessionEditorModelToSegments in lib/dashboard/v2/
// editor-save.ts) is byte-equivalent with the read side the editor loads back
// (getTemplateDetail → loadSessionEditorModel), which prefers `prescription_json`
// parsed via the SHARED `prescriptionSchema`. So: a session a coach authors,
// saves, and re-opens shows the SAME modality + per-set measures/targets.
//
// We simulate the full round-trip without a DB:
//   editor model → sessionEditorModelToSegments  (WRITE — what we PUT)
//                → JSON.stringify/parse           (DB jsonb storage)
//                → safeParsePrescription          (READ — what the loader returns)
// and assert the recovered prescription_json deep-equals the authored one, for
// the two canonical hard cases: a BikeErg steady/distance line and a strength
// pyramid (10/10/8/8/6 with per-set %RM).

import { describe, expect, test } from 'vitest';
import {
  prescriptionToParams,
  safeParsePrescription,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import { sessionEditorModelToSegments } from '@/lib/dashboard/v2/editor-save';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';

// ── Canonical authored prescriptions ─────────────────────────────────────────

// BikeErg: steady scheme, distance measure, paced target (modality = bike). This
// is the case that previously vanished into free text / showed as "1 sets".
const bikeErg: Prescription = {
  scheme: 'steady',
  modality: 'bike',
  total_s: 1200,
  target: { kind: 'pace', unit: 'per_500m', value_s: 120 },
};

// Strength pyramid: 5 sets 10/10/8/8/6 reps, per-set %RM 60/65/70/70/75.
const strengthPyramid: Prescription = {
  scheme: 'sets',
  modality: 'strength',
  sets: [
    { measure: { kind: 'reps', value: 10 }, target: { kind: 'percent_rm', value: 60 }, rest_s: 150 },
    { measure: { kind: 'reps', value: 10 }, target: { kind: 'percent_rm', value: 65 }, rest_s: 150 },
    { measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 70 }, rest_s: 150 },
    { measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 70 }, rest_s: 150 },
    { measure: { kind: 'reps', value: 6 }, target: { kind: 'percent_rm', value: 75 }, rest_s: 150 },
  ],
};

const BIKE_EX_ID = 501;
const SQUAT_EX_ID = 77;

const blocks: EditorBlock[] = [
  {
    uid: 'b-cardio',
    title: 'Bici Z3 · constante',
    format: 'tempo',
    group: 'principal',
    items: [
      {
        uid: 'i-bike',
        exercise_id: BIKE_EX_ID,
        exercise_name: 'BikeErg',
        prescription: bikeErg,
      },
    ],
  },
  {
    uid: 'b-strength',
    title: 'Sentadilla · pirámide',
    format: 'strength_block',
    group: 'principal',
    items: [
      {
        uid: 'i-squat',
        exercise_id: SQUAT_EX_ID,
        exercise_name: 'Back Squat',
        prescription: strengthPyramid,
      },
      // A custom-typed line with no catalog exercise — must be dropped (FK).
      {
        uid: 'i-custom',
        exercise_id: null,
        exercise_name: 'Movilidad cadera (libre)',
        prescription: { scheme: 'sets', modality: 'mobility', sets: [{ measure: { kind: 'duration', seconds: 60 } }] },
      },
    ],
  },
];

// Simulate what the loader recovers from the DB: serialize (jsonb) then parse
// with the SAME shared schema the read side uses (safeParsePrescription).
function roundTripPrescription(p: Prescription): Prescription {
  const stored = JSON.parse(JSON.stringify(p)) as unknown;
  const parsed = safeParsePrescription(stored);
  expect(parsed.success).toBe(true);
  return parsed.success ? (parsed.data as Prescription) : (p as Prescription);
}

describe('v2 session save → reload round-trip', () => {
  test('flattens blocks → ordered segments with correct positions', () => {
    const { segments, dropped_items } = sessionEditorModelToSegments(blocks);

    // Two persistable items (bike + squat); the custom line is dropped.
    expect(segments).toHaveLength(2);
    expect(dropped_items).toBe(1);

    // Block 0 (cardio), item 0.
    expect(segments[0]).toMatchObject({
      exercise_id: BIKE_EX_ID,
      block_position: 0,
      position: 0,
      block_title: 'Bici Z3 · constante',
      block_format: 'tempo',
    });

    // Block 1 (strength), item 0 — position resets to 0 within the block.
    expect(segments[1]).toMatchObject({
      exercise_id: SQUAT_EX_ID,
      block_position: 1,
      position: 0,
      block_title: 'Sentadilla · pirámide',
      block_format: 'strength_block',
    });
  });

  test('BikeErg prescription_json round-trips byte-equivalent (modality + steady/distance/pace)', () => {
    const { segments } = sessionEditorModelToSegments(blocks);
    const bikeSeg = segments.find((s) => s.exercise_id === BIKE_EX_ID)!;

    // What we PUT into prescription_json is the authored prescription verbatim.
    expect(bikeSeg.prescription_json).toEqual(bikeErg);

    // What the editor reads back (loader path) deep-equals the authored one:
    // same modality (bike), same scheme (steady), same target (pace /500m).
    const recovered = roundTripPrescription(bikeSeg.prescription_json);
    expect(recovered).toEqual(bikeErg);
    expect(recovered.modality).toBe('bike');
    expect(recovered.target).toEqual({ kind: 'pace', unit: 'per_500m', value_s: 120 });
  });

  test('strength pyramid prescription_json round-trips byte-equivalent (per-set reps + %RM)', () => {
    const { segments } = sessionEditorModelToSegments(blocks);
    const squatSeg = segments.find((s) => s.exercise_id === SQUAT_EX_ID)!;

    expect(squatSeg.prescription_json).toEqual(strengthPyramid);

    const recovered = roundTripPrescription(squatSeg.prescription_json);
    expect(recovered).toEqual(strengthPyramid);

    // Per-set measures + targets survive exactly (no collapse to a scalar).
    const reps = recovered.sets!.map((s) => (s.measure?.kind === 'reps' ? s.measure.value : null));
    expect(reps).toEqual([10, 10, 8, 8, 6]);
    const loads = recovered.sets!.map((s) => (s.target?.kind === 'percent_rm' ? s.target.value : null));
    expect(loads).toEqual([60, 65, 70, 70, 75]);
  });

  test('params_json is the shared lossy summary, derived from the prescription', () => {
    const { segments } = sessionEditorModelToSegments(blocks);
    const squatSeg = segments.find((s) => s.exercise_id === SQUAT_EX_ID)!;

    // params_json must equal the shared helper's output (single source of truth).
    expect(squatSeg.params_json).toEqual(prescriptionToParams(strengthPyramid));
    // Sanity: the summary carries the set count + the per-set rep scheme hint.
    expect(squatSeg.params_json.sets).toBe(5);
    expect(squatSeg.params_json.reps_scheme).toBe('10/10/8/8/6');
  });
});
