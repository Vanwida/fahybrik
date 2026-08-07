/**
 * Las DOS notas que el coach escribe para el ATLETA, de punta a punta del lado web.
 *
 *  · La del ENTRENO (`WeekSession.notes` → `templates.coach_notes` al materializar
 *    → el brief previo del móvil): «hoy vamos a por el ritmo, no te pases en la
 *    primera serie».
 *  · La de UNA LÍNEA prescrita (`WeekDayPartItem.notes` → `template_segments.notes`
 *    → «NOTA DE TU COACH» en el detalle del ejercicio): «baja la carga, vienes de
 *    la tirada del domingo».
 *
 * Las dos se escriben ya en el editor de día, así que las dos son AUTORITATIVAS
 * desde el input: enviarlas las fija y vaciarlas las borra de verdad — el mismo
 * contrato que `focus` (el título del entreno) tiene en la misma función. Un
 * caller que las omite las borra: es deliberado y lo cubre un test, porque es lo
 * que separa este campo de `coach_note` (que sí se preserva por omisión, ver
 * editor-serialize-coach-note.test.ts).
 *
 * El último bloque cierra el círculo real: EditorSession (lo que el coach tiene en
 * pantalla) → `sessionsToWire` → `dayEditorSaveSchema` (lo que valida el servidor)
 * → `serializeDay` → `slots_json`. Si esa cadena pierde la nota, el coach escribe
 * y al recargar no está.
 */
import { describe, expect, test } from 'vitest';
import { serializeDay } from '@/lib/dashboard/v2/editor-serialize';
import { sessionsToWire } from '@/components/v2/editor/day-editor-io';
import type { EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import {
  dayEditorSaveSchema,
  ITEM_NOTES_MAX,
  SESSION_NOTES_MAX,
  type EditorSessionInput,
  type WeekDay,
  type WeekDayPartItem,
  type WeekSession,
} from '@fahybrid/shared/schema/program-templates';

const PRESCRIPTION: Prescription = {
  scheme: 'sets',
  modality: 'strength',
  sets: [{ measure: { kind: 'reps', value: 8 } }],
};

const NOTA_ENTRENO = 'Hoy vamos a por el ritmo. No te pases en la primera serie.';
const NOTA_LINEA = 'Baja la carga, vienes de la tirada del domingo.';

/** Un día persistido con UNA sesión y UN bloque de una línea. */
function originalDay(over: {
  session?: Partial<WeekSession>;
  item?: Partial<WeekDayPartItem>;
}): WeekDay {
  return {
    day_of_week: 1,
    sessions: [
      {
        kind: 'workout',
        template_id: null,
        blocks: [
          {
            uid: 'blk-1',
            format: 'sets',
            title: 'Fuerza',
            items: [
              {
                uid: 'it-1',
                exercise_id: 7,
                exercise_name: 'Back squat',
                prescription_json: PRESCRIPTION,
                ...over.item,
              },
            ],
          },
        ],
        ...over.session,
      },
    ],
  };
}

/** El input del editor: sesión (+ nota) con un bloque de una línea (+ su nota). */
function sessionInput(over: { notes?: string; itemNotes?: string }): EditorSessionInput[] {
  return [
    {
      uid: 'ses-1',
      slot: 'am',
      ...(over.notes !== undefined ? { notes: over.notes } : {}),
      blocks: [
        {
          uid: 'blk-1',
          title: 'Fuerza',
          items: [
            {
              uid: 'it-1',
              exercise_id: 7,
              exercise_name: 'Back squat',
              prescription: PRESCRIPTION,
              ...(over.itemNotes !== undefined ? { notes: over.itemNotes } : {}),
            },
          ],
        },
      ],
    },
  ];
}

const firstSession = (day: WeekDay) => day.sessions[0]!;
const firstItem = (day: WeekDay) => day.sessions[0]!.blocks![0]!.items![0]!;

describe('serializeDay — la NOTA DEL ENTRENO (WeekSession.notes)', () => {
  test('una sesión NUEVA (sin original) con nota la persiste', () => {
    const original: WeekDay = { day_of_week: 1, sessions: [] };
    const day = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ notes: NOTA_ENTRENO }),
      original,
    });
    expect(firstSession(day).notes).toBe(NOTA_ENTRENO);
  });

  test('la nota del input PISA la que ya había (input manda cuando se envía)', () => {
    const day = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ notes: 'la de hoy' }),
      original: originalDay({ session: { notes: 'la de la semana pasada' } }),
    });
    expect(firstSession(day).notes).toBe('la de hoy');
  });

  test('VACIARLA la borra de verdad — el borrado se persiste', () => {
    const day = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ notes: '' }),
      original: originalDay({ session: { notes: NOTA_ENTRENO } }),
    });
    expect(firstSession(day).notes).toBeUndefined();
  });

  test('solo espacios NO es contenido — se borra igual que vaciarla', () => {
    const day = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ notes: '   \n  ' }),
      original: originalDay({ session: { notes: NOTA_ENTRENO } }),
    });
    expect(firstSession(day).notes).toBeUndefined();
  });

  test('se guarda RECORTADA (sin los espacios de los bordes)', () => {
    const day = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ notes: `  ${NOTA_ENTRENO}  ` }),
      original: originalDay({}),
    });
    expect(firstSession(day).notes).toBe(NOTA_ENTRENO);
  });

  test('omitir la clave la borra: es autoritativa desde el input, igual que `focus`', () => {
    const day = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({}), // sin la clave `notes`
      original: originalDay({ session: { notes: NOTA_ENTRENO } }),
    });
    expect(firstSession(day).notes).toBeUndefined();
  });

  test('sin nota en ninguna parte el campo queda AUSENTE, nunca un "" que parece contenido', () => {
    const day = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({}),
      original: originalDay({}),
    });
    expect(firstSession(day).notes).toBeUndefined();
    expect('notes' in firstSession(day)).toBe(false);
  });

  test('escribir la nota no toca lo que la sesión preserva del original (kind / template_id)', () => {
    const day = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ notes: NOTA_ENTRENO }),
      original: originalDay({ session: { kind: 'workout', template_id: 42 } }),
    });
    expect(firstSession(day).kind).toBe('workout');
    expect(firstSession(day).template_id).toBe(42);
  });
});

describe('serializeDay — la NOTA DE UNA LÍNEA (WeekDayPartItem.notes)', () => {
  test('una línea con nota la persiste', () => {
    const day = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ itemNotes: NOTA_LINEA }),
      original: originalDay({}),
    });
    expect(firstItem(day).notes).toBe(NOTA_LINEA);
  });

  test('la nota del input PISA la que ya había en esa línea', () => {
    const day = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ itemNotes: 'la de hoy' }),
      original: originalDay({ item: { notes: 'la de la semana pasada' } }),
    });
    expect(firstItem(day).notes).toBe('la de hoy');
  });

  test('VACIARLA la borra de verdad', () => {
    const day = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({ itemNotes: '' }),
      original: originalDay({ item: { notes: NOTA_LINEA } }),
    });
    expect(firstItem(day).notes).toBeUndefined();
  });

  test('sin nota en ninguna parte el campo queda AUSENTE', () => {
    const day = serializeDay({
      day_of_week: 1,
      sessions: sessionInput({}),
      original: originalDay({}),
    });
    expect(firstItem(day).notes).toBeUndefined();
    expect('notes' in firstItem(day)).toBe(false);
  });
});

describe('el círculo entero: lo que el coach escribe vuelve escrito', () => {
  /** Lo que tiene en pantalla el editor de día tras teclear las dos notas. */
  function editorSessions(over: { notes?: string; itemNotes?: string }): EditorSession[] {
    return [
      {
        uid: 'ses-1',
        slot: 'am',
        focus: 'Fuerza de pierna',
        ...(over.notes !== undefined ? { notes: over.notes } : {}),
        blocks: [
          {
            uid: 'blk-1',
            title: 'Fuerza',
            format: 'sets',
            items: [
              {
                uid: 'it-1',
                exercise_id: 7,
                exercise_name: 'Back squat',
                prescription: PRESCRIPTION,
                ...(over.itemNotes !== undefined ? { notes: over.itemNotes } : {}),
              },
            ],
          },
        ],
      },
    ];
  }

  /** El viaje real: pantalla → wire → validación del servidor → slots_json. */
  function save(sessions: EditorSession[], original: WeekDay): WeekDay {
    const parsed = dayEditorSaveSchema.parse({
      day_of_week: 1,
      sessions: sessionsToWire(sessions),
    });
    return serializeDay({
      day_of_week: parsed.day_of_week,
      sessions: parsed.sessions,
      original,
    });
  }

  test('las dos notas sobreviven el guardado entero (y quedan listas para rehidratar el editor)', () => {
    const day = save(
      editorSessions({ notes: NOTA_ENTRENO, itemNotes: NOTA_LINEA }),
      originalDay({}),
    );
    expect(firstSession(day).notes).toBe(NOTA_ENTRENO);
    expect(firstItem(day).notes).toBe(NOTA_LINEA);
    // El título sigue viajando como siempre — la nota no lo desplaza.
    expect(firstSession(day).focus).toBe('Fuerza de pierna');
  });

  test('el coach BORRA las dos notas y el borrado llega hasta slots_json', () => {
    const day = save(
      editorSessions({ notes: '', itemNotes: '' }),
      originalDay({ session: { notes: NOTA_ENTRENO }, item: { notes: NOTA_LINEA } }),
    );
    expect(firstSession(day).notes).toBeUndefined();
    expect(firstItem(day).notes).toBeUndefined();
  });

  test('el wire no manda notas vacías: el payload ni siquiera lleva la clave', () => {
    const [wire] = sessionsToWire(editorSessions({ notes: '  ', itemNotes: '' }));
    expect(wire).toBeDefined();
    expect('notes' in wire!).toBe(false);
    expect('notes' in wire!.blocks[0]!.items[0]!).toBe(false);
  });

  test('el tope del input es el del esquema — lo que el textarea deja teclear, el servidor lo acepta', () => {
    const day = save(
      editorSessions({
        notes: 'a'.repeat(SESSION_NOTES_MAX),
        itemNotes: 'b'.repeat(ITEM_NOTES_MAX),
      }),
      originalDay({}),
    );
    expect(firstSession(day).notes).toHaveLength(SESSION_NOTES_MAX);
    expect(firstItem(day).notes).toHaveLength(ITEM_NOTES_MAX);
  });
});
