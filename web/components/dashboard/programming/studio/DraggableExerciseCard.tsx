'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { EXERCISE_CATEGORY_LABELS } from '@/lib/dashboard/exercises/filter-chips';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import { dragIdExercise } from '@/lib/dashboard/programming/studio-types';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

interface DraggableExerciseCardProps {
  exercise: CatalogExercise;
  /** When provided, renders an edit affordance that opens the catalog editor. */
  onEdit?: (exercise: CatalogExercise) => void;
}

export function DraggableExerciseCard({ exercise, onEdit }: DraggableExerciseCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragIdExercise(exercise.id),
    data: { type: 'exercise', exercise },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const tag = EXERCISE_CATEGORY_LABELS[exercise.category] ?? exercise.category;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'flex cursor-grab touch-none items-center gap-2 rounded-[var(--r-l)] border border-[color:var(--border-subtle)]',
        'bg-[color:var(--surface-card)] px-3 py-2.5 active:cursor-grabbing',
        'hover:border-[color:var(--primary-container)]',
        isDragging && 'opacity-50 ring-2 ring-[color:var(--primary-container)]',
      )}
    >
      <div
        className="flex shrink-0 flex-col gap-0.5 px-1 text-[color:var(--text-muted)]"
        aria-hidden
      >
        <span className="block h-0.5 w-3 rounded bg-current" />
        <span className="block h-0.5 w-3 rounded bg-current" />
        <span className="block h-0.5 w-3 rounded bg-current" />
      </div>
      <div className="min-w-0 flex-1 pointer-events-none">
        <p className="truncate text-sm font-semibold text-[color:var(--fg)]">{exercise.name}</p>
        <span className="mt-1 inline-block rounded bg-[color:var(--surface-container-high)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
          {tag}
        </span>
      </div>
      {onEdit ? (
        <button
          type="button"
          aria-label={`Editar ${exercise.name}`}
          // Stop the drag sensor from claiming this pointer interaction so the
          // edit button stays clickable inside the draggable card.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(exercise);
          }}
          className={cn(
            'focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)]',
            'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--accent)]',
          )}
        >
          <MIcon name="edit" size={16} />
        </button>
      ) : null}
    </div>
  );
}
