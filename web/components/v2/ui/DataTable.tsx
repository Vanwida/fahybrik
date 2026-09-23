'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from './Checkbox';
import {
  applySelection,
  nextSort,
  sortRows,
  windowRange,
  type SortDir,
  type SortState,
  type SortValue,
} from './table-logic';

export type { SortState, SortDir } from './table-logic';

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Si está, la columna se puede ordenar por este valor. */
  sortValue?: (row: T) => SortValue;
  /** Primera dirección al pulsar (fechas recientes / peor primero → 'desc'). */
  defaultDir?: SortDir;
  align?: 'left' | 'right' | 'center';
  /** Ancho CSS de la columna («160px», «18%»). Sin él, reparte. */
  width?: string;
  /** Oculta la columna por debajo de ese ancho (móvil = triaje). */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  'aria-label': string;
  /** Orden controlado (p. ej. en la URL). Sin él, la tabla lo guarda sola. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  defaultSort?: SortState | null;
  /** Con `onSelectionChange` aparece la columna de casillas. */
  selection?: string[];
  onSelectionChange?: (ids: string[]) => void;
  /** Enter o clic en la fila. */
  onRowOpen?: (row: T) => void;
  /** Fila con el foco de teclado (J/K). Controlado opcional. */
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  density?: 'compact' | 'comfy';
  /** Pinta solo las filas visibles (para 300+). Necesita `maxHeight`. */
  virtualize?: boolean;
  /** Alto del contenedor con scroll propio (cabecera fija dentro). */
  maxHeight?: string;
  /** Sin scroll propio: desplazamiento de la cabecera fija (alto de la barra superior). */
  stickyTop?: number;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
}

const HIDE: Record<NonNullable<DataTableColumn<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const ROW_H = { compact: 40, comfy: 48 } as const;
const VIRTUAL_MIN = 80;

function isEditable(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
}

function isInteractive(el: EventTarget | null, stop: HTMLElement): boolean {
  let node = el as HTMLElement | null;
  while (node && node !== stop) {
    if (node.matches('a,button,input,select,textarea,label,[role="checkbox"],[role="menuitem"],[data-row-ignore]')) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Tabla de datos del panel: `<table>` real, cabecera fija, orden con
 * `aria-sort`, selección con casillas (shift = rango), teclado J/K (↓/↑)
 * mover · X marcar (⇧X rango) · Enter abrir · Esc limpiar. Filas de 40 px.
 * `virtualize` pinta solo la ventana visible (300+ filas).
 */
export function DataTable<T>({
  rows,
  columns,
  getRowId,
  sort: sortProp,
  onSortChange,
  defaultSort = null,
  selection,
  onSelectionChange,
  onRowOpen,
  activeId: activeProp,
  onActiveChange,
  density = 'compact',
  virtualize = false,
  maxHeight,
  stickyTop = 0,
  empty,
  rowClassName,
  className,
  'aria-label': ariaLabel,
}: DataTableProps<T>) {
  const [sortLocal, setSortLocal] = useState<SortState | null>(defaultSort);
  const sort = sortProp !== undefined ? sortProp : sortLocal;
  const [activeLocal, setActiveLocal] = useState<string | null>(null);
  const activeId = activeProp !== undefined ? activeProp : activeLocal;
  const setActive = useCallback(
    (id: string | null) => {
      setActiveLocal(id);
      onActiveChange?.(id);
    },
    [onActiveChange],
  );
  const anchor = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 600 });

  const selectable = Boolean(onSelectionChange);
  const selected = useMemo(() => selection ?? [], [selection]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const sorted = useMemo(() => {
    const col = sort ? columns.find((c) => c.id === sort.id) : undefined;
    return col?.sortValue && sort ? sortRows(rows, col.sortValue, sort.dir) : rows;
  }, [rows, columns, sort]);
  const ordered = useMemo(() => sorted.map(getRowId), [sorted, getRowId]);

  const rowH = ROW_H[density];
  const windowed = virtualize && sorted.length > VIRTUAL_MIN;
  const { start, end } = windowed
    ? windowRange(scroll.top, scroll.height, rowH, sorted.length)
    : { start: 0, end: sorted.length };

  useEffect(() => {
    if (!windowed || !scroller.current) return;
    const el = scroller.current;
    const measure = () => setScroll({ top: el.scrollTop, height: el.clientHeight });
    measure();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [windowed]);

  // La fila activa siempre a la vista y con el foco (el lector la sigue).
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (!pendingFocus.current || !activeId) return;
    const idx = ordered.indexOf(activeId);
    if (windowed && scroller.current && idx >= 0) {
      const el = scroller.current;
      const header = 32;
      const top = idx * rowH;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + rowH > el.scrollTop + el.clientHeight - header) el.scrollTop = top + rowH - el.clientHeight + header;
    }
    const row = scroller.current?.querySelector<HTMLTableRowElement>(`tr[data-row-id="${CSS.escape(activeId)}"]`);
    if (row) {
      pendingFocus.current = false;
      row.focus({ preventScroll: windowed });
    }
  }, [activeId, ordered, windowed, rowH, start, end]);

  const toggle = (id: string, shift: boolean) => {
    if (!onSelectionChange) return;
    onSelectionChange(applySelection(selected, ordered, id, { shift, anchor: anchor.current }));
    anchor.current = id;
  };

  const move = (delta: number) => {
    if (ordered.length === 0) return;
    const idx = activeId ? ordered.indexOf(activeId) : -1;
    const next = idx === -1 ? (delta > 0 ? 0 : ordered.length - 1) : Math.min(ordered.length - 1, Math.max(0, idx + delta));
    pendingFocus.current = true;
    setActive(ordered[next]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (isEditable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key;
    if (key === 'j' || key === 'ArrowDown' || key === 'J') {
      e.preventDefault();
      move(1);
    } else if (key === 'k' || key === 'ArrowUp' || key === 'K') {
      e.preventDefault();
      move(-1);
    } else if ((key === 'x' || key === 'X') && activeId && selectable) {
      e.preventDefault();
      toggle(activeId, e.shiftKey);
    } else if (key === 'Enter' && activeId && onRowOpen && (e.target as HTMLElement).tagName === 'TR') {
      const row = sorted[ordered.indexOf(activeId)];
      if (row) {
        e.preventDefault();
        onRowOpen(row);
      }
    } else if (key === 'Escape' && selected.length > 0 && selectable) {
      e.preventDefault();
      onSelectionChange?.([]);
    }
  };

  const onHeaderSort = (col: DataTableColumn<T>) => {
    const next = nextSort(sort, col.id, col.defaultDir);
    if (sortProp === undefined) setSortLocal(next);
    onSortChange?.(next);
  };

  const allSelected = ordered.length > 0 && selected.length === ordered.length;
  const someSelected = selected.length > 0 && !allSelected;
  const colCount = columns.length + (selectable ? 1 : 0);
  const thSticky: CSSProperties = maxHeight ? { top: 0 } : { top: stickyTop };

  if (rows.length === 0 && empty) {
    return <div className={cn('rounded-panel border border-v2-border bg-v2-surface px-4 py-6', className)}>{empty}</div>;
  }

  return (
    <div
      ref={scroller}
      onKeyDown={onKeyDown}
      className={cn(
        'relative rounded-panel border border-v2-border bg-v2-surface',
        // Sin scroll propio, `clip` (no `auto`): un contenedor con scroll rompería la
        // cabecera fija contra la página. En el móvil se ocultan columnas (hideBelow).
        maxHeight ? 'overflow-auto overscroll-contain' : 'overflow-clip',
        className,
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table aria-label={ariaLabel} aria-rowcount={sorted.length + 1} className="w-full border-separate border-spacing-0 t-body-sm">
        <colgroup>
          {selectable ? <col style={{ width: 44 }} /> : null}
          {columns.map((c) => (
            <col key={c.id} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {selectable ? (
              <th scope="col" style={thSticky} className="sticky z-[2] h-8 border-b border-v2-border bg-v2-surface pl-4">
                <Checkbox
                  aria-label={allSelected ? 'Quitar toda la selección' : 'Seleccionar todas las filas'}
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={(c) => onSelectionChange?.(c && !someSelected ? ordered : [])}
                />
              </th>
            ) : null}
            {columns.map((col) => {
              const active = sort?.id === col.id;
              const ariaSort = col.sortValue ? (active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined;
              const Icon = active ? (sort?.dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
              return (
                <th
                  key={col.id}
                  scope="col"
                  aria-sort={ariaSort}
                  style={thSticky}
                  className={cn(
                    'sticky z-[2] h-8 border-b border-v2-border bg-v2-surface px-3 align-middle whitespace-nowrap t-label text-v2-faint first:pl-4 last:pr-4',
                    ALIGN[col.align ?? 'left'],
                    col.hideBelow && HIDE[col.hideBelow],
                  )}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => onHeaderSort(col)}
                      className={cn(
                        'group/sort -mx-1 inline-flex items-center gap-1 rounded-[4px] px-1 uppercase outline-none',
                        'hover:text-v2-fg focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]',
                        active && 'text-v2-fg',
                        col.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {col.header}
                      <Icon
                        aria-hidden
                        strokeWidth={2}
                        className={cn('size-3', active ? 'opacity-100' : 'opacity-0 group-hover/sort:opacity-60')}
                      />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {windowed && start > 0 ? (
            <tr aria-hidden style={{ height: start * rowH }}>
              <td colSpan={colCount} />
            </tr>
          ) : null}
          {sorted.slice(start, end).map((row, i) => {
            const id = getRowId(row);
            const isSel = selectedSet.has(id);
            const isActive = id === activeId;
            return (
              <tr
                key={id}
                data-row-id={id}
                tabIndex={isActive || (!activeId && start + i === 0) ? 0 : -1}
                aria-selected={selectable ? isSel : undefined}
                aria-rowindex={start + i + 2}
                data-active={isActive || undefined}
                onClick={(e: MouseEvent<HTMLTableRowElement>) => {
                  if (isInteractive(e.target, e.currentTarget)) return;
                  setActive(id);
                  if (e.shiftKey && selectable) toggle(id, true);
                  else onRowOpen?.(row);
                }}
                onFocus={() => {
                  if (!isActive) setActive(id);
                }}
                style={{ height: rowH }}
                className={cn(
                  'group/tr outline-none [&>td]:border-b [&>td]:border-v2-border last:[&>td]:border-b-0',
                  onRowOpen && 'cursor-pointer',
                  isSel ? 'bg-v2-select' : 'hover:bg-v2-hover',
                  isActive && '[&>td:first-child]:shadow-[inset_2px_0_0_var(--v2-select-bar)]',
                  'focus-visible:[&>td]:bg-v2-hover',
                  rowClassName?.(row),
                )}
              >
                {selectable ? (
                  <td className="pl-4 align-middle">
                    <Checkbox
                      aria-label="Seleccionar fila"
                      checked={isSel}
                      onCheckedChange={(_c, ev) => toggle(id, Boolean((ev as globalThis.MouseEvent | undefined)?.shiftKey))}
                    />
                  </td>
                ) : null}
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn(
                      'max-w-0 truncate px-3 align-middle text-v2-fg first:pl-4 last:pr-4',
                      ALIGN[col.align ?? 'left'],
                      col.align === 'right' && 't-tnum',
                      col.hideBelow && HIDE[col.hideBelow],
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
          {windowed && end < sorted.length ? (
            <tr aria-hidden style={{ height: (sorted.length - end) * rowH }}>
              <td colSpan={colCount} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
