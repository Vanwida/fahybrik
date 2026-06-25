'use client';

// ExercisePickerField — the SINGLE reusable affordance that replaces the
// free-text exercise name across the editor (ArchetypeBlockForm single-item +
// ComponentsForm components). It shows the picked exercise (name + modality dot)
// or an honest "Elegir del catálogo" call when the line has no exercise yet, and
// opens the ExercisePicker command-sheet. Picking sets the real exercise_id +
// inherits the exercise's intrinsic modality onto the line's prescription
// (mig 0053). This is the fix for A3 at the point the coach authors the line.
//
// DRY: one component, one place that maps a PickedExercise → EditorItem patch.

import { useState } from 'react';
import type { EditorItem } from '@/lib/dashboard/v2/editor-types';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { modalityColorSlug } from '@/lib/dashboard/v2/editor-axes';
import { withPickedExercise } from '@/lib/dashboard/v2/pick-exercise';
import { ExercisePicker, type PickedExercise } from './ExercisePicker';

export function ExercisePickerField({
  item,
  destinationLabel,
  defaultCategory,
  onChange,
  compact,
}: {
  item: EditorItem;
  /** Header sub-line in the picker, e.g. the block title / form name. */
  destinationLabel: string;
  /** Pre-selects the create-form category (from the block's dominant modality). */
  defaultCategory?: ExerciseCategory;
  /** Receives the item patch (exercise_id + name + modality-aligned prescription). */
  onChange: (patch: Partial<EditorItem>) => void;
  /** Tighter styling for inline use inside a component row. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasExercise = item.exercise_id != null && Number(item.exercise_id) > 0;
  const slug = modalityColorSlug(item.prescription.modality);

  const handlePick = (ex: PickedExercise) => {
    onChange(withPickedExercise(item, ex));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={hasExercise ? `Cambiar ejercicio (${item.exercise_name})` : 'Elegir ejercicio del catálogo'}
        className={cn(
          'v2-focus flex w-full items-center gap-2 rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface-2)] text-left transition-colors',
          compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
          hasExercise
            ? 'border-[color:var(--v2-border-strong)] hover:border-[color:var(--v2-accent)]'
            : 'border-[color:var(--v2-danger)] hover:border-[color:var(--v2-danger)]',
        )}
      >
        {hasExercise ? (
          <>
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: `var(--v2-mod-${slug})` }}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--v2-fg)]">
              {item.exercise_name || 'Ejercicio'}
            </span>
            <MIcon name="unfold_more" size={15} className="shrink-0 text-[color:var(--v2-faint)]" />
          </>
        ) : (
          <>
            <MIcon name="error" size={15} className="shrink-0 text-[color:var(--v2-danger)]" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--v2-danger)]">
              Elegir ejercicio del catálogo
            </span>
            <MIcon name="unfold_more" size={15} className="shrink-0 text-[color:var(--v2-danger)]" />
          </>
        )}
      </button>

      {open ? (
        <ExercisePicker
          destinationLabel={destinationLabel}
          defaultCategory={defaultCategory}
          onPick={handlePick}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
