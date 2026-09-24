'use client';

// Una celda de la rejilla del programa: lo que el atleta hace ese día, legible
// sin abrirla — el título del entreno y sus bloques con letra y dosis compacta.
// Descanso es un ESTADO del día (se pinta como tal), no una celda vacía. La celda
// no guarda nada: pinta y avisa (seleccionar, abrir, arrastrar, soltar).

import { memo, type DragEvent, type MouseEvent } from 'react';
import { Moon, Plus } from 'lucide-react';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import { MODALITY_META } from '@/components/v2/constants';
import { summarizeCell } from '@/lib/dashboard/programming/cell-summary';
import { cn } from '@/lib/utils';

const MAX_LINES = 5;

export interface GridCellProps {
  row: number;
  col: number;
  day: WeekDay;
  active: boolean;
  inRange: boolean;
  dropTarget: boolean;
  label: string;
  onPointerSelect: (row: number, col: number, e: MouseEvent) => void;
  onOpen: (row: number, col: number) => void;
  onDragStartCell: (row: number, col: number, e: DragEvent) => void;
  onDragOverCell: (row: number, col: number, e: DragEvent) => void;
  onDropCell: (row: number, col: number, e: DragEvent) => void;
  onDragLeaveCell: () => void;
}

export const GridCell = memo(function GridCell({
  row,
  col,
  day,
  active,
  inRange,
  dropTarget,
  label,
  onPointerSelect,
  onOpen,
  onDragStartCell,
  onDragOverCell,
  onDropCell,
  onDragLeaveCell,
}: GridCellProps) {
  const s = summarizeCell(day);
  const lines = s.entrenos.flatMap((e, ei) => [
    ...(e.title ? [{ key: `t${ei}`, kind: 'title' as const, text: e.title }] : []),
    ...e.lines.map((l, li) => ({ key: `l${ei}-${li}`, kind: 'line' as const, letter: l.letter, text: l.text, optional: l.optional })),
  ]);
  const shown = lines.slice(0, MAX_LINES);
  const hidden = lines.length - shown.length;
  const stripe = s.modality ? `var(${MODALITY_META[s.modality].colorVar})` : null;

  return (
    <div
      role="gridcell"
      aria-selected={active || inRange}
      aria-label={label}
      data-row={row}
      data-col={col}
      draggable={s.state === 'workout'}
      onMouseDown={(e) => onPointerSelect(row, col, e)}
      onDoubleClick={() => onOpen(row, col)}
      onDragStart={(e) => onDragStartCell(row, col, e)}
      onDragOver={(e) => onDragOverCell(row, col, e)}
      onDragLeave={onDragLeaveCell}
      onDrop={(e) => onDropCell(row, col, e)}
      className={cn(
        'group/cell relative min-h-[96px] min-w-0 cursor-default select-none border-b border-l border-v2-border px-2.5 py-2 text-left',
        'transition-[background-color] duration-[var(--v2-dur-fast)]',
        inRange ? 'bg-v2-select' : 'bg-v2-surface hover:bg-v2-hover',
        active && 'z-[1] shadow-[inset_0_0_0_2px_var(--v2-accent)]',
        dropTarget && 'shadow-[inset_0_0_0_2px_var(--v2-info)]',
      )}
    >
      {stripe ? (
        <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full" style={{ backgroundColor: stripe }} />
      ) : null}
      {s.state === 'rest' ? (
        <span className="inline-flex items-center gap-1.5 t-meta text-v2-faint">
          <Moon aria-hidden className="size-3.5" strokeWidth={1.75} />
          Descanso
        </span>
      ) : s.state === 'empty' ? (
        <Plus
          aria-hidden
          strokeWidth={1.75}
          className={cn('size-4 text-v2-faint opacity-0 transition-opacity group-hover/cell:opacity-100', active && 'opacity-100')}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-0.5">
          {shown.map((l) =>
            l.kind === 'title' ? (
              <p key={l.key} className="line-clamp-2 break-words text-[12px] leading-4 font-semibold text-v2-fg">
                {l.text}
              </p>
            ) : (
              <p key={l.key} className={cn('flex min-w-0 gap-1.5 text-[12px] leading-4 text-v2-muted', l.optional && 'opacity-70')}>
                <span aria-hidden className="w-2.5 shrink-0 font-semibold text-v2-faint">
                  {l.letter}
                </span>
                <span className="line-clamp-2 min-w-0 break-words t-tnum">{l.text}</span>
              </p>
            ),
          )}
          {hidden > 0 ? <p className="pl-4 text-[12px] leading-4 text-v2-faint">+{hidden} más</p> : null}
        </div>
      )}
    </div>
  );
});
