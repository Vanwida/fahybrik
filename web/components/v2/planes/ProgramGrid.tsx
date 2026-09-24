'use client';

// La rejilla: TODAS las semanas como filas × 7 días, con la etiqueta/foco de la
// semana a la izquierda y su volumen planificado a la derecha (derivado de la
// prescripción). El teclado vive en el contenedor (ProgramEditor); aquí se pinta.

import { forwardRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import { Button, IconButton, Menu, type MenuEntry } from '@/components/v2/ui';
import { MODALITY_META } from '@/components/v2/constants';
import { DAY_LABELS_FULL } from '@/lib/dashboard/v2/planes-model';
import { cellAriaText } from '@/lib/dashboard/programming/cell-summary';
import { inRange as isInRange, type GridPos, type GridRange } from '@/lib/dashboard/programming/grid-model';
import { volumeParts, volumeTimeLabel, weekVolume } from '@/lib/dashboard/programming/week-volume';
import { cn } from '@/lib/utils';
import { GridCell } from './GridCell';
import { WeekFocusInput } from './WeekFocusInput';

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const GRID_COLUMNS = 'grid-cols-[124px_repeat(7,minmax(114px,1fr))_104px]';

export interface ProgramGridProps {
  grid: WeekDay[][];
  weeks: Array<{ id: string; focus: string | null }>;
  cursor: GridPos;
  range: GridRange | null;
  dropAt: GridPos | null;
  onPointerSelect: (row: number, col: number, e: MouseEvent) => void;
  onOpen: (row: number, col: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onDragStartCell: (row: number, col: number, e: DragEvent) => void;
  onDragOverCell: (row: number, col: number, e: DragEvent) => void;
  onDropCell: (row: number, col: number, e: DragEvent) => void;
  onDragLeaveCell: () => void;
  onSelectWeek: (row: number) => void;
  weekMenu: (row: number) => MenuEntry[];
  onFocusSaved: (weekId: string, focus: string | null) => void;
}

export const ProgramGrid = forwardRef<HTMLDivElement, ProgramGridProps>(function ProgramGrid(p, ref) {
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  return (
    <div
      ref={ref}
      role="grid"
      tabIndex={0}
      aria-label="Semanas del programa"
      aria-rowcount={p.grid.length + 1}
      aria-colcount={9}
      onKeyDown={p.onKeyDown}
      className="relative min-w-[998px] outline-none"
    >
      <div role="row" className={cn('sticky top-0 z-[3] grid border-b border-v2-border bg-v2-surface-2', GRID_COLUMNS)}>
        <div role="columnheader" className="sticky left-0 z-[1] bg-v2-surface-2 px-3 py-2 t-label text-v2-faint">
          Semana
        </div>
        {DAY_SHORT.map((d, i) => (
          <div key={d} role="columnheader" aria-label={DAY_LABELS_FULL[i]} className="border-l border-v2-border px-2.5 py-2 t-label text-v2-faint">
            {d}
          </div>
        ))}
        <div role="columnheader" className="border-l border-v2-border px-2.5 py-2 t-label text-v2-faint">
          Volumen
        </div>
      </div>
      {p.grid.map((days, row) => {
        const week = p.weeks[row];
        const v = weekVolume(days);
        const time = volumeTimeLabel(v);
        const parts = volumeParts(v);
        return (
          <div
            key={week?.id ?? row}
            role="row"
            aria-rowindex={row + 2}
            onMouseEnter={() => setHoverRow(row)}
            onMouseLeave={() => setHoverRow((r) => (r === row ? null : r))}
            className={cn('grid', GRID_COLUMNS)}
          >
            <div role="rowheader" className="sticky left-0 z-[2] flex min-w-0 flex-col gap-1 border-b border-v2-border bg-v2-surface px-2 py-2">
              <div className="flex items-center justify-between gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => p.onSelectWeek(row)}
                  className="px-1 t-title-sm text-v2-fg t-tnum"
                  aria-label={`Seleccionar la semana ${row + 1}`}
                >
                  S{row + 1}
                </Button>
                <Menu
                  trigger={
                    <IconButton
                      icon={MoreHorizontal}
                      label={`Semana ${row + 1}`}
                      size="sm"
                      className={cn('opacity-0 focus-visible:opacity-100 data-[popup-open]:opacity-100', hoverRow === row && 'opacity-100', 'pointer-coarse:opacity-100')}
                    />
                  }
                  items={p.weekMenu(row)}
                  align="start"
                />
              </div>
              {week ? <WeekFocusInput key={`${week.id}:${week.focus ?? ''}`} weekId={week.id} value={week.focus} onSaved={p.onFocusSaved} /> : null}
            </div>
            {days.map((day, col) => (
              <GridCell
                key={col}
                row={row}
                col={col}
                day={day}
                active={p.cursor.row === row && p.cursor.col === col}
                inRange={!!p.range && isInRange(p.range, row, col)}
                dropTarget={p.dropAt?.row === row && p.dropAt.col === col}
                label={`Semana ${row + 1}, ${DAY_LABELS_FULL[col]}: ${cellAriaText(day)}`}
                onPointerSelect={p.onPointerSelect}
                onOpen={p.onOpen}
                onDragStartCell={p.onDragStartCell}
                onDragOverCell={p.onDragOverCell}
                onDropCell={p.onDropCell}
                onDragLeaveCell={p.onDragLeaveCell}
              />
            ))}
            <div className="flex min-w-0 flex-col gap-1 border-b border-l border-v2-border bg-v2-surface px-2.5 py-2">
              {time ? (
                <span className="t-body font-semibold text-v2-fg t-tnum" title={v.open_sessions > 0 ? 'Al menos: algún entreno no escribe su duración' : undefined}>
                  {time}
                </span>
              ) : (
                <span className="t-meta text-v2-faint">{v.sessions > 0 ? `${v.sessions} ${v.sessions === 1 ? 'entreno' : 'entrenos'}` : '—'}</span>
              )}
              {parts.map((part) => (
                <span key={part.key} className="flex items-center gap-1.5 t-meta text-v2-muted t-tnum">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: `var(${MODALITY_META[part.key].colorVar})` }} />
                  {part.label}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
});
