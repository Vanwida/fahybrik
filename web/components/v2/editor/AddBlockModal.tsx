'use client';

// AddBlockModal — the "Añadir bloque" type chooser. A modal over a dimmed scrim
// opened from the day editor (and the session editor). The coach picks a TYPE
// (clean tiles: icon + name, no descriptions) and the block is created on the
// spot, pre-seeded with that type's valid prescription, and added to the
// destination. The coach then fills the exercises inline in the day. No library
// tab, no in-modal prescription form, no jargon — just "what type of block?".
//
// Closes on Escape / scrim click; focus-trapped to the dialog.

import { useEffect, useRef } from 'react';
import type { EditorBlock, StructureGroup } from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/ui/MIcon';
import { createBlockFromArchetype, type ArchetypeId } from '@/lib/dashboard/v2/archetypes';
import { ArchetypeGrid } from './ArchetypePicker';

export function AddBlockModal({
  destinationLabel,
  destinationGroup = 'principal',
  onClose,
  onAdd,
}: {
  /** e.g. "Sesión AM · Lunes 12" or "Calentamiento" — shown in the header. */
  destinationLabel: string;
  /** The structure group the new block lands in (drives the seed). */
  destinationGroup?: StructureGroup;
  onClose: () => void;
  onAdd: (block: EditorBlock) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape to close; focus the dialog on mount.
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Picking a type builds a ready, pre-seeded block and adds it immediately.
  const pick = (id: ArchetypeId) => onAdd(createBlockFromArchetype(id, destinationGroup));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-label="Añadir bloque"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="v2-focus flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="v2-display text-xl">Añadir bloque</h2>
            <p className="v2-micro mt-0.5 truncate">{destinationLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ArchetypeGrid onPick={pick} />
        </div>
      </div>
    </div>
  );
}
