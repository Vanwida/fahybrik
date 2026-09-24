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
import { ChevronsUpDown, CircleAlert } from 'lucide-react';
import { Button } from '@/components/v2/ui';
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
      <Button
        size={compact ? 'md' : 'lg'}
        onClick={() => setOpen(true)}
        aria-label={hasExercise ? `Cambiar ejercicio (${item.exercise_name})` : 'Elegir ejercicio del catálogo'}
        className={cn(
          'w-full justify-start gap-2 px-2.5 font-normal',
          hasExercise ? 'border-v2-border' : 'border-v2-danger text-v2-danger hover:border-v2-danger',
        )}
      >
        {hasExercise ? (
          <>
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: `var(--v2-mod-${slug})` }} />
            <span className="min-w-0 flex-1 truncate text-left text-v2-fg">{item.exercise_name || 'Ejercicio'}</span>
            <ChevronsUpDown aria-hidden strokeWidth={1.75} className="text-v2-faint" />
          </>
        ) : (
          <>
            <CircleAlert aria-hidden strokeWidth={2} />
            <span className="min-w-0 flex-1 truncate text-left">Elegir ejercicio del catálogo</span>
            <ChevronsUpDown aria-hidden strokeWidth={1.75} />
          </>
        )}
      </Button>

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
