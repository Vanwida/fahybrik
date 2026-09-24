// La rejilla del editor de programas: TODAS las semanas como filas × 7 días
// como columnas (PLAN-CONSTRUCCION §6 «Programar», informe D §4.1). Puro y sin
// DB: lo usan el cliente (cursor, selección, portapapeles, deshacer) y los tests.
//
// Una CELDA es un `WeekDay` guardado tal cual en `program_week_templates.slots_json`
// (sesiones → bloques → líneas con su prescripción tipada). La rejilla no inventa
// otro modelo: copiar, pegar, borrar o progresar produce `WeekDay` nuevos que el
// servidor valida con el mismo esquema (`weekDaySchema`) y guarda por celda.
//
// Coordenadas: `row` = posición de la semana en el programa (0…N-1), `col` = día
// (0 = lunes … 6 = domingo; `day_of_week = col + 1`).

import type { WeekDay } from '@fahybrid/shared/schema/program-templates';

export const DAYS = 7;

export interface GridPos {
  row: number;
  col: number;
}

/** Rango rectangular normalizado (r0 ≤ r1, c0 ≤ c1), extremos incluidos. */
export interface GridRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export interface GridBounds {
  rows: number;
  cols: number;
}

/** Una escritura de celda: qué `WeekDay` queda en (row, col). */
export interface CellWrite {
  row: number;
  col: number;
  day: WeekDay;
}

export type CellState = 'empty' | 'rest' | 'workout';

// ── Celdas ───────────────────────────────────────────────────────────────────

export function emptyDay(dayOfWeek: number): WeekDay {
  return { day_of_week: dayOfWeek, sessions: [] };
}

/** Descanso DELIBERADO: un estado del día (kind='rest'), no un borrado. */
export function restDay(dayOfWeek: number): WeekDay {
  return { day_of_week: dayOfWeek, kind: 'rest', sessions: [] };
}

export function workoutSessions(day: WeekDay): WeekDay['sessions'] {
  return day.sessions.filter((s) => s.kind === 'workout');
}

export function cellState(day: WeekDay | null | undefined): CellState {
  if (!day) return 'empty';
  if (workoutSessions(day).length > 0) return 'workout';
  return day.kind === 'rest' ? 'rest' : 'empty';
}

/** ¿Tiene contenido que el coach escribió? (para pedir confirmación antes de pisarlo) */
export function hasAuthoredContent(day: WeekDay | null | undefined): boolean {
  if (!day) return false;
  return workoutSessions(day).some((s) => (s.blocks ?? []).length > 0 || !!s.focus?.trim());
}

/**
 * Copia profunda de un día a otro `day_of_week` con uids NUEVOS (los uids de
 * bloques y líneas son clave dentro de la semana; un pegado nunca puede chocar
 * con el original). Copia literal: no toca cargas ni ritmos — progresar es otra
 * operación, explícita.
 */
export function cloneDay(source: WeekDay, dayOfWeek: number, uid: () => string = freshUid): WeekDay {
  const copy = structuredClone(source) as WeekDay;
  return {
    ...copy,
    day_of_week: dayOfWeek,
    sessions: (copy.sessions ?? []).map((session) => ({
      ...session,
      blocks: (session.blocks ?? []).map((block) => ({
        ...block,
        uid: uid(),
        items: (block.items ?? []).map((item) => ({ ...item, uid: uid() })),
      })),
    })),
  };
}

export function freshUid(): string {
  return globalThis.crypto.randomUUID();
}

/** Igualdad estructural de dos días (para no guardar ni apilar deshacer sin cambios). */
export function sameDay(a: WeekDay | null | undefined, b: WeekDay | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ── Cursor y selección ───────────────────────────────────────────────────────

export function clampPos(pos: GridPos, bounds: GridBounds): GridPos {
  return {
    row: Math.max(0, Math.min(bounds.rows - 1, pos.row)),
    col: Math.max(0, Math.min(bounds.cols - 1, pos.col)),
  };
}

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/** Mueve el cursor con una flecha; `jump` (⌘/Ctrl) salta al borde. */
export function moveCursor(pos: GridPos, key: ArrowKey, bounds: GridBounds, jump = false): GridPos {
  const next = { ...pos };
  if (key === 'ArrowUp') next.row = jump ? 0 : pos.row - 1;
  if (key === 'ArrowDown') next.row = jump ? bounds.rows - 1 : pos.row + 1;
  if (key === 'ArrowLeft') next.col = jump ? 0 : pos.col - 1;
  if (key === 'ArrowRight') next.col = jump ? bounds.cols - 1 : pos.col + 1;
  return clampPos(next, bounds);
}

export function rangeOf(a: GridPos, b: GridPos): GridRange {
  return {
    r0: Math.min(a.row, b.row),
    r1: Math.max(a.row, b.row),
    c0: Math.min(a.col, b.col),
    c1: Math.max(a.col, b.col),
  };
}

export function rowRange(row: number, bounds: GridBounds): GridRange {
  return { r0: row, r1: row, c0: 0, c1: bounds.cols - 1 };
}

export function inRange(range: GridRange, row: number, col: number): boolean {
  return row >= range.r0 && row <= range.r1 && col >= range.c0 && col <= range.c1;
}

export function rangeSize(range: GridRange): { rows: number; cols: number; cells: number } {
  const rows = range.r1 - range.r0 + 1;
  const cols = range.c1 - range.c0 + 1;
  return { rows, cols, cells: rows * cols };
}

export function rangeCells(range: GridRange): GridPos[] {
  const out: GridPos[] = [];
  for (let row = range.r0; row <= range.r1; row++) {
    for (let col = range.c0; col <= range.c1; col++) out.push({ row, col });
  }
  return out;
}

// ── Portapapeles ─────────────────────────────────────────────────────────────

/** Lo copiado: una matriz relativa de días (filas × columnas). */
export interface GridClipboard {
  rows: number;
  cols: number;
  cells: WeekDay[][];
}

/** Lee una celda de la rejilla; una celda que no existe es un día vacío. */
export function cellAt(grid: WeekDay[][], row: number, col: number): WeekDay {
  return grid[row]?.[col] ?? emptyDay(col + 1);
}

export function copyRange(grid: WeekDay[][], range: GridRange): GridClipboard {
  const { rows, cols } = rangeSize(range);
  const cells: WeekDay[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: WeekDay[] = [];
    for (let c = 0; c < cols; c++) line.push(structuredClone(cellAt(grid, range.r0 + r, range.c0 + c)));
    cells.push(line);
  }
  return { rows, cols, cells };
}

/**
 * Pegar como en una hoja de cálculo:
 *  - lo copiado se pega con su esquina superior izquierda en el inicio del
 *    destino y se recorta a la rejilla;
 *  - si el destino es MÁS grande que lo copiado y es múltiplo exacto en filas o
 *    columnas (una semana copiada sobre tres semanas seleccionadas, una celda
 *    sobre un rango), se repite hasta llenarlo.
 * Cada día pegado es un clon con uids nuevos en su `day_of_week` de destino.
 */
export function pasteInto(
  clip: GridClipboard,
  target: GridRange,
  bounds: GridBounds,
  uid: () => string = freshUid,
): CellWrite[] {
  const t = rangeSize(target);
  const tileRows = t.rows > clip.rows && t.rows % clip.rows === 0 ? t.rows : clip.rows;
  const tileCols = t.cols > clip.cols && t.cols % clip.cols === 0 ? t.cols : clip.cols;
  const out: CellWrite[] = [];
  for (let r = 0; r < tileRows; r++) {
    const row = target.r0 + r;
    if (row >= bounds.rows) break;
    for (let c = 0; c < tileCols; c++) {
      const col = target.c0 + c;
      if (col >= bounds.cols) break;
      const src = clip.cells[r % clip.rows]![c % clip.cols]!;
      out.push({ row, col, day: cloneDay(src, col + 1, uid) });
    }
  }
  return out;
}

/** Vaciar un rango: cada celda queda como día vacío (ni entreno ni descanso). */
export function clearRange(range: GridRange, bounds: GridBounds): CellWrite[] {
  return rangeCells(range)
    .filter((p) => p.row < bounds.rows && p.col < bounds.cols)
    .map((p) => ({ row: p.row, col: p.col, day: emptyDay(p.col + 1) }));
}

/**
 * ⌘D: duplica hacia abajo. Con una fila de semana (o un rango de una sola fila)
 * copia a la semana siguiente; con un rango de varias filas, la primera fila se
 * copia a las demás del rango (rellenar hacia abajo).
 */
export function duplicateDown(grid: WeekDay[][], range: GridRange, bounds: GridBounds, uid: () => string = freshUid): CellWrite[] {
  const src: GridRange = { ...range, r1: range.r0 };
  const clip = copyRange(grid, src);
  const target: GridRange =
    range.r1 > range.r0 ? { ...range, r0: range.r0 + 1 } : { ...range, r0: range.r0 + 1, r1: range.r0 + 1 };
  if (target.r0 >= bounds.rows) return [];
  return pasteInto(clip, target, bounds, uid);
}

/** Aplica escrituras sobre una copia de la rejilla (inmutable). */
export function applyWrites(grid: WeekDay[][], writes: CellWrite[]): WeekDay[][] {
  if (writes.length === 0) return grid;
  const next = grid.map((line) => line.slice());
  for (const w of writes) {
    if (!next[w.row]) continue;
    next[w.row]![w.col] = w.day;
  }
  return next;
}

/** Solo las escrituras que cambian algo (lo demás no se guarda ni se deshace). */
export function effectiveWrites(grid: WeekDay[][], writes: CellWrite[]): CellWrite[] {
  return writes.filter((w) => !sameDay(cellAt(grid, w.row, w.col), w.day));
}

/** El «antes» de unas escrituras: lo que había en esas celdas. Para deshacer. */
export function inverseWrites(grid: WeekDay[][], writes: CellWrite[]): CellWrite[] {
  return writes.map((w) => ({ row: w.row, col: w.col, day: cellAt(grid, w.row, w.col) }));
}

/** Una rejilla desde las semanas guardadas: siempre 7 columnas por fila. */
export function gridFromWeeks(weeks: Array<{ days: WeekDay[] }>): WeekDay[][] {
  return weeks.map((w) => {
    const byDow = new Map(w.days.map((d) => [d.day_of_week, d]));
    return Array.from({ length: DAYS }, (_, c) => byDow.get(c + 1) ?? emptyDay(c + 1));
  });
}
