import { describe, expect, test } from 'vitest';
import {
  editorSessionInputSchema,
  weekDaySchema,
  type WeekDay,
} from '@fahybrid/shared/schema/program-templates';
import { weekDaysToProposal } from '@/lib/import/generate-proposal';
import { buildReviewModel, totalUnresolved, type MicroWeekRef } from '@/lib/dashboard/v2/import-review';

// A representative AI-composed week (shape `suggest-week` returns): training days
// carry blocks whose items reference REAL catalog exercise ids, plus a rest day.
function sampleWeek(): WeekDay[] {
  const workoutDay = (dow: number, focus: string, items: Array<{ id: number; name: string }>): WeekDay =>
    weekDaySchema.parse({
      day_of_week: dow,
      focus,
      sessions: [
        {
          kind: 'workout',
          template_id: 100 + dow,
          blocks: [
            {
              uid: `blk-${dow}`,
              format: 'strength_block',
              title: focus,
              methodology_group_id: 1,
              items: items.map((it, i) => ({
                uid: `it-${dow}-${i}`,
                exercise_id: it.id,
                exercise_name: it.name,
                params_json: { sets: 4, reps: 8, load_pct: 75 },
                notes: 'descanso 2\'',
              })),
            },
          ],
        },
      ],
    });

  return [
    workoutDay(1, 'Fuerza tren inferior', [
      { id: 42, name: 'Back Squat' },
      { id: 43, name: 'Romanian Deadlift' },
    ]),
    workoutDay(2, 'Series de carrera', [{ id: 88, name: 'Carrera 1000m' }]),
    // Domingo rest.
    weekDaySchema.parse({ day_of_week: 7, kind: 'rest', sessions: [] }),
  ];
}

describe('weekDaysToProposal — #48 generate → typed proposal', () => {
  test('emits all 7 weekdays in order, rest cells for empty days', () => {
    const proposal = weekDaysToProposal({ days: sampleWeek(), sheetLabel: 'Semana · HYROX' });
    expect(proposal.weeks).toHaveLength(1);
    const week = proposal.weeks[0]!;
    expect(week.sheet).toBe('Semana · HYROX');
    expect(week.days.map((d) => d.day_of_week)).toEqual([1, 2, 3, 4, 5, 6, 7]);

    // Days 3–7 had no content → honest rest cells (nothing to write).
    for (const dow of [3, 4, 5, 6, 7]) {
      const d = week.days.find((x) => x.day_of_week === dow)!;
      expect(d.session, `dow ${dow}`).toBeNull();
      expect(d.flags).toEqual([]);
      expect(d.state).toBe('rest');
    }
  });

  test('training days carry a fully-typed, catalog-resolved session', () => {
    const proposal = weekDaysToProposal({ days: sampleWeek(), sheetLabel: 'IA' });
    const week = proposal.weeks[0]!;

    const monday = week.days.find((d) => d.day_of_week === 1)!;
    expect(monday.session).not.toBeNull();
    expect(monday.dow).toBe('Lunes');
    expect(monday.session!.slot).toBe('am');
    expect(monday.session!.focus).toBe('Fuerza tren inferior');

    // Every item resolved by construction → no unresolved flag, day is "detected".
    const items = monday.session!.blocks.flatMap((b) => b.items);
    expect(items).toHaveLength(2);
    for (const it of items) {
      expect(Number(it.exercise_id)).toBeGreaterThan(0);
      expect(it.prescription).toBeTruthy();
    }
    expect(monday.flags.every((f) => !f.unresolved_exercise && f.confidence === 'detected')).toBe(true);
    expect(monday.state).toBe('detected');

    // Summary is honest.
    expect(proposal.summary).toEqual({ total_items: 3, detected: 3, review: 0, unresolved: 0 });
  });

  test('each generated session is confirm-shaped (validates against editorSessionInputSchema)', () => {
    const proposal = weekDaysToProposal({ days: sampleWeek(), sheetLabel: 'IA' });
    for (const day of proposal.weeks[0]!.days) {
      if (!day.session) continue;
      const parsed = editorSessionInputSchema.safeParse(day.session);
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  test('flows through the review model with zero unresolved (gate passes)', () => {
    const proposal = weekDaysToProposal({ days: sampleWeek(), sheetLabel: 'IA' });
    const microWeeks: MicroWeekRef[] = [
      { id: '900', index: 0, label: 'Base', session_count: 0 },
    ];
    const model = buildReviewModel(proposal, microWeeks);
    expect(model).toHaveLength(1);
    expect(model[0]!.target_week_id).toBe('900'); // default mapping to week ordinal 0
    expect(totalUnresolved(model)).toBe(0);
  });

  test('an item without a catalog id surfaces as unresolved (gate would block it)', () => {
    // Bypass the item schema (which requires an id) to simulate a free-text line.
    const days = [
      {
        day_of_week: 1,
        focus: 'Sesión con hueco',
        sessions: [
          {
            kind: 'workout',
            blocks: [
              {
                uid: 'blk-x',
                format: 'strength_block',
                title: 'Sesión con hueco',
                items: [
                  { uid: 'it-x', exercise_id: null, exercise_name: 'Movimiento libre', params_json: {} },
                ],
              },
            ],
          },
        ],
      },
    ] as unknown as WeekDay[];
    const proposal = weekDaysToProposal({ days, sheetLabel: 'IA' });
    const day = proposal.weeks[0]!.days.find((d) => d.day_of_week === 1)!;
    expect(day.flags.some((f) => f.unresolved_exercise)).toBe(true);
    expect(proposal.summary.unresolved).toBe(1);

    const model = buildReviewModel(proposal, [{ id: '900', index: 0, label: '', session_count: 0 }]);
    expect(totalUnresolved(model)).toBe(1);
  });
});
