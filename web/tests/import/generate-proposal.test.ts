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
      expect(d.sessions, `dow ${dow}`).toEqual([]);
      expect(d.flags).toEqual([]);
      expect(d.state).toBe('rest');
    }
  });

  test('training days carry a fully-typed, catalog-resolved session', () => {
    const proposal = weekDaysToProposal({ days: sampleWeek(), sheetLabel: 'IA' });
    const week = proposal.weeks[0]!;

    const monday = week.days.find((d) => d.day_of_week === 1)!;
    expect(monday.sessions.length).toBeGreaterThan(0);
    expect(monday.dow).toBe('Lunes');
    expect(monday.sessions[0]!.slot).toBe('am');
    expect(monday.sessions[0]!.focus).toBe('Fuerza tren inferior');

    // Every item resolved by construction → no unresolved flag, day is "detected".
    const items = monday.sessions.flatMap((s) => s.blocks.flatMap((b) => b.items));
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
      for (const session of day.sessions) {
        const parsed = editorSessionInputSchema.safeParse(session);
        expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error?.issues)).toBe(true);
      }
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

// The gate that let the garbage through: the grid only ever asked "does the
// exercise resolve?". These items all resolve perfectly and prescribe nothing.
describe('weekDaysToProposal — prescription completeness gate', () => {
  const dayWith = (items: unknown[], group = 'principal'): WeekDay[] =>
    [
      {
        day_of_week: 1,
        sessions: [
          {
            kind: 'workout',
            blocks: [{ uid: 'b1', format: 'sets', title: 'Bloque', group, items }],
          },
        ],
      },
    ] as unknown as WeekDay[];

  test('a resolved exercise with no dose is REVIEW, never detected', () => {
    // This is "Batería 1RM" as it reached Alex: three real exercise ids, no sets,
    // no reps, no %RM, no rest.
    const proposal = weekDaysToProposal({
      days: dayWith([
        {
          uid: 'i1',
          exercise_id: 42,
          exercise_name: 'Back Squat',
          prescription_json: { scheme: 'sets', modality: 'strength' },
        },
      ]),
      sheetLabel: 'IA',
    });
    const day = proposal.weeks[0]!.days.find((d) => d.day_of_week === 1)!;
    expect(day.flags[0]!.confidence).toBe('review');
    expect(day.flags[0]!.review_reasons.length).toBeGreaterThan(0);
    expect(day.state).toBe('review');
    // It resolves — so the OLD unresolved-only check would have called it clean.
    expect(day.flags[0]!.unresolved_exercise).toBe(false);
    expect(proposal.summary.review).toBe(1);
    expect(proposal.summary.detected).toBe(0);
  });

  test('a fully prescribed item is detected', () => {
    const proposal = weekDaysToProposal({
      days: dayWith([
        {
          uid: 'i1',
          exercise_id: 42,
          exercise_name: 'Back Squat',
          prescription_json: {
            scheme: 'sets',
            modality: 'strength',
            sets: Array.from({ length: 5 }, () => ({
              measure: { kind: 'reps', value: 5 },
              target: { kind: 'percent_rm', value: 80 },
              rest_s: 180,
            })),
          },
        },
      ]),
      sheetLabel: 'IA',
    });
    const day = proposal.weeks[0]!.days.find((d) => d.day_of_week === 1)!;
    expect(day.flags[0]!.confidence).toBe('detected');
    expect(day.state).toBe('detected');
    expect(proposal.summary.detected).toBe(1);
    expect(proposal.summary.review).toBe(0);
  });

  test('the block role relaxes the target rule for a warm-up', () => {
    const jog = [
      {
        uid: 'i1',
        exercise_id: 88,
        exercise_name: 'Run',
        prescription_json: {
          scheme: 'warmup',
          modality: 'run',
          sets: [{ measure: { kind: 'duration', seconds: 600 } }],
        },
      },
    ];
    const warm = weekDaysToProposal({ days: dayWith(jog, 'calentamiento'), sheetLabel: 'IA' });
    expect(warm.weeks[0]!.days[0]!.flags[0]!.confidence).toBe('detected');

    const main = weekDaysToProposal({ days: dayWith(jog, 'principal'), sheetLabel: 'IA' });
    expect(main.weeks[0]!.days[0]!.flags[0]!.confidence).toBe('review');
  });
});

// Who wrote the line decides which bar it clears. Conflating the two is a defect
// in BOTH directions: it either lets our own thin output through, or lectures the
// coach about his own plan.
describe('weekDaysToProposal — the bar depends on the source', () => {
  const runNoTarget = {
    uid: 'i1',
    exercise_id: 3479,
    exercise_name: 'Run',
    prescription_json: {
      scheme: 'hyrox_sim',
      modality: 'run',
      sets: [{ measure: { kind: 'distance', meters: 1000 } }],
    },
  };

  const dayFrom = (session: Record<string, unknown>): WeekDay[] =>
    [{ day_of_week: 1, sessions: [session] }] as unknown as WeekDay[];

  const block = { uid: 'b1', format: 'hyrox_sim', title: 'Sim', group: 'principal', items: [runNoTarget] };

  test("the coach's own template passes: a sim run has no pace on purpose", () => {
    // `template_id` present = materialised from HIS library.
    const proposal = weekDaysToProposal({
      days: dayFrom({ kind: 'workout', template_id: 500, blocks: [block] }),
      sheetLabel: 'IA',
    });
    const flag = proposal.weeks[0]!.days[0]!.flags[0]!;
    expect(flag.confidence).toBe('detected');
    expect(flag.review_reasons).toEqual([]);
  });

  test('the same line composed by us is flagged: we had no business omitting the target', () => {
    // No `template_id` = the model authored it.
    const proposal = weekDaysToProposal({
      days: dayFrom({ kind: 'workout', blocks: [block] }),
      sheetLabel: 'IA',
    });
    const flag = proposal.weeks[0]!.days[0]!.flags[0]!;
    expect(flag.confidence).toBe('review');
    expect(flag.review_reasons.join(' ')).toMatch(/ritmo|zona|RPE/i);
  });

  test("a blocking gap is flagged even in the coach's own template", () => {
    const noDose = {
      uid: 'b2',
      format: 'sets',
      title: 'Fuerza',
      group: 'principal',
      items: [
        { uid: 'i9', exercise_id: 42, exercise_name: 'Back Squat', prescription_json: { scheme: 'sets', modality: 'strength' } },
      ],
    };
    const proposal = weekDaysToProposal({
      days: dayFrom({ kind: 'workout', template_id: 500, blocks: [noDose] }),
      sheetLabel: 'IA',
    });
    // Nobody can execute an unspecified amount of work — not even the author.
    expect(proposal.weeks[0]!.days[0]!.flags[0]!.confidence).toBe('review');
  });
});

// Who wrote the line decides which bar it clears. Conflating them is a defect in
// BOTH directions: it either lets our own thin output pass, or lectures the coach
// about his own plan.
describe('weekDaysToProposal — the bar depends on the source', () => {
  const runNoTarget = {
    uid: 'i1',
    exercise_id: 3479,
    exercise_name: 'Run',
    prescription_json: {
      scheme: 'hyrox_sim',
      modality: 'run',
      sets: [{ measure: { kind: 'distance', meters: 1000 } }],
    },
  };
  const block = { uid: 'b1', format: 'hyrox_sim', title: 'Sim', group: 'principal', items: [runNoTarget] };
  const dayFrom = (session: Record<string, unknown>): WeekDay[] =>
    [{ day_of_week: 1, sessions: [session] }] as unknown as WeekDay[];

  test("the coach's own template passes: a sim run has no pace on purpose", () => {
    const proposal = weekDaysToProposal({
      days: dayFrom({ kind: 'workout', template_id: 500, blocks: [block] }),
      sheetLabel: 'IA',
    });
    const flag = proposal.weeks[0]!.days[0]!.flags[0]!;
    expect(flag.confidence).toBe('detected');
    expect(flag.review_reasons).toEqual([]);
  });

  test('the same line composed by us is flagged — we had no business omitting the target', () => {
    const proposal = weekDaysToProposal({
      days: dayFrom({ kind: 'workout', blocks: [block] }),
      sheetLabel: 'IA',
    });
    const flag = proposal.weeks[0]!.days[0]!.flags[0]!;
    expect(flag.confidence).toBe('review');
    expect(flag.review_reasons.join(' ')).toMatch(/ritmo|zona|RPE/i);
  });

  test("a blocking gap is flagged even inside the coach's own template", () => {
    const noDose = {
      uid: 'b2',
      format: 'sets',
      title: 'Fuerza',
      group: 'principal',
      items: [
        {
          uid: 'i9',
          exercise_id: 42,
          exercise_name: 'Back Squat',
          prescription_json: { scheme: 'sets', modality: 'strength' },
        },
      ],
    };
    const proposal = weekDaysToProposal({
      days: dayFrom({ kind: 'workout', template_id: 500, blocks: [noDose] }),
      sheetLabel: 'IA',
    });
    // Nobody can execute an unspecified amount of work — not even the author.
    expect(proposal.weeks[0]!.days[0]!.flags[0]!.confidence).toBe('review');
  });
});

// A block is the coach's method too — it just leaves a different mark.
describe('weekDaysToProposal — a block-sourced part is the coach\'s, not ours', () => {
  const squat = {
    uid: 'i1',
    exercise_id: 42,
    exercise_name: 'Front Squat',
    // His real block: 6 typed sets, no %RM stated — his call, his athlete.
    prescription_json: {
      scheme: 'sets',
      modality: 'strength',
      sets: [7, 6, 6, 6, 5, 5].map((reps) => ({ measure: { kind: 'reps', value: reps } })),
    },
  };

  test('source_block_id marks it as HIS — the executable bar applies', () => {
    const days = [
      {
        day_of_week: 1,
        sessions: [
          {
            kind: 'workout',
            template_id: null,
            blocks: [
              {
                uid: 'b1',
                format: 'strength_block',
                title: 'Front squat 6 series 7-6-6-6-5-5',
                group: 'principal',
                source_block_id: 4211,
                items: [squat],
              },
            ],
          },
        ],
      },
    ] as unknown as WeekDay[];
    const proposal = weekDaysToProposal({ days, sheetLabel: 'IA' });
    const flag = proposal.weeks[0]!.days[0]!.flags[0]!;
    // Was 'review': block sessions carry no template_id, so his own method got
    // measured against the bar meant for what WE author.
    expect(flag.confidence).toBe('detected');
    expect(proposal.weeks[0]!.days[0]!.state).toBe('detected');
  });

  test('the same item with no source mark is ours, and must state its load', () => {
    const days = [
      {
        day_of_week: 1,
        sessions: [
          {
            kind: 'workout',
            blocks: [
              { uid: 'b1', format: 'sets', title: 'Fuerza', group: 'principal', items: [squat] },
            ],
          },
        ],
      },
    ] as unknown as WeekDay[];
    const proposal = weekDaysToProposal({ days, sheetLabel: 'IA' });
    expect(proposal.weeks[0]!.days[0]!.flags[0]!.confidence).toBe('review');
  });
});
