import { describe, expect, test } from 'vitest';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import {
  applyWrites,
  cellState,
  clearRange,
  copyRange,
  duplicateDown,
  effectiveWrites,
  emptyDay,
  gridFromWeeks,
  hasAuthoredContent,
  inverseWrites,
  moveCursor,
  pasteInto,
  rangeOf,
  restDay,
  rowRange,
} from '@/lib/dashboard/programming/grid-model';
import { emptyHistory, record, redo, undo } from '@/lib/dashboard/programming/grid-history';

let n = 0;
const uid = () => `u${++n}`;

function workout(dow: number, title: string): WeekDay {
  return {
    day_of_week: dow,
    sessions: [
      {
        kind: 'workout',
        template_id: null,
        focus: title,
        blocks: [{ uid: `b-${title}`, format: 'sets', title, items: [{ uid: `i-${title}`, exercise_id: 1, exercise_name: title }] }],
      },
    ],
  };
}

const bounds = { rows: 4, cols: 7 };

function grid4(): WeekDay[][] {
  // Semana 1 con L, M, J, V, S; el resto vacío.
  const w1 = [1, 2, 4, 5, 6].map((d) => workout(d, `S1-D${d}`));
  return gridFromWeeks([{ days: w1 }, { days: [] }, { days: [] }, { days: [] }]);
}

describe('cursor', () => {
  test('las flechas se quedan dentro de la rejilla y ⌘ salta al borde', () => {
    expect(moveCursor({ row: 0, col: 0 }, 'ArrowUp', bounds)).toEqual({ row: 0, col: 0 });
    expect(moveCursor({ row: 0, col: 0 }, 'ArrowRight', bounds)).toEqual({ row: 0, col: 1 });
    expect(moveCursor({ row: 1, col: 3 }, 'ArrowDown', bounds, true)).toEqual({ row: 3, col: 3 });
    expect(moveCursor({ row: 1, col: 3 }, 'ArrowLeft', bounds, true)).toEqual({ row: 1, col: 0 });
  });
  test('un rango se normaliza sea cual sea el orden', () => {
    expect(rangeOf({ row: 3, col: 5 }, { row: 1, col: 2 })).toEqual({ r0: 1, r1: 3, c0: 2, c1: 5 });
  });
});

describe('estados de celda', () => {
  test('vacío, descanso y entreno son tres cosas distintas', () => {
    expect(cellState(emptyDay(3))).toBe('empty');
    expect(cellState(restDay(3))).toBe('rest');
    expect(cellState(workout(3, 'x'))).toBe('workout');
    expect(hasAuthoredContent(restDay(3))).toBe(false);
    expect(hasAuthoredContent(workout(3, 'x'))).toBe(true);
  });
});

describe('copiar y pegar', () => {
  test('copiar la semana 1 y pegarla sobre las semanas 2–4 la repite tres veces con uids nuevos', () => {
    const g = grid4();
    const clip = copyRange(g, rowRange(0, bounds));
    const writes = pasteInto(clip, { r0: 1, r1: 3, c0: 0, c1: 6 }, bounds, uid);
    expect(writes).toHaveLength(21);
    const next = applyWrites(g, writes);
    for (const row of [1, 2, 3]) {
      expect(next[row]![0]!.sessions[0]!.focus).toBe('S1-D1');
      expect(next[row]![2]!.sessions).toHaveLength(0);
      expect(next[row]![0]!.sessions[0]!.blocks![0]!.uid).not.toBe('b-S1-D1');
    }
    // el original no se toca
    expect(g[1]![0]!.sessions).toHaveLength(0);
  });

  test('una celda pegada sobre un rango lo llena; el day_of_week es el del destino', () => {
    const g = grid4();
    const clip = copyRange(g, { r0: 0, r1: 0, c0: 0, c1: 0 });
    const writes = pasteInto(clip, { r0: 2, r1: 3, c0: 1, c1: 2 }, bounds, uid);
    expect(writes.map((w) => [w.row, w.col, w.day.day_of_week])).toEqual([
      [2, 1, 2],
      [2, 2, 3],
      [3, 1, 2],
      [3, 2, 3],
    ]);
  });

  test('pegar cerca del borde recorta a la rejilla', () => {
    const g = grid4();
    const clip = copyRange(g, rowRange(0, bounds));
    const writes = pasteInto(clip, { r0: 3, r1: 3, c0: 3, c1: 3 }, bounds, uid);
    expect(writes.map((w) => w.col)).toEqual([3, 4, 5, 6]);
  });

  test('⌘D sobre una semana la copia a la siguiente; sobre varias rellena hacia abajo', () => {
    const g = grid4();
    expect(duplicateDown(g, rowRange(0, bounds), bounds, uid).every((w) => w.row === 1)).toBe(true);
    const fill = duplicateDown(g, { r0: 0, r1: 3, c0: 0, c1: 6 }, bounds, uid);
    expect(new Set(fill.map((w) => w.row))).toEqual(new Set([1, 2, 3]));
    expect(duplicateDown(g, rowRange(3, bounds), bounds, uid)).toEqual([]);
  });

  test('borrar deja días vacíos (no descanso) y solo cuenta lo que cambia', () => {
    const g = grid4();
    const writes = clearRange({ r0: 0, r1: 0, c0: 0, c1: 3 }, bounds);
    expect(writes.every((w) => cellState(w.day) === 'empty')).toBe(true);
    // la celda 2 (miércoles) ya estaba vacía: no es un cambio
    expect(effectiveWrites(g, writes).map((w) => w.col)).toEqual([0, 1, 3]);
  });
});

describe('deshacer / rehacer', () => {
  test('deshacer reescribe el antes y rehacer el después', () => {
    const g = grid4();
    const writes = effectiveWrites(g, clearRange(rowRange(0, bounds), bounds));
    let h = record(emptyHistory, { label: 'Borrado', before: inverseWrites(g, writes), after: writes });
    const g2 = applyWrites(g, writes);
    expect(cellState(g2[0]![0])).toBe('empty');

    const u = undo(h)!;
    h = u.history;
    const g3 = applyWrites(g2, u.writes);
    expect(g3[0]![0]!.sessions[0]!.focus).toBe('S1-D1');

    const r = redo(h)!;
    const g4 = applyWrites(g3, r.writes);
    expect(cellState(g4[0]![0])).toBe('empty');
    expect(undo(emptyHistory)).toBeNull();
  });

  test('una acción nueva borra lo rehacible', () => {
    const w = [{ row: 0, col: 0, day: emptyDay(1) }];
    let h = record(emptyHistory, { label: 'a', before: w, after: w });
    h = undo(h)!.history;
    expect(h.future).toHaveLength(1);
    h = record(h, { label: 'b', before: w, after: w });
    expect(h.future).toHaveLength(0);
  });
});
