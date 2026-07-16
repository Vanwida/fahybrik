'use client';

// ArchetypePicker — the block-type chooser. Opened as an OVERLAY/SHEET from
// "Añadir bloque": the coach sees clean TYPE CARDS (icon + name), not a board of
// axes and not a wall of descriptions. Picking one creates a block PRE-SEEDED with
// that type's modality/measure/target/scheme defaults — a ready form, never empty
// toggles.
//
// Closes on Escape / scrim click; focus-trapped to the dialog (via ModalPortal).
// The types are the sport's session vocabulary (agnostic to methodology — the
// block type is a sport fact, never a phase/method concept).

import { useRef } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { ARCHETYPES, type Archetype, type ArchetypeId } from '@/lib/dashboard/v2/archetypes';
import { ModalPortal } from './ModalPortal';

export function ArchetypePicker({
  destinationLabel,
  onPick,
  onClose,
}: {
  /** e.g. "principal" / "Calentamiento" — shown in the header sub-line. */
  destinationLabel: string;
  onPick: (id: ArchetypeId) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  return (
    <ModalPortal onEscape={onClose}>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-label="Elegir tipo de bloque"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="v2-focus flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="v2-display text-xl">
              Añadir bloque <span className="text-[color:var(--v2-muted)]">· {destinationLabel}</span>
            </h2>
            <p className="v2-micro mt-0.5">¿Qué tipo de trabajo es?</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancelar"
            className="v2-focus flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ArchetypeGrid onPick={onPick} />
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

/** The block-type cards (icon + name, no descriptions) — reused by the standalone
 *  picker AND the AddBlockModal type chooser. */
export function ArchetypeGrid({ onPick }: { onPick: (id: ArchetypeId) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {ARCHETYPES.map((a) => (
        <ArchetypeCard key={a.id} archetype={a} onPick={() => onPick(a.id)} />
      ))}
    </div>
  );
}

function ArchetypeCard({
  archetype,
  onPick,
}: {
  archetype: Archetype;
  onPick: () => void;
}) {
  const { name, icon, modalitySlug } = archetype;
  return (
    <button
      type="button"
      onClick={onPick}
      className="v2-focus group flex items-center gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3 text-left transition-colors hover:border-[color:var(--v2-border-strong)]"
    >
      <span
        aria-hidden
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--v2-r-s)]"
        style={{
          background: `var(--v2-mod-${modalitySlug}-soft)`,
          color: `var(--v2-mod-${modalitySlug})`,
        }}
      >
        <MIcon name={icon} size={20} />
      </span>
      <span className="text-sm font-bold leading-tight text-[color:var(--v2-fg)]">{name}</span>
    </button>
  );
}
