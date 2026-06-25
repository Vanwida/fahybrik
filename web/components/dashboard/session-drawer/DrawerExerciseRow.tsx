'use client';

// DrawerExerciseRow — one exercise inside a session-drawer block. Collapsed it
// reads as NATURAL LANGUAGE ("Back Squat — 5×5 @ 75% RM · descanso 2'");
// clicking EXPANDS it inline into PrescriptionEditorV2 (UX redesign §2b/§4 —
// never a nested modal). Read-only rows (Biblioteca Pablo) render the same
// line without the expand affordance.

import { useMemo, useState } from 'react';
import type { WeekDayPartItem } from '@fahybrid/shared/schema/program-templates';
import {
  legacyItemToPrescription,
  prescriptionToParams,
  safeParsePrescription,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import { itemSummaryLine } from '@/lib/dashboard/programming/part-summary';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/ui/MIcon';
import { PrescriptionEditorV2 } from './PrescriptionEditorV2';

export function DrawerExerciseRow({
  item,
  readOnly,
  expanded,
  onToggle,
  onChange,
  onRemove,
}: {
  item: WeekDayPartItem;
  /** Biblioteca Pablo: prescription is a read-only reference. */
  readOnly: boolean;
  expanded: boolean;
  onToggle: (open: boolean) => void;
  onChange: (item: WeekDayPartItem) => void;
  onRemove: () => void;
}) {
  // "Variar por serie" lives here (not in the editor) so it survives the
  // editor re-rendering on every keystroke.
  const [perSetOpen, setPerSetOpen] = useState(false);

  // The STRUCTURED prescription is the editor's source of truth. Legacy items
  // (params_json + notes only) get one DERIVED in-memory — storage is not
  // mutated until the coach actually edits.
  const prescription: Prescription = useMemo(() => {
    if (item.prescription_json) return item.prescription_json as Prescription;
    return legacyItemToPrescription({
      params_json: (item.params_json ?? null) as Record<string, unknown> | null,
      notes: item.notes ?? null,
    });
  }, [item.prescription_json, item.params_json, item.notes]);

  // On edit: validate client-side (server re-validates), then write BOTH the
  // structured prescription_json and the derived scalar params_json so every
  // legacy reader (row summaries, materializer, iOS) keeps working.
  const applyPrescription = (next: Prescription) => {
    const parsed = safeParsePrescription(next);
    if (!parsed.success) return; // never persist an invalid shape
    const valid = parsed.data as Prescription;
    onChange({
      ...item,
      prescription_json: valid,
      params_json: prescriptionToParams(valid),
    });
  };

  const rxText = itemSummaryLine(item);
  const editorId = `rx-${item.uid}`;

  if (readOnly) {
    return (
      <div className="flex items-center gap-3 border-b border-[color:var(--border-subtle)] px-4 py-2.5 last:border-b-0">
        <span className="shrink-0 text-[13px] font-semibold text-[color:var(--fg)]">
          {item.exercise_name}
        </span>
        <span className="metric-num min-w-0 truncate text-xs text-[color:var(--text-muted)]">
          {rxText}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border-b border-[color:var(--border-subtle)] last:border-b-0',
        expanded && 'border-l-2 border-l-[color:var(--accent)]',
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(!expanded)}
        aria-expanded={expanded}
        aria-controls={editorId}
        aria-label={
          expanded
            ? `${item.exercise_name} — contraer editor`
            : `${item.exercise_name} — expandir editor`
        }
        className={cn(
          'focus-ring flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-container-low)]',
          expanded && 'bg-[color:var(--surface-container-low)]',
        )}
      >
        <span className="shrink-0 text-[13px] font-semibold text-[color:var(--fg)]">
          {item.exercise_name}
        </span>
        <span className="metric-num min-w-0 truncate text-xs text-[color:var(--text-muted)]">
          {rxText}
        </span>
        <MIcon
          name="expand_more"
          size={18}
          aria-hidden
          className={cn(
            'ml-auto shrink-0 text-[color:var(--text-muted)] transition-transform',
            expanded && 'rotate-180 text-[color:var(--fg)]',
          )}
        />
      </button>

      {expanded ? (
        <div id={editorId}>
          <PrescriptionEditorV2
            value={prescription}
            exerciseName={item.exercise_name}
            expandedPerSet={perSetOpen}
            onTogglePerSet={setPerSetOpen}
            onChange={applyPrescription}
            onRemove={onRemove}
            onDone={() => onToggle(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
