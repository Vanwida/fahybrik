/**
 * serializeDay (lib/dashboard/v2/editor-serialize.ts) — «Opcional» (fase 2,
 * ago-2026, docs/DECISIONS.md).
 *
 * A diferencia de coach_note (sin UI, "preserva si se omite"), el día editor
 * SÍ tiene UI para esto desde el día uno: el cliente manda siempre su valor
 * actual, incluida la vuelta a false — mismo contrato que `focus`/`title`.
 * Un caller que aún no conoce el campo (copiar día, tests viejos) lo omite y
 * el bloque queda obligatorio, que es el comportamiento de siempre.
 */
import { describe, expect, test } from 'vitest';
import { serializeDay } from '@/lib/dashboard/v2/editor-serialize';
import type { EditorSessionInput, WeekDay, WeekDayPart } from '@fahybrid/shared/schema/program-templates';

function originalDay(block: Partial<WeekDayPart> & { uid: string }): WeekDay {
  return {
    day_of_week: 1,
    sessions: [
      { kind: 'workout', blocks: [{ format: 'sets', title: 'Bloque', items: [], ...block }] },
    ],
  };
}

function sessionInput(block: { uid: string; optional?: boolean }): EditorSessionInput[] {
  return [
    {
      uid: 'ses-1',
      slot: 'am',
      blocks: [
        {
          uid: block.uid,
          title: 'Bloque',
          items: [],
          ...(block.optional !== undefined ? { optional: block.optional } : {}),
        },
      ],
    },
  ];
}

describe('serializeDay — EditorBlock.optional', () => {
  test('a NEW block marked optional persists true', () => {
    const original: WeekDay = { day_of_week: 1, sessions: [{ kind: 'workout', blocks: [] }] };
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1', optional: true }),
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.optional).toBe(true);
  });

  test('input false OVERWRITES an original true — untoggling actually persists', () => {
    const original = originalDay({ uid: 'blk-1', optional: true });
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1', optional: false }),
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.optional).toBe(false);
  });

  test('a caller that OMITS optional (copiar día, importador viejo) leaves the block required', () => {
    const original = originalDay({ uid: 'blk-1' });
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1' }), // no optional key at all
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.optional).toBe(false);
  });
});
