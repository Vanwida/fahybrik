'use client';

import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';
import { formatChipLabel, partSummary } from '@/lib/dashboard/programming/part-summary';
import { blockOriginInfo } from '@/lib/dashboard/programming/block-origin';
import { groupColorFor } from '@/lib/dashboard/programming/group-colors';
import type { SessionIndex, StudioSelection } from '@/lib/dashboard/programming/studio-types';
import { dropIdPart, sortIdItem, sortIdPart } from '@/lib/dashboard/programming/studio-types';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/dashboard/MIcon';
import { DayPartItemRow } from '@/components/dashboard/programming/studio/DayPartItemRow';
import { DragGrip } from '@/components/dashboard/programming/studio/DragGrip';

/** Prescripción del bloque de biblioteca sin la línea de modificadores. */
function blockPrescriptionPreview(coachNote: string | undefined): string {
  const note = coachNote ?? '';
  const sep = note.indexOf('\n\n— ');
  return (sep >= 0 ? note.slice(0, sep) : note) || 'Prescripción de biblioteca';
}

interface DayPartCardProps {
  part: WeekDayPart;
  dayOfWeek: number;
  sessionIndex: SessionIndex;
  selected: StudioSelection | null;
  onSelectPart: () => void;
  onSelectItem: (itemUid: string) => void;
  onRemovePart: () => void;
  onDuplicatePart: () => void;
  onRemoveItem: (itemUid: string) => void;
}

export function DayPartCard({
  part,
  dayOfWeek,
  sessionIndex,
  selected,
  onSelectPart,
  onSelectItem,
  onRemovePart,
  onDuplicatePart,
  onRemoveItem,
}: DayPartCardProps) {
  const sortId = sortIdPart(dayOfWeek, sessionIndex, part.uid);
  const {
    attributes,
    listeners,
    setNodeRef: setSortRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortId });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropIdPart(dayOfWeek, sessionIndex, part.uid),
  });

  const partSelected =
    selected?.target === 'part' &&
    selected.part_uid === part.uid &&
    selected.day_of_week === dayOfWeek &&
    selected.session_index === sessionIndex;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const origin = blockOriginInfo(part);
  // Color = methodology group (meaning, not decoration). Drives the left accent
  // bar + group chip. Ad-hoc/estructura blocks (no group) get the neutral hue.
  const group = groupColorFor(part.methodology_group_id);

  return (
    <div
      ref={setSortRef}
      style={style}
      className={cn(
        // A block reads as a CONTAINER: a header band over its exercises, with a
        // group-color left accent bar spanning the whole card.
        'relative overflow-hidden rounded-lg border bg-[color:var(--surface-card)] pl-2 transition-[border-color,box-shadow,transform] duration-150 motion-reduce:transition-none',
        partSelected
          ? 'border-[color:var(--accent)] shadow-[0_0_0_1px_var(--accent),0_8px_24px_-12px_rgba(240,106,42,0.45)]'
          : 'border-[color:var(--border-subtle)] hover:border-[color:var(--outline-variant)]',
        // Tactile lift while dragging the block.
        isDragging && 'opacity-80 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] ring-1 ring-[color:var(--accent)]/40',
      )}
    >
      {/* Group-color left accent bar — the block's identity stripe. A soft
          inward glow gives it depth without flattening the near-black card. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1.5"
        style={{
          backgroundColor: group.color,
          boxShadow: `2px 0 10px -2px ${group.color}`,
        }}
      />

      {/* Block header band: drag grip + uppercase title + format/group chips. */}
      <div className="flex items-start gap-1 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] px-1.5 py-1.5">
        <button
          type="button"
          className="focus-ring mt-px shrink-0 touch-none rounded-[var(--r-sm)]"
          {...attributes}
          {...listeners}
          aria-label="Reordenar bloque"
        >
          <DragGrip />
        </button>
        <button type="button" onClick={onSelectPart} className="focus-ring min-w-0 flex-1 rounded-[var(--r-sm)] text-left">
          <span className="flex flex-wrap items-center gap-1">
            <span className="min-w-0 flex-1 basis-full truncate text-[11px] font-bold uppercase leading-tight tracking-wide text-[color:var(--fg)]">
              {part.title}
            </span>
            {/* Format chip — structure/timing type. Text carries meaning, AA. */}
            <span className="shrink-0 rounded-[var(--r-pill)] bg-[color:var(--surface-container-high)] px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-[color:var(--on-surface-variant)]">
              {formatChipLabel(part.format)}
            </span>
            {/* Group chip — pedagogical group. The LABEL disambiguates, not color alone. */}
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-[var(--r-pill)] px-1.5 py-px text-[8px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: group.tint, color: group.color }}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              {group.label}
            </span>
            {/* Library/custom origin marker, kept secondary. */}
            <span
              className={cn(
                'shrink-0 rounded-[var(--r-pill)] px-1.5 py-px text-[8px] font-bold uppercase tracking-wider',
                origin.origin === 'library'
                  ? 'bg-[color:var(--accent)]/12 text-[color:var(--accent)]'
                  : 'bg-[color:var(--surface-container-high)] text-[color:var(--text-muted)]',
              )}
            >
              {origin.label}
            </span>
          </span>
          <span className="metric-num mt-1 block text-[10px] leading-tight text-[color:var(--text-muted)]">{partSummary(part)}</span>
        </button>
        <button
          type="button"
          onClick={onDuplicatePart}
          className="focus-ring shrink-0 rounded-[var(--r-sm)] p-1 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container-highest)] hover:text-[color:var(--fg)]"
          aria-label="Duplicar bloque"
          title="Duplicar bloque"
        >
          <MIcon name="content_copy" size={13} />
        </button>
        <button
          type="button"
          onClick={onRemovePart}
          className="focus-ring shrink-0 rounded-[var(--r-sm)] px-1 text-[10px] text-[color:var(--text-muted)] hover:text-[color:var(--danger)]"
          aria-label="Quitar bloque"
        >
          ✕
        </button>
      </div>

      <div
        ref={setDropRef}
        className={cn(
          'min-h-10 transition-colors',
          isOver && 'bg-[color:var(--accent)]/8 ring-1 ring-inset ring-[color:var(--accent)]/40',
        )}
      >
        <SortableContext
          items={part.items.map((item) =>
            sortIdItem(dayOfWeek, sessionIndex, part.uid, item.uid),
          )}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-0.5 px-1.5 py-1.5">
            {part.source_block_id != null && part.items.length === 0 ? (
              <p className="metric-num line-clamp-3 px-1 py-1.5 text-[11px] leading-snug text-[color:var(--on-surface-variant)]">
                {blockPrescriptionPreview(part.coach_note)}
              </p>
            ) : part.items.length === 0 ? (
              <p className="py-2 text-center text-[10px] font-medium text-[color:var(--text-muted)]">
                {isOver ? 'Soltar aquí' : 'Arrastra ejercicios'}
              </p>
            ) : (
              part.items.map((item) => {
                const itemSelected =
                  selected?.target === 'item' &&
                  selected.item_uid === item.uid &&
                  selected.part_uid === part.uid;

                return (
                  <DayPartItemRow
                    key={item.uid}
                    item={item}
                    dayOfWeek={dayOfWeek}
                    sessionIndex={sessionIndex}
                    partUid={part.uid}
                    groupColor={group.color}
                    selected={itemSelected}
                    onSelect={() => onSelectItem(item.uid)}
                    onRemove={() => onRemoveItem(item.uid)}
                  />
                );
              })
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
