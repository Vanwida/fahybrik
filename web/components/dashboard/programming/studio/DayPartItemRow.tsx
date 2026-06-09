'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WeekDayPartItem } from '@fahybrid/shared/schema/program-templates';
import { itemSummaryLine } from '@/lib/dashboard/programming/part-summary';
import type { SessionIndex } from '@/lib/dashboard/programming/studio-types';
import { sortIdItem } from '@/lib/dashboard/programming/studio-types';
import { cn } from '@/lib/utils';
import { DragGrip } from '@/components/dashboard/programming/studio/DragGrip';

interface DayPartItemRowProps {
  item: WeekDayPartItem;
  dayOfWeek: number;
  sessionIndex: SessionIndex;
  partUid: string;
  /** Group identity color (CSS token) of the parent block — paints the connecting rule. */
  groupColor: string;
  selected?: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

export function DayPartItemRow({
  item,
  dayOfWeek,
  sessionIndex,
  partUid,
  groupColor,
  selected,
  onSelect,
  onRemove,
}: DayPartItemRowProps) {
  const sortId = sortIdItem(dayOfWeek, sessionIndex, partUid, item.uid);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const summary = itemSummaryLine(item);

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
      className={cn(
        // Exercises are subordinate to the block: indented under a thin
        // connecting rule in the group color, lighter weight, no own border —
        // they read as "inside" the block, not as peer cards.
        'group/item relative flex items-center gap-1.5 rounded-[var(--r-sm)] py-1 pr-1 pl-2.5 text-left transition-colors',
        'hover:bg-[color:var(--surface-container-low)]',
        selected && 'bg-[color:var(--surface-container)] ring-1 ring-inset ring-[color:var(--accent)]',
        isDragging && 'opacity-60',
      )}
    >
      {/* Connecting rule in the group color: the visual "thread" to the block. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-px rounded-full opacity-50"
        style={{ backgroundColor: groupColor }}
      />
      <button
        type="button"
        className="focus-ring shrink-0 touch-none rounded-[var(--r-sm)] text-[color:var(--text-muted)] opacity-0 transition-opacity group-hover/item:opacity-100"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
        aria-label="Reordenar ejercicio"
      >
        <DragGrip />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold leading-tight tracking-tight text-[color:var(--fg)]">
          {item.exercise_name}
        </p>
        {summary && summary !== '—' ? (
          // Prescription values read like an instrument: monospaced + tabular so
          // reps / kg / %RM / pace / distance align in columns down the block
          // (shared .metric-num primitive — same readout language as the rest).
          <p className="metric-num truncate text-[10px] leading-tight text-[color:var(--on-surface-variant)]">
            {summary}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="focus-ring shrink-0 rounded-[var(--r-sm)] px-1 text-[10px] text-[color:var(--text-muted)] opacity-0 transition-opacity hover:text-[color:var(--danger)] group-hover/item:opacity-100"
        aria-label="Quitar ejercicio"
      >
        ✕
      </button>
    </div>
  );
}
