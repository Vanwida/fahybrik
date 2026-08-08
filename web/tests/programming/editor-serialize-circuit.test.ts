/**
 * serializeDay (lib/dashboard/v2/editor-serialize.ts) — `EditorBlock.circuit`
 * round-trip (docs/DECISIONS.md, 2026-08-07 «"Circuito" pasa a ser un tipo de
 * bloque real»).
 *
 * `circuit` (rounds + pacing + los dos descansos) reemplaza `applyHead`
 * (ComponentsForm.tsx) para el bloque Circuito: ese mecanismo copiaba los
 * mismos números en CADA estación por convención de UI, y ya divergió en
 * producción (2 de 22 grupos reales con el campo en una estación y no en la
 * otra). Ahora vive UNA vez en `WeekDayPart.circuit`. Mismo contrato "input
 * manda cuando se envía, si no se preserva el original" que `group` /
 * `methodology_group_id` / `source_block_id` / `coach_note` — ver
 * editor-serialize-coach-note.test.ts, el molde de este fichero — porque
 * ComponentsForm SIEMPRE manda su `circuit` completo mientras el bloque sea
 * Circuito (rounds + pacing son obligatorios en el schema), y un caller que
 * aún no lo conoce (copiar día, tests viejos) simplemente lo omite.
 */
import { describe, expect, test } from 'vitest';
import { serializeDay } from '@/lib/dashboard/v2/editor-serialize';
import { sessionsToWire } from '@/components/v2/editor/day-editor-io';
import type { EditorSession } from '@/lib/dashboard/v2/editor-types';
import type {
  CircuitConfig,
  EditorSessionInput,
  WeekDay,
  WeekDayPart,
} from '@fahybrid/shared/schema/program-templates';
import { dayEditorSaveSchema } from '@fahybrid/shared/schema/program-templates';

const POR_TAREA: CircuitConfig = { rounds: 4, pacing: { kind: 'por_tarea' } };
const POR_RELOJ: CircuitConfig = {
  rounds: 5,
  pacing: { kind: 'por_reloj', work_seconds: 120 },
  rest_between_stations_seconds: 15,
  rest_between_rounds_seconds: 90,
};

function originalDay(block: Partial<WeekDayPart> & { uid: string }): WeekDay {
  return {
    day_of_week: 1,
    sessions: [
      { kind: 'workout', blocks: [{ format: 'circuit', title: 'Circuito', items: [], ...block }] },
    ],
  };
}

function sessionInput(block: { uid: string; circuit?: CircuitConfig }): EditorSessionInput[] {
  return [
    {
      uid: 'ses-1',
      slot: 'am',
      blocks: [
        {
          uid: block.uid,
          title: 'Circuito',
          format: 'circuit',
          items: [],
          ...(block.circuit !== undefined ? { circuit: block.circuit } : {}),
        },
      ],
    },
  ];
}

describe('serializeDay — EditorBlock.circuit', () => {
  test('a NEW block (no original) with circuit set persists it (por_tarea, sin reloj)', () => {
    const original: WeekDay = { day_of_week: 1, sessions: [{ kind: 'workout', blocks: [] }] };
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1', circuit: POR_TAREA }),
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.circuit).toEqual(POR_TAREA);
  });

  test('persists por_reloj with work_seconds + los dos descansos', () => {
    const original: WeekDay = { day_of_week: 1, sessions: [{ kind: 'workout', blocks: [] }] };
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1', circuit: POR_RELOJ }),
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.circuit).toEqual(POR_RELOJ);
  });

  test('input circuit OVERWRITES a different original one (input wins when sent)', () => {
    const original = originalDay({ uid: 'blk-1', circuit: POR_TAREA });
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1', circuit: POR_RELOJ }),
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.circuit).toEqual(POR_RELOJ);
  });

  test('a save that OMITS circuit (bloque no-Circuito, sin su UI) PRESERVES the original — never silently wiped', () => {
    const original = originalDay({ uid: 'blk-1', circuit: POR_TAREA });
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1' }), // no circuit key at all
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.circuit).toEqual(POR_TAREA);
  });

  test('neither input nor original carries one — the field stays absent (bloque no-Circuito, comportamiento legacy)', () => {
    const original = originalDay({ uid: 'blk-1' });
    const result = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ uid: 'blk-1' }),
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.circuit).toBeUndefined();
  });

  test('a block WITHOUT circuit round-trips byte-identical (backward compatible, additive only)', () => {
    const original = originalDay({ uid: 'blk-1', format: 'strength_block', title: 'Fuerza' });
    const result = serializeDay({
      day_of_week: 1,
      sessions: [
        {
          uid: 'ses-1',
          slot: 'am',
          blocks: [{ uid: 'blk-1', title: 'Fuerza', format: 'strength_block', items: [] }],
        },
      ],
      original,
    });
    expect(result.sessions[0]!.blocks![0]!.circuit).toBeUndefined();
    expect('circuit' in result.sessions[0]!.blocks![0]!).toBe(false);
  });
});

describe('el círculo entero: EditorSession (pantalla) → sessionsToWire → dayEditorSaveSchema → serializeDay', () => {
  function editorSessions(circuit?: CircuitConfig): EditorSession[] {
    return [
      {
        uid: 'ses-1',
        slot: 'am',
        blocks: [
          {
            uid: 'blk-1',
            title: 'Circuito',
            format: 'circuit',
            items: [],
            ...(circuit !== undefined ? { circuit } : {}),
          },
        ],
      },
    ];
  }

  function save(sessions: EditorSession[], original: WeekDay): WeekDay {
    const parsed = dayEditorSaveSchema.parse({
      day_of_week: 1,
      sessions: sessionsToWire(sessions),
    });
    return serializeDay({ day_of_week: parsed.day_of_week, sessions: parsed.sessions, original });
  }

  test('lo que ComponentsForm escribe en pantalla llega intacto hasta slots_json', () => {
    const original: WeekDay = { day_of_week: 1, sessions: [{ kind: 'workout', blocks: [] }] };
    const day = save(editorSessions(POR_RELOJ), original);
    expect(day.sessions[0]!.blocks![0]!.circuit).toEqual(POR_RELOJ);
  });

  test('el wire NO manda la clave `circuit` para un bloque sin ella (nunca `null` — el schema es `.optional()`, no nullable)', () => {
    const [wire] = sessionsToWire(editorSessions(undefined));
    expect(wire).toBeDefined();
    expect('circuit' in wire!.blocks[0]!).toBe(false);
  });
});
