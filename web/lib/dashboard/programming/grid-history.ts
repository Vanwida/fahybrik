// Deshacer / rehacer de la rejilla del programa (⌘Z / ⇧⌘Z). Puro: una pila de
// lotes de escrituras. Cada acción del coach (pegar, borrar, progresar, editar
// una celda, poner descanso) es UN lote con el «antes» y el «después» de cada
// celda que tocó; deshacer reescribe el «antes», rehacer el «después». Las dos
// cosas pasan por el mismo guardado por celda que cualquier edición, así que lo
// que se deshace también queda guardado.
//
// Sustituye a `use-slots-history` (snapshots de una semana entera, nunca cableado).

import type { CellWrite } from './grid-model';

export const HISTORY_LIMIT = 100;

export interface HistoryEntry {
  /** Lo que hizo el coach, para el aviso («Pegado en 3 celdas»). */
  label: string;
  before: CellWrite[];
  after: CellWrite[];
}

export interface GridHistory {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const emptyHistory: GridHistory = { past: [], future: [] };

export function record(h: GridHistory, entry: HistoryEntry): GridHistory {
  if (entry.after.length === 0) return h;
  const past = [...h.past, entry];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, future: [] };
}

/** Saca el último lote: devuelve las escrituras a aplicar (su «antes»). */
export function undo(h: GridHistory): { history: GridHistory; entry: HistoryEntry; writes: CellWrite[] } | null {
  const entry = h.past[h.past.length - 1];
  if (!entry) return null;
  return {
    history: { past: h.past.slice(0, -1), future: [...h.future, entry] },
    entry,
    writes: entry.before,
  };
}

export function redo(h: GridHistory): { history: GridHistory; entry: HistoryEntry; writes: CellWrite[] } | null {
  const entry = h.future[h.future.length - 1];
  if (!entry) return null;
  return {
    history: { past: [...h.past, entry], future: h.future.slice(0, -1) },
    entry,
    writes: entry.after,
  };
}
