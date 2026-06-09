import { describe, expect, test } from 'vitest';
import type {
  WeekDayPart,
  WeekSlots,
} from '@fahybrid/shared/schema/program-templates';
import {
  clonePartWithNewUids,
  cloneWeekSlotsWithNewUids,
  duplicateDay,
  duplicatePart,
} from '@/lib/dashboard/programming/day-composition';

function part(uid: string, title: string, itemUids: string[] = []): WeekDayPart {
  return {
    uid,
    format: 'strength_block',
    title,
    items: itemUids.map((iu) => ({
      uid: iu,
      exercise_id: 1,
      exercise_name: 'Front squat',
    })),
  };
}

function slotsWith(days: WeekSlots['days']): WeekSlots {
  return { days };
}

describe('clonePartWithNewUids', () => {
  test('genera uids nuevos para el bloque y cada ejercicio, conservando el contenido', () => {
    const original = part('p1', 'Fuerza', ['i1', 'i2']);
    const copy = clonePartWithNewUids(original);

    expect(copy.uid).not.toBe(original.uid);
    expect(copy.title).toBe('Fuerza');
    expect(copy.items).toHaveLength(2);
    expect(copy.items[0]!.uid).not.toBe('i1');
    expect(copy.items[1]!.uid).not.toBe('i2');
    expect(copy.items[0]!.exercise_name).toBe('Front squat');
    // El original no se muta.
    expect(original.items[0]!.uid).toBe('i1');
  });

  test('conserva procedencia y modificadores de biblioteca', () => {
    const original: WeekDayPart = {
      ...part('p1', 'AMRAP'),
      source_block_id: 42,
      block_modifiers: { intensity_pct: 80 },
    };
    const copy = clonePartWithNewUids(original);
    expect(copy.source_block_id).toBe(42);
    expect(copy.block_modifiers).toEqual({ intensity_pct: 80 });
  });
});

describe('duplicatePart', () => {
  const base = slotsWith([
    { day_of_week: 1, sessions: [{ kind: 'workout', blocks: [part('a', 'A'), part('b', 'B')] }] },
    { day_of_week: 2, sessions: [] },
  ]);

  test('inserta la copia justo después del original en la misma sesión', () => {
    const res = duplicatePart(base, { day_of_week: 1, session_index: 0, part_uid: 'a' });
    expect(res).not.toBeNull();
    const blocks = res!.slots.days[0]!.sessions[0]!.blocks!;
    expect(blocks.map((b) => b.uid)).toEqual(['a', res!.new_part_uid, 'b']);
    expect(res!.new_part_uid).not.toBe('a');
    expect(blocks[1]!.title).toBe('A');
  });

  test('copia a otro día/sesión la añade al final del destino', () => {
    const res = duplicatePart(
      base,
      { day_of_week: 1, session_index: 0, part_uid: 'b' },
      { day_of_week: 2, session_index: 0 },
    );
    expect(res).not.toBeNull();
    const destBlocks = res!.slots.days[1]!.sessions[0]!.blocks!;
    expect(destBlocks).toHaveLength(1);
    expect(destBlocks[0]!.title).toBe('B');
    expect(destBlocks[0]!.uid).toBe(res!.new_part_uid);
    // El día origen no cambia.
    expect(res!.slots.days[0]!.sessions[0]!.blocks).toHaveLength(2);
  });

  test('devuelve null si el bloque no existe', () => {
    expect(
      duplicatePart(base, { day_of_week: 1, session_index: 0, part_uid: 'zzz' }),
    ).toBeNull();
  });
});

describe('duplicateDay', () => {
  const base = slotsWith([
    {
      day_of_week: 1,
      focus: 'Pierna',
      sessions: [{ kind: 'workout', blocks: [part('a', 'A', ['i1'])] }],
    },
    { day_of_week: 2, sessions: [{ kind: 'workout', blocks: [part('x', 'X')] }] },
  ]);

  test('copia todas las sesiones del origen al destino con uids nuevos', () => {
    const next = duplicateDay(base, 1, 2);
    expect(next).not.toBeNull();
    const destDay = next!.days.find((d) => d.day_of_week === 2)!;
    expect(destDay.focus).toBe('Pierna');
    const destBlocks = destDay.sessions[0]!.blocks!;
    expect(destBlocks).toHaveLength(1);
    expect(destBlocks[0]!.title).toBe('A');
    expect(destBlocks[0]!.uid).not.toBe('a');
    expect(destBlocks[0]!.items[0]!.uid).not.toBe('i1');
    // El día origen no se muta.
    expect(base.days[0]!.sessions[0]!.blocks![0]!.uid).toBe('a');
  });

  test('no-op si origen == destino', () => {
    expect(duplicateDay(base, 1, 1)).toBeNull();
  });
});

describe('cloneWeekSlotsWithNewUids', () => {
  test('regenera uids en toda la semana sin mutar el origen', () => {
    const original = slotsWith([
      { day_of_week: 1, sessions: [{ kind: 'workout', blocks: [part('a', 'A', ['i1'])] }] },
    ]);
    const copy = cloneWeekSlotsWithNewUids(original);
    const copyBlock = copy.days[0]!.sessions[0]!.blocks![0]!;
    expect(copyBlock.uid).not.toBe('a');
    expect(copyBlock.items[0]!.uid).not.toBe('i1');
    expect(original.days[0]!.sessions[0]!.blocks![0]!.uid).toBe('a');
  });
});
