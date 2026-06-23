'use client';

// MatrixCell — one cell of the Level × Days block matrix. Either renders a
// filled state (dark surface, block name, optional review dot) or an empty
// state (dashed border, "+" icon) to invite creation.

import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

export interface MatrixCellData {
  block_id: number;
  block_name: string;
  needs_review: boolean;
}

interface MatrixCellProps {
  cell: MatrixCellData | null;
  levelId: number;
  days: number;
  onClick: () => void;
}

export function MatrixCell({ cell, onClick }: MatrixCellProps) {
  if (cell) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={cell.block_name}
        className={cn(
          'v2-focus group relative flex h-full min-h-[72px] w-full flex-col items-start justify-between rounded-[var(--v2-r-s)]',
          'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2',
          'text-left transition-colors hover:border-[color:var(--v2-border-strong)] hover:bg-[color:var(--v2-surface-2)]',
        )}
      >
        <span className="line-clamp-3 text-[11px] font-medium leading-snug text-[color:var(--v2-fg)]">
          {cell.block_name}
        </span>
        {cell.needs_review ? (
          <span
            className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--v2-accent)]"
            title="Pendiente de revisión"
            aria-label="Pendiente de revisión"
          />
        ) : null}
        {/* Edit hint on hover */}
        <span className="pointer-events-none absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <MIcon name="edit" size={12} className="text-[color:var(--v2-muted)]" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Añadir bloque"
      className={cn(
        'v2-focus flex h-full min-h-[72px] w-full items-center justify-center rounded-[var(--v2-r-s)]',
        'border border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)]',
        'transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-muted)]',
      )}
    >
      <MIcon name="add" size={16} aria-hidden />
    </button>
  );
}
