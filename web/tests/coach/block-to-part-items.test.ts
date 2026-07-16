import { describe, expect, test } from 'vitest';
import {
  createPartFromLibraryBlock,
  type LibraryBlockExercise,
} from '@/lib/dashboard/programming/block-to-part';
import { setMeasure } from '@fahybrid/shared/domain/prescription';
import type { Block } from '@fahybrid/shared/schema/blocks';

// A real block from Pablo's method (coach 60, imported from his Excel).
const BLOCK: Block = {
  id: 4211,
  slug: 'front-squat-6-series',
  title: 'Front squat 6 series 7-6-6-6-5-5',
  description: 'Front squat 6 series 7-6-6-6-5-5 + Burpee to plate BTW',
  methodology_group_id: 1,
  format: 'strength_block',
  source_ref: 'S11 – Martes',
  needs_review: false,
} as Block;

// Its real `block_exercises` rows — 6 typed sets, exactly as stored.
const EXERCISES: LibraryBlockExercise[] = [
  {
    exercise_id: 42,
    exercise_name: 'Front Squat',
    params_json: { sets: 6, reps: 7 },
    prescription_json: {
      scheme: 'sets',
      modality: 'strength',
      sets: [7, 6, 6, 6, 5, 5].map((reps) => ({ measure: { kind: 'reps', value: reps } })),
    },
  },
  {
    exercise_id: 43,
    exercise_name: 'Burpee',
    params_json: {},
    prescription_json: { scheme: 'sets', modality: 'functional' },
  },
];

describe('createPartFromLibraryBlock — the block IS structure', () => {
  test('maps block_exercises into items with their typed prescription', () => {
    const part = createPartFromLibraryBlock(BLOCK, undefined, EXERCISES);

    // The regression: this used to be hardcoded `[]`, stranding Pablo's whole
    // method in coach_note as dead text.
    expect(part.items).toHaveLength(2);

    const squat = part.items[0]!;
    expect(squat.exercise_id).toBe(42);
    expect(squat.exercise_name).toBe('Front Squat');
    const sets = squat.prescription_json?.sets ?? [];
    expect(sets).toHaveLength(6);
    expect(sets.map((s) => setMeasure(s)?.kind === 'reps' ? setMeasure(s)!.value : null)).toEqual([
      7, 6, 6, 6, 5, 5,
    ]);
  });

  test("keeps the coach's verbatim text as provenance, not as the payload", () => {
    const part = createPartFromLibraryBlock(BLOCK, undefined, EXERCISES);
    expect(part.coach_note).toContain('Front squat 6 series');
    expect(part.source_block_id).toBe(4211);
  });

  test('a caller that loads no exercises still gets the old text-only part', () => {
    // Additive by construction: nothing that did not opt in changes behaviour.
    const part = createPartFromLibraryBlock(BLOCK);
    expect(part.items).toEqual([]);
    expect(part.coach_note).toContain('Front squat 6 series');
  });

  test('an exercise with no catalog id is dropped — never saved, never invented', () => {
    const part = createPartFromLibraryBlock(BLOCK, undefined, [
      ...EXERCISES,
      { exercise_id: 0, exercise_name: 'Movimiento suelto' } as LibraryBlockExercise,
    ]);
    expect(part.items).toHaveLength(2);
    expect(part.items.map((i) => i.exercise_name)).not.toContain('Movimiento suelto');
  });

  test('an unparseable prescription drops the dose, not the exercise', () => {
    const part = createPartFromLibraryBlock(BLOCK, undefined, [
      { exercise_id: 42, exercise_name: 'Front Squat', prescription_json: { scheme: 'no-existe' } },
    ]);
    expect(part.items).toHaveLength(1);
    expect(part.items[0]!.prescription_json).toBeUndefined();
  });
});
