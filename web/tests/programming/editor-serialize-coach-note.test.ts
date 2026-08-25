/**
 * serializeDay (lib/dashboard/v2/editor-serialize.ts) — coach_note round-trip.
 *
 * Closes a gap the #28 photo importer exposed: a card's verbatim text that
 * doesn't fit the exercise model (a redistributed orphan dose's own phrasing,
 * a whole card written in prose — see build-proposal.ts's `redistributeOrphanDose`
 * / `cardLostProse`) now rides `EditorBlock.coach_note`, the SAME field a
 * library block already uses for a verbatim prescription (`WeekDayPart.coach_note`,
 * shared/schema/program-templates.ts). This only tests that the field actually
 * SURVIVES the day editor's save round-trip — same "input wins when sent, else
 * keep the original" contract as `group`/`methodology_group_id`/`source_block_id`.
 */
import { describe, expect, test } from 'vitest';
import { serializeDay, serializeSessionSegments } from '@/lib/dashboard/v2/editor-serialize';
import { sessionsToWire } from '@/components/v2/editor/day-editor-io';
import { uniqueBlockNotes } from '@fahybrid/shared/schema/program-templates';
import type { EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type { EditorSessionInput, WeekDay, WeekDayPart } from '@fahybrid/shared/schema/program-templates';

const PRESCRIPTION: Prescription = {
  scheme: 'sets',
  modality: 'strength',
  sets: [{ measure: { kind: 'reps', value: 8 } }],
};

function originalDay(block: Partial<WeekDayPart> & { uid: string }): WeekDay {
  return {
    day_of_week: 1,
    sessions: [
      {
        kind: 'workout',
        blocks: [
          {
            format: 'sets',
            title: 'Bloque',
            items: [],
            ...block,
          },
        ],
      },
    ],
  };
}

function sessionInput(block: { uid: string; coach_note?: string }): EditorSessionInput[] {
  return [
    {
      uid: 'ses-1',
      slot: 'am',
      blocks: [
        {
          uid: block.uid,
          title: 'Bloque',
          items: [],
          ...(block.coach_note !== undefined ? { coach_note: block.coach_note } : {}),
        },
      ],
    },
  ];
}

describe('serializeDay — EditorBlock.coach_note', () => {
  test('a NEW block (no original) with coach_note set persists it', () => {
    const original: WeekDay = { day_of_week: 1, sessions: [{ kind: 'workout', blocks: [] }] };
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1', coach_note: 'Hora y media de rodar libre soltando piernas, tranquilo.' }),
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.coach_note).toBe(
      'Hora y media de rodar libre soltando piernas, tranquilo.',
    );
  });

  test('input coach_note OVERWRITES a different original one (input wins when sent)', () => {
    const original = originalDay({ uid: 'blk-1', coach_note: 'nota vieja' });
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1', coach_note: 'nota nueva' }),
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.coach_note).toBe('nota nueva');
  });

  test('a save that OMITS coach_note (importador, caller viejo) PRESERVES the original — never silently wiped', () => {
    const original = originalDay({ uid: 'blk-1', coach_note: 'la prescripción verbatim de la biblioteca' });
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1' }), // no coach_note key at all
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.coach_note).toBe('la prescripción verbatim de la biblioteca');
  });

  test('enviar vacío BORRA la descripción: el editor de día manda el valor actual', () => {
    const original = originalDay({ uid: 'blk-1', coach_note: 'la prescripción verbatim de la biblioteca' });
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1', coach_note: '' }),
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.coach_note).toBeUndefined();
  });

  test('neither input nor original carries one — the field stays absent, not an empty string', () => {
    const original = originalDay({ uid: 'blk-1' });
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1' }),
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.coach_note).toBeUndefined();
  });
});

describe('uniqueBlockNotes', () => {
  test('vacío se queda vacío y no inventa texto', () => {
    expect(uniqueBlockNotes([null, undefined, '', '   '])).toBeNull();
  });

  test('no copia la primera sobre un hueco: si solo hay una, esa', () => {
    expect(uniqueBlockNotes([null, 'Cadera alta.', ''])).toBe('Cadera alta.');
  });

  test('varias distintas se juntan; las iguales no se repiten', () => {
    expect(uniqueBlockNotes(['A', 'A', 'B'])).toBe('A\nB');
  });
});

describe('serializeSessionSegments — block_coach_note por bloque', () => {
  test('el bloque 2 lleva su descripción; el 1 no', () => {
    const segs = serializeSessionSegments([
      {
        title: 'Fuerza',
        format: 'strength_block',
        items: [{ exercise_id: 1, exercise_name: 'Back squat', prescription: PRESCRIPTION }],
      },
      {
        title: 'Series',
        format: 'intervals',
        coach_note: 'Cadera alta. No dejes caer el tronco.',
        items: [
          {
            exercise_id: 2,
            exercise_name: 'Run',
            prescription: PRESCRIPTION,
            notes: 'Corta si se abre la zancada.',
          },
        ],
      },
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.block_coach_note).toBeNull();
    expect(segs[0]!.notes).toBeNull();
    expect(segs[1]!.block_coach_note).toBe('Cadera alta. No dejes caer el tronco.');
    expect(segs[1]!.notes).toBe('Corta si se abre la zancada.');
  });
});

describe('sessionsToWire — descripción del bloque 2', () => {
  test('el wire manda coach_note solo con lo escrito en ese bloque', () => {
    const sessions: EditorSession[] = [
      {
        uid: 'ses-1',
        slot: 'am',
        notes: 'Calienta 10 min antes.',
        blocks: [
          {
            uid: 'blk-1',
            title: 'Fuerza',
            format: 'sets',
            items: [
              {
                uid: 'it-1',
                exercise_id: 1,
                exercise_name: 'Back squat',
                prescription: PRESCRIPTION,
              },
            ],
          },
          {
            uid: 'blk-2',
            title: 'Series',
            format: 'intervals',
            coach_note: 'Cadera alta. No dejes caer el tronco.',
            items: [
              {
                uid: 'it-2',
                exercise_id: 2,
                exercise_name: 'Run',
                prescription: PRESCRIPTION,
                notes: 'Corta si se abre la zancada.',
              },
            ],
          },
        ],
      },
    ];
    const [wire] = sessionsToWire(sessions);
    expect(wire!.notes).toBe('Calienta 10 min antes.');
    expect(wire!.blocks[0]!.coach_note).toBe('');
    expect(wire!.blocks[0]!.items[0]!.notes).toBeUndefined();
    expect(wire!.blocks[1]!.coach_note).toBe('Cadera alta. No dejes caer el tronco.');
    expect(wire!.blocks[1]!.items[0]!.notes).toBe('Corta si se abre la zancada.');
  });
});
