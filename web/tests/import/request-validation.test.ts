/**
 * PURE request-validation for the #28 import endpoints — no DB, no I/O. Pins the
 * proposal request shape (microcycle + variant + range), the variant enum, and
 * the confirm request shape (explicit week mapping + synonyms + day bounds). The
 * natural-language range grammar itself is covered in xlsx-range.test.ts; here we
 * assert the ENDPOINT contract around it (variant restricted, range required).
 */
import { describe, expect, test } from 'vitest';
import {
  importProposalRequestSchema,
  importVariantSchema,
} from '@/lib/import/proposal-service';
import { importConfirmRequestSchema } from '@/lib/import/confirm-service';
import { parseWeekRange } from '@/lib/import/range-parse';

// A minimal, valid EditorSession the confirm schema accepts (one resolved line).
const validSession = {
  uid: 's1',
  slot: 'am' as const,
  focus: 'Fuerza inferior',
  blocks: [
    {
      uid: 'b1',
      title: 'Sentadilla',
      format: 'sets',
      items: [
        {
          uid: 'i1',
          exercise_id: 42,
          exercise_name: 'Back Squat',
          prescription: {
            scheme: 'sets',
            modality: 'strength',
            sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 70 } }],
          },
        },
      ],
    },
  ],
};

describe('importVariantSchema', () => {
  test('accepts the three real xlsx variants', () => {
    for (const v of ['estandar', 'fuerza', 'resistencia']) {
      expect(importVariantSchema.safeParse(v).success).toBe(true);
    }
  });
  test('rejects an unknown variant', () => {
    expect(importVariantSchema.safeParse('velocidad').success).toBe(false);
  });
});

describe('importProposalRequestSchema', () => {
  const base = { microcycle_id: 7, variant: 'estandar', range_text: 'de la 1 a la 4' };

  test('accepts a minimal valid request', () => {
    expect(importProposalRequestSchema.safeParse(base).success).toBe(true);
  });
  test('accepts an uploaded workbook (xlsx_base64)', () => {
    const r = importProposalRequestSchema.safeParse({ ...base, xlsx_base64: 'UEsDBBQ=' });
    expect(r.success).toBe(true);
  });
  test('accepts pasted text', () => {
    const r = importProposalRequestSchema.safeParse({ ...base, pasted_text: 'Martes\n5 rounds Back Squat' });
    expect(r.success).toBe(true);
  });
  test('paste flow: valid WITHOUT a week range, targeting a weekday', () => {
    const r = importProposalRequestSchema.safeParse({
      microcycle_id: 7,
      variant: 'estandar',
      pasted_text: 'A) EMOM 15\n1) 4 Power clean',
      target_weekday: 4,
    });
    expect(r.success).toBe(true);
  });
  test('rejects a target_weekday out of 1..7', () => {
    const r = importProposalRequestSchema.safeParse({
      microcycle_id: 7,
      variant: 'estandar',
      pasted_text: 'A) EMOM 15',
      target_weekday: 8,
    });
    expect(r.success).toBe(false);
  });
  test('rejects the Excel flow with no range and no paste', () => {
    expect(
      importProposalRequestSchema.safeParse({ microcycle_id: 7, variant: 'estandar' }).success,
    ).toBe(false);
  });
  test('rejects a missing variant', () => {
    expect(
      importProposalRequestSchema.safeParse({ microcycle_id: 7, range_text: 'de la 1 a la 4' }).success,
    ).toBe(false);
  });
  test('rejects an unknown variant', () => {
    expect(importProposalRequestSchema.safeParse({ ...base, variant: 'foo' }).success).toBe(false);
  });
  test('rejects an empty range_text', () => {
    expect(importProposalRequestSchema.safeParse({ ...base, range_text: '' }).success).toBe(false);
  });
  test('rejects a missing microcycle_id', () => {
    expect(
      importProposalRequestSchema.safeParse({ variant: 'estandar', range_text: 'de la 1 a la 4' }).success,
    ).toBe(false);
  });
  test('rejects unknown keys (.strict)', () => {
    expect(importProposalRequestSchema.safeParse({ ...base, weeks: [] }).success).toBe(false);
  });
});

describe('range wiring — the parser feeds the endpoint', () => {
  test('a valid range yields concrete week numbers', () => {
    expect(parseWeekRange('de la 1 a la 4')).toEqual({ weeks: [1, 2, 3, 4] });
  });
  test('an out-of-season range surfaces an error the endpoint can 400', () => {
    expect(parseWeekRange('de la 10 a la 14')).toHaveProperty('error');
  });
});

describe('importConfirmRequestSchema', () => {
  const base = {
    microcycle_id: 7,
    weeks: [{ target_week_template_id: 11, day_of_week: 2, sessions: [validSession] }],
  };

  test('accepts a valid confirm with an explicit week mapping', () => {
    const r = importConfirmRequestSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.synonyms).toEqual([]); // defaults to []
  });
  test('accepts learned synonyms', () => {
    const r = importConfirmRequestSchema.safeParse({
      ...base,
      synonyms: [{ term: 'bar zercher jump', exercise_id: 99 }],
    });
    expect(r.success).toBe(true);
  });
  test('rejects an empty weeks array', () => {
    expect(importConfirmRequestSchema.safeParse({ ...base, weeks: [] }).success).toBe(false);
  });
  test('rejects a day_of_week out of 1..7', () => {
    const bad = { ...base, weeks: [{ target_week_template_id: 11, day_of_week: 8, sessions: [validSession] }] };
    expect(importConfirmRequestSchema.safeParse(bad).success).toBe(false);
  });
  test('rejects a missing target_week_template_id (Fork B: mapping is explicit)', () => {
    const bad = { ...base, weeks: [{ day_of_week: 2, sessions: [validSession] }] };
    expect(importConfirmRequestSchema.safeParse(bad).success).toBe(false);
  });
  test('a null exercise_id line still PARSES (server rejects it, not the schema)', () => {
    // The schema allows null exercise_id (an incomplete line); the SERVER refuses
    // to save it. This asserts the boundary is enforced in the service, not zod.
    const withNull = {
      ...base,
      weeks: [
        {
          target_week_template_id: 11,
          day_of_week: 2,
          sessions: [
            {
              ...validSession,
              blocks: [
                { ...validSession.blocks[0], items: [{ ...validSession.blocks[0]!.items[0]!, exercise_id: null }] },
              ],
            },
          ],
        },
      ],
    };
    expect(importConfirmRequestSchema.safeParse(withNull).success).toBe(true);
  });
});
