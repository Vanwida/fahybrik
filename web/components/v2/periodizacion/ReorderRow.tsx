'use client';

// ReorderRow — the shared row shell for the Niveles ordered list (and the in-editor
// microciclo chain reuses the same pattern).
// It owns the reorder affordances (drag grip + ↑/↓ arrow fallback) and the row
// chrome; callers pass the row body + the right-side actions. Drag-and-drop is
// the premium path; the arrows guarantee keyboard + touch accessibility (the
// approved pass, decision 4). Lists are short (3–6 rows) so both fit cleanly.

import { useCallback } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export function ReorderRow({
  index,
  total,
  onMove,
  selected = false,
  leadingRail,
  children,
  actions,
  className,
}: {
  index: number;
  total: number;
  /** Move this row from `index` to `index + delta` (delta = -1 | +1). */
  onMove: (index: number, delta: -1 | 1) => void;
  /** Highlight (the row currently being edited). */
  selected?: boolean;
  /** Optional left color rail (phase role); a CSS color string. */
  leadingRail?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  // Native HTML5 drag reorder — dropping over a row moves the dragged row to
  // that position. The dragged index travels in the dataTransfer payload.
  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', String(index));
      e.dataTransfer.effectAllowed = 'move';
    },
    [index],
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const from = Number.parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!Number.isFinite(from) || from === index) return;
      // Translate an arbitrary from→to into repeated single steps so the parent
      // only needs to implement adjacent swaps.
      const delta: -1 | 1 = from < index ? 1 : -1;
      let cur = from;
      while (cur !== index) {
        onMove(cur, delta);
        cur += delta;
      }
    },
    [index, onMove],
  );

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'relative flex items-center gap-3.5 rounded-[var(--v2-r-m)] border bg-[color:var(--v2-surface)] px-3.5 py-3 transition-colors',
        selected
          ? 'border-[color:var(--v2-accent)]'
          : 'border-[color:var(--v2-border)] hover:border-[color:var(--v2-border-strong)]',
        leadingRail ? 'pl-[18px]' : undefined,
        className,
      )}
    >
      {/* role color rail (phases only) */}
      {leadingRail ? (
        <span
          aria-hidden
          className="absolute bottom-2 left-0 top-2 w-1 rounded-r-[3px]"
          style={{ background: leadingRail }}
        />
      ) : null}

      {/* drag grip */}
      <span
        className="shrink-0 cursor-grab select-none text-[color:var(--v2-faint)] active:cursor-grabbing"
        title="Arrastra para reordenar"
        aria-hidden
      >
        <MIcon name="drag_indicator" size={18} />
      </span>

      {/* arrow fallback (keyboard / touch) */}
      <div className="flex shrink-0 flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onMove(index, -1)}
          disabled={isFirst}
          aria-label="Subir"
          className={cn(
            'v2-focus flex h-[15px] w-[22px] items-center justify-center rounded-[4px] border border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors',
            isFirst
              ? 'cursor-not-allowed opacity-30'
              : 'hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
          )}
        >
          <MIcon name="keyboard_arrow_up" size={14} />
        </button>
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={isLast}
          aria-label="Bajar"
          className={cn(
            'v2-focus flex h-[15px] w-[22px] items-center justify-center rounded-[4px] border border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors',
            isLast
              ? 'cursor-not-allowed opacity-30'
              : 'hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
          )}
        >
          <MIcon name="keyboard_arrow_down" size={14} />
        </button>
      </div>

      <div className="min-w-0 flex-1">{children}</div>

      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Small square icon button used for row actions (edit / delete). */
export function RowIconButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'v2-focus flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] transition-colors',
        danger
          ? 'hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)]'
          : 'hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
      )}
    >
      <MIcon name={icon} size={15} />
    </button>
  );
}
