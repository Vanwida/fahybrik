// free-workout-validate — PURE tests (no DB) for the entreno-libre body rules
// (lib/athlete/free-workout-validate). The contract under test:
//   · MEASURED modalities require a top-level prescription on a measured scheme;
//   · strength items must use 'sets' with every set carrying a measure;
//   · functional items must all share ONE metcon scheme, each with a measure;
//   · a DECLARED item list is bounded (1..12);
//   · functional with NO items is the box CLOCK: it saves, carrying the metcon
//     prescription it ran (scheme + structure, never sets). Strength with no items
//     stays rejected — a lifting session is defined only by its lifts.
//   · valid bodies resolve to a typed plan (schemes resolved, prescriptions parsed).

import { describe, expect, test } from 'vitest';
import {
  MAX_ITEMS,
  validateFreeWorkout,
  type FreeWorkoutRawBody,
} from '@/lib/athlete/free-workout-validate';

// ── Prescription fixtures (REAL shapes the domain parser accepts) ─────────────
const strengthSets = {
  scheme: 'sets',
  sets: [
    { measure: { kind: 'reps', value: 10 }, target: { kind: 'percent_rm', value: 70 } },
    { measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 75 } },
  ],
};

const amrapMovement = (reps: number) => ({
  scheme: 'amrap',
  total_s: 720,
  sets: [{ measure: { kind: 'reps', value: reps } }],
});

const emomMovement = (reps: number) => ({
  scheme: 'emom',
  rounds: 10,
  work_s: 60,
  sets: [{ measure: { kind: 'reps', value: reps } }],
});

const steadyRun = {
  scheme: 'steady',
  total_s: 1800,
  target: { kind: 'hr_zone', value: 2 },
};

// A bare box CLOCK: the metcon format + its structure, no movements named. This
// is what iOS folds and sends when the athlete hits Empezar without declaring.
const amrapClock = { scheme: 'amrap', modality: 'functional', total_s: 720 };
const emomClock = {
  scheme: 'emom',
  modality: 'functional',
  rounds: 10,
  work_s: 45,
  rest_s: 15,
};

function strengthBody(items: unknown[]): FreeWorkoutRawBody {
  return { modality: 'strength', items: items.map((p, i) => ({ exercise_id: i + 1, prescription: p })) };
}
function functionalBody(items: unknown[]): FreeWorkoutRawBody {
  return { modality: 'functional', items: items.map((p, i) => ({ exercise_id: i + 1, prescription: p })) };
}

describe('validateFreeWorkout — rejections', () => {
  test('measured modality requires a top-level prescription', () => {
    const res = validateFreeWorkout({ modality: 'run' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('prescription_required');
  });

  test('measured modality rejects a non-measured scheme', () => {
    const res = validateFreeWorkout({ modality: 'run', prescription: strengthSets });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('invalid_format');
  });

  test('strength item with a metcon scheme is rejected', () => {
    const res = validateFreeWorkout(strengthBody([amrapMovement(10)]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('invalid_format');
  });

  test('strength set without a measure is rejected', () => {
    const noMeasure = { scheme: 'sets', sets: [{ target: { kind: 'percent_rm', value: 70 } }] };
    const res = validateFreeWorkout(strengthBody([noMeasure]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('set_without_measure');
  });

  test('strength item without sets is rejected', () => {
    const res = validateFreeWorkout(strengthBody([{ scheme: 'sets' }]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('missing_sets');
  });

  test('functional items with MIXED schemes are rejected', () => {
    const res = validateFreeWorkout(functionalBody([amrapMovement(10), emomMovement(8)]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('mixed_schemes');
  });

  test('functional item with a non-metcon scheme is rejected', () => {
    const res = validateFreeWorkout(functionalBody([strengthSets]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('invalid_format');
  });

  test('strength with no items is rejected — lifts are the whole session', () => {
    const res = validateFreeWorkout({ modality: 'strength', items: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('items_required');
  });

  test('strength with no items is rejected even carrying a prescription (no clock shape)', () => {
    const res = validateFreeWorkout({ modality: 'strength', items: [], prescription: amrapClock });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('items_required');
  });

  test('functional clock without a prescription is rejected — the shape is the session', () => {
    const res = validateFreeWorkout({ modality: 'functional', items: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('prescription_required');
  });

  test('functional clock on a non-metcon scheme is rejected', () => {
    const res = validateFreeWorkout({ modality: 'functional', prescription: steadyRun });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('invalid_format');
  });

  test('functional clock carrying sets is rejected — undeclared means undeclared', () => {
    const withSets = { ...amrapClock, sets: [{ measure: { kind: 'reps', value: 10 } }] };
    const res = validateFreeWorkout({ modality: 'functional', prescription: withSets });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('unexpected_sets');
  });

  test(`more than ${MAX_ITEMS} items is rejected`, () => {
    const items = Array.from({ length: MAX_ITEMS + 1 }, () => strengthSets);
    const res = validateFreeWorkout(strengthBody(items));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('too_many_items');
  });
});

describe('validateFreeWorkout — acceptances', () => {
  test('measured run with a steady prescription resolves to a measured plan', () => {
    const res = validateFreeWorkout({ modality: 'run', prescription: steadyRun });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plan.kind).toBe('measured');
      expect(res.plan.scheme).toBe('steady');
    }
  });

  test('strength with 2 set-table items resolves to an items plan (scheme sets)', () => {
    const res = validateFreeWorkout(strengthBody([strengthSets, strengthSets]));
    expect(res.ok).toBe(true);
    if (res.ok && res.plan.kind === 'items') {
      expect(res.plan.scheme).toBe('sets');
      expect(res.plan.items).toHaveLength(2);
    }
  });

  test('functional AMRAP with 3 movements resolves to an items plan (shared scheme)', () => {
    const res = validateFreeWorkout(
      functionalBody([amrapMovement(15), amrapMovement(12), amrapMovement(9)]),
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.plan.kind === 'items') {
      expect(res.plan.scheme).toBe('amrap');
      expect(res.plan.items).toHaveLength(3);
    }
  });

  // The box CLOCK. "Usé la app para cronometrarme" is a session, and the format
  // it ran is the whole prescription — nothing about it is missing or invented.
  test('functional AMRAP with NO movements resolves to a clock plan', () => {
    const res = validateFreeWorkout({ modality: 'functional', prescription: amrapClock });
    expect(res.ok).toBe(true);
    if (res.ok && res.plan.kind === 'clock') {
      expect(res.plan.scheme).toBe('amrap');
      expect(res.plan.modality).toBe('functional');
      expect(res.plan.prescription.total_s).toBe(720);
    } else {
      expect.unreachable('an undeclared functional AMRAP must resolve to a clock plan');
    }
  });

  test('functional EMOM clock keeps its cycle (work + change) and round count', () => {
    const res = validateFreeWorkout({ modality: 'functional', items: [], prescription: emomClock });
    expect(res.ok).toBe(true);
    if (res.ok && res.plan.kind === 'clock') {
      expect(res.plan.scheme).toBe('emom');
      expect(res.plan.prescription.rounds).toBe(10);
      expect(res.plan.prescription.work_s).toBe(45);
      expect(res.plan.prescription.rest_s).toBe(15);
    } else {
      expect.unreachable('an undeclared functional EMOM must resolve to a clock plan');
    }
  });

  test('every metcon scheme is startable as a bare clock', () => {
    for (const scheme of ['for_time', 'amrap', 'emom', 'rounds'] as const) {
      const res = validateFreeWorkout({
        modality: 'functional',
        prescription: { scheme, modality: 'functional', rounds: 5 },
      });
      expect(res.ok, `scheme '${scheme}' must be startable as a clock`).toBe(true);
      if (res.ok) expect(res.plan.scheme).toBe(scheme);
    }
  });
});
