'use client';

// AddBlockModal — the "Añadir bloque" type chooser. A modal over a dimmed scrim
// opened from the day editor (and the session editor). The coach picks a TYPE
// (clean tiles: icon + name, no descriptions) and the block is created on the
// spot, pre-seeded with that type's valid prescription, and added to the
// destination. The coach then fills the exercises inline in the day. No library
// tab, no in-modal prescription form, no jargon — just "what type of block?".
//
// Closes on Escape / scrim click; focus-trapped (Dialog del panel).

import type { EditorBlock, StructureGroup } from '@/lib/dashboard/v2/editor-types';
import { createBlockFromArchetype, type ArchetypeId } from '@/lib/dashboard/v2/archetypes';
import { Dialog } from '@/components/v2/ui';
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
  // Picking a type builds a ready, pre-seeded block and adds it immediately.
  const pick = (id: ArchetypeId) => onAdd(createBlockFromArchetype(id, destinationGroup));

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Añadir bloque"
      description={destinationLabel}
    >
      <ArchetypeGrid onPick={pick} />
    </Dialog>
  );
}
