import { describe, expect, it } from 'vitest';
import {
  editorBlockInputSchema,
  structureGroupSchema,
  weekDayPartSchema,
  type EditorSessionInput,
  type WeekDay,
} from '@fahybrid/shared/schema/program-templates';
import { serializeDay } from '@/lib/dashboard/v2/editor-serialize';

// The structure group (calentamiento/principal/vuelta) is the coach-organized axis
// of a session. It used to be INFERRED from the block title/format on every load,
// so a cool-down block that didn't "sound" like a cool-down reverted to Principal.
// These tests pin the durability fix: `group` is an accepted, additive field on
// both the wire input and the stored WeekDayPart, and it round-trips through the
// day serializer (what the PUT /program-weeks/[id]/day route persists).

// A minimal editor block (no items) — enough to exercise group persistence without
// dragging in a full prescription; serializePart accepts an empty items array.
function block(uid: string, title: string, group: 'calentamiento' | 'principal' | 'vuelta') {
  return { uid, title, format: 'strength_block' as const, group, items: [] };
}

function session(blocks: ReturnType<typeof block>[]): EditorSessionInput {
  return { uid: 'sess-0', slot: 'am', blocks };
}

describe('structure group — schema acceptance (additive + backward compatible)', () => {
  it('the enum only admits the three structural groups', () => {
    expect(structureGroupSchema.safeParse('calentamiento').success).toBe(true);
    expect(structureGroupSchema.safeParse('principal').success).toBe(true);
    expect(structureGroupSchema.safeParse('vuelta').success).toBe(true);
    expect(structureGroupSchema.safeParse('warmup').success).toBe(false);
  });

  it('the wire block schema KEEPS group (not stripped) and stays optional', () => {
    const withGroup = editorBlockInputSchema.parse({
      uid: 'b1',
      title: 'Estiramientos',
      group: 'vuelta',
      items: [],
    });
    expect(withGroup.group).toBe('vuelta');

    // Legacy / non-day-editor callers omit it — still valid.
    const withoutGroup = editorBlockInputSchema.parse({ uid: 'b2', title: 'Fuerza', items: [] });
    expect(withoutGroup.group).toBeUndefined();
  });

  it('the STORED part schema keeps group and remains optional for legacy parts', () => {
    const stored = weekDayPartSchema.parse({
      uid: 'p1',
      format: 'strength_block',
      title: 'Movilidad',
      group: 'calentamiento',
      items: [],
    });
    expect(stored.group).toBe('calentamiento');

    const legacy = weekDayPartSchema.parse({
      uid: 'p2',
      format: 'strength_block',
      title: 'Series',
      items: [],
    });
    expect(legacy.group).toBeUndefined();
  });
});

describe('serializeDay — persists the coach-chosen group', () => {
  const emptyOriginal: WeekDay = { day_of_week: 1, sessions: [] };

  it('round-trips each block group into slots_json (durable, no re-inference)', () => {
    const day = serializeDay({
      day_of_week: 1,
      sessions: [
        session([
          block('b-warm', 'Bloque genérico', 'calentamiento'),
          block('b-main', 'Bloque genérico', 'principal'),
          // A cool-down whose TITLE would infer to Principal — the whole point:
          // the stored group must win over the heuristic on the next load.
          block('b-cool', 'Bloque genérico', 'vuelta'),
        ]),
      ],
      original: emptyOriginal,
    });

    const blocks = day.sessions[0]!.blocks!;
    expect(blocks.map((b) => b.group)).toEqual(['calentamiento', 'principal', 'vuelta']);
  });

  it('preserves the ORIGINAL part group when the input omits it (no clobber)', () => {
    const original: WeekDay = {
      day_of_week: 1,
      sessions: [
        {
          kind: 'workout',
          blocks: [
            { uid: 'b-cool', format: 'strength_block', title: 'X', group: 'vuelta', items: [] },
          ],
        },
      ],
    };

    // Input block matched by uid, but WITHOUT a group field on the wire.
    const day = serializeDay({
      day_of_week: 1,
      sessions: [{ uid: 'sess-0', slot: 'am', blocks: [{ uid: 'b-cool', title: 'X', items: [] }] }],
      original,
    });

    expect(day.sessions[0]!.blocks![0]!.group).toBe('vuelta');
  });
});
