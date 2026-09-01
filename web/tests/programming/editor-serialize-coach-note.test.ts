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
import { serializeDay } from '@/lib/dashboard/v2/editor-serialize';
import type { EditorSessionInput, WeekDay, WeekDayPart } from '@fahybrid/shared/schema/program-templates';

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

  test('a save that OMITS coach_note (no UI for it yet) PRESERVES the original — never silently wiped', () => {
    const original = originalDay({ uid: 'blk-1', coach_note: 'la prescripción verbatim de la biblioteca' });
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1' }), // no coach_note key at all — today's real UI shape
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.coach_note).toBe('la prescripción verbatim de la biblioteca');
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
