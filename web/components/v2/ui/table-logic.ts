// Lógica pura de DataTable (orden, selección por rango, ventana visible).
// Sin React: se prueba sola (tests/ui/v2-table-logic.test.ts).

export type SortDir = 'asc' | 'desc';
export interface SortState {
  id: string;
  dir: SortDir;
}

export type SortValue = string | number | null | undefined;

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/**
 * Orden estable. Los vacíos (null/undefined) van SIEMPRE al final, suba o baje
 * el orden: «sin dato» no es ni el mínimo ni el máximo.
 */
export function sortRows<T>(rows: readonly T[], value: ((row: T) => SortValue) | undefined, dir: SortDir): T[] {
  if (!value) return [...rows];
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, v: value(row) }))
    .sort((a, b) => {
      const an = a.v == null || a.v === '';
      const bn = b.v == null || b.v === '';
      if (an || bn) return an === bn ? a.index - b.index : an ? 1 : -1;
      const c =
        typeof a.v === 'number' && typeof b.v === 'number'
          ? a.v - b.v
          : collator.compare(String(a.v), String(b.v));
      return c !== 0 ? c * sign : a.index - b.index;
    })
    .map((x) => x.row);
}

/** Clic en una cabecera: otra columna → su dirección por defecto; la misma → invierte. */
export function nextSort(current: SortState | null, id: string, defaultDir: SortDir = 'asc'): SortState {
  if (!current || current.id !== id) return { id, dir: defaultDir };
  return { id, dir: current.dir === 'asc' ? 'desc' : 'asc' };
}

/** Ids entre `anchor` y `target` (ambos incluidos) en el orden visible. */
export function rangeIds(ordered: readonly string[], anchor: string, target: string): string[] {
  const a = ordered.indexOf(anchor);
  const b = ordered.indexOf(target);
  if (a === -1 || b === -1) return b === -1 ? [] : [target];
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return ordered.slice(lo, hi + 1);
}

/**
 * Aplica un clic de selección. Sin shift: alterna `target`. Con shift y un
 * ancla: el rango entero toma el estado que va a tener `target` (marcar o
 * desmarcar), como en Gmail/Finder. Devuelve la selección en el orden visible.
 */
export function applySelection(
  selected: readonly string[],
  ordered: readonly string[],
  target: string,
  opts: { shift: boolean; anchor: string | null },
): string[] {
  const set = new Set(selected);
  const willSelect = !set.has(target);
  const ids = opts.shift && opts.anchor ? rangeIds(ordered, opts.anchor, target) : [target];
  for (const id of ids) {
    if (willSelect) set.add(id);
    else set.delete(id);
  }
  return ordered.filter((id) => set.has(id));
}

/** Filas a pintar en una lista con ventana: [start, end) con margen. */
export function windowRange(
  scrollTop: number,
  viewport: number,
  rowHeight: number,
  total: number,
  overscan = 8,
): { start: number; end: number } {
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visible = Math.ceil(Math.max(0, viewport) / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(total, first + visible + overscan);
  return { start, end: Math.max(start, end) };
}
