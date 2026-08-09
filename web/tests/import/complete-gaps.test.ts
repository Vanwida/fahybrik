// Completar huecos — un clic desbloquea el confirmar.

import { describe, expect, test } from 'vitest';
import type { EditorItem, EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { ReviewWeek } from '@/lib/dashboard/v2/import-review';
import { totalIncomplete, totalUnresolved } from '@/lib/dashboard/v2/import-review';
import {
  applyGapPlan,
  cleanExerciseName,
  completeWeeksDoses,
  hasCompletableGaps,
  planGapResolution,
  seedExecutableItem,
  AUTO_MERGE_SCORE,
} from '@/lib/dashboard/v2/import-complete-gaps';
import { collectMissingExercises } from '@/lib/dashboard/v2/import-missing';
import type { ScoredCandidate } from '@/lib/dashboard/exercises/near-match';
import type { Modality } from '@fahybrid/shared/domain/prescription';

let seq = 0;
const uid = (p: string) => `g-${p}-${++seq}`;

function item(opts: {
  name: string;
  exerciseId?: number | null;
  modality?: Modality;
  sets?: Array<{ reps?: number }>;
  emptySets?: boolean;
}) {
  const prescription =
    opts.emptySets === true
      ? { scheme: 'sets' as const, modality: opts.modality ?? 'strength', sets: [] }
      : opts.sets
        ? {
            scheme: 'sets' as const,
            modality: opts.modality ?? 'strength',
            sets: opts.sets.map((s) =>
              s.reps != null
                ? { measure: { kind: 'reps' as const, value: s.reps } }
                : {},
            ),
          }
        : {
            scheme: 'sets' as const,
            modality: opts.modality ?? 'strength',
            sets: [{ measure: { kind: 'reps' as const, value: 10 } }],
          };
  return {
    uid: uid('it'),
    exercise_id: opts.exerciseId === undefined ? null : opts.exerciseId,
    exercise_name: opts.name,
    prescription,
  };
}

// `EditorItem[]`, not `ReturnType<typeof item>[]`: some callers pass a real
// item back from `seedExecutableItem` (a full EditorItem, whose
// `prescription.scheme` is the broad PrescriptionScheme union), not only the
// `scheme:'sets'`-literal fixtures `item()` builds above. The narrower
// fixtures still satisfy this (a literal 'sets' fits the broader union) —
// pre-existing gap surfaced by an unrelated schema change, not this file's
// own concern.
function session(title: string, items: EditorItem[]): EditorSession {
  return {
    uid: uid('ses'),
    slot: 'am',
    blocks: [{ uid: uid('blk'), title, format: 'sets', items }],
  };
}

function week(sessions: EditorSession[]): ReviewWeek {
  return {
    week: 1,
    sheet: 'foto',
    fell_back: false,
    target_week_id: '10',
    included: true,
    days: [
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        sessions,
        flags: [],
        proposed: [],
        truncations: [],
        included: true,
      },
    ],
  };
}

describe('planGapResolution', () => {
  test('basura se descarta; match fuerte se fusiona; el resto se crea', () => {
    const weeks = [
      week([
        session('FUERZA PARTE ALTA', [
          item({ name: 'FUERZA PARTE ALTA' }),
          item({ name: 'A)' }),
          item({ name: 'Push Jerk' }),
          item({ name: 'Cat Cow' }),
        ]),
      ]),
    ];
    const missing = collectMissingExercises(weeks);
    const matches = new Map<string, ScoredCandidate[]>([
      [
        'Push Jerk',
        [
          {
            id: 99,
            name: 'Push Jerk',
            modality: 'strength',
            category: 'strength',
            score: AUTO_MERGE_SCORE,
          },
        ],
      ],
    ]);
    const plan = planGapResolution(missing, matches);
    expect(plan.discardKeys).toEqual(expect.arrayContaining(['fuerza parte alta', 'a)']));
    expect(plan.merge).toEqual([
      { key: 'push jerk', exercise_id: 99, exercise_name: 'Push Jerk' },
    ]);
    expect(plan.create.map((c) => c.name)).toEqual(['Cat Cow']);
    expect(plan.create[0]!.modality).toBe('strength'); // sin evidencia de tarjeta fuerza-title no da mobility
  });

  test('cleanExerciseName quita el corte de la foto', () => {
    expect(cleanExerciseName('Extension de cadera en cuadrúp...')).toBe(
      'Extension de cadera en cuadrúp',
    );
  });
});

describe('seedExecutableItem + completeWeeksDoses', () => {
  test('una línea resuelta sin series gana 3×8-12 y deja de ser incomplete', () => {
    const it = item({ name: 'Push Jerk', exerciseId: 7, emptySets: true });
    const { item: next, proposed } = seedExecutableItem(it);
    expect(next.prescription.sets).toHaveLength(3);
    expect(proposed.length).toBeGreaterThan(0);
    expect(totalIncomplete([week([session('F', [next])])])).toBe(0);
  });

  test('cardio sin dosis gana 30 min de steady', () => {
    const it = item({ name: 'Bici Libre', exerciseId: 3, modality: 'bike', emptySets: true });
    // force modality on prescription (item helper put empty sets)
    it.prescription.modality = 'bike';
    const { item: next } = seedExecutableItem(it);
    expect(next.prescription.total_s).toBe(30 * 60);
  });

  test('applyGapPlan: crear + descartar + dosis → unresolved e incomplete a 0', () => {
    const weeks = [
      week([
        session('FUERZA PARTE ALTA', [
          item({ name: 'FUERZA PARTE ALTA' }),
          item({ name: 'Push Jerk', emptySets: true }),
          item({ name: 'A)' }),
        ]),
      ]),
    ];
    expect(hasCompletableGaps(weeks)).toBe(true);
    expect(totalUnresolved(weeks)).toBe(3);

    const missing = collectMissingExercises(weeks);
    const plan = planGapResolution(missing, new Map());
    const next = applyGapPlan(weeks, plan, [{ id: 77, name: 'Push Jerk' }]);

    expect(totalUnresolved(next)).toBe(0);
    expect(totalIncomplete(next)).toBe(0);
    expect(hasCompletableGaps(next)).toBe(false);
    const items = next[0]!.days[0]!.sessions.flatMap((s) => s.blocks.flatMap((b) => b.items));
    expect(items).toHaveLength(1);
    expect(items[0]!.exercise_id).toBe(77);
    expect((items[0]!.prescription.sets ?? []).length).toBeGreaterThan(0);
  });

  test('completeWeeksDoses solo toca días incluidos', () => {
    const w = week([session('F', [item({ name: 'X', exerciseId: 1, emptySets: true })])]);
    w.days[0]!.included = false;
    const next = completeWeeksDoses([w]);
    expect(next[0]!.days[0]!.sessions[0]!.blocks[0]!.items[0]!.prescription.sets).toEqual([]);
  });
});
