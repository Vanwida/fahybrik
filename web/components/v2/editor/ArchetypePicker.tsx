'use client';

// ArchetypePicker — the archetype selector (UX pase §2). Opened as an OVERLAY/SHEET
// from "Añadir bloque": the coach sees TYPE CARDS (icon + name + one-line purpose),
// not a board of axes. Ordered by real-plan frequency; the corner badge shows the
// honest frequency ("104×", "clave", "raro"). Picking one creates a block
// PRE-SEEDED with that archetype's modality/measure/target/scheme defaults — a
// ready tailored form, never empty toggles.
//
// Closes on Escape / scrim click; focus-trapped to the dialog. The 9 archetypes
// are the sport's session vocabulary (agnostic to methodology). Deferred types
// (HYROX-sim template / Test specifics) are NOT dead tiles — they route to their
// base form and carry a flag the orchestrator surfaces.

import { useEffect, useRef } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { ARCHETYPES, type Archetype, type ArchetypeId } from '@/lib/dashboard/v2/archetypes';

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

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
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
  );
}

/** The 9 archetype cards + the agnostic footnote — reused by the standalone
 *  picker AND the AddBlockModal's "create from scratch" tab. */
export function ArchetypeGrid({ onPick }: { onPick: (id: ArchetypeId) => void }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {ARCHETYPES.map((a) => (
          <ArchetypeCard key={a.id} archetype={a} onPick={() => onPick(a.id)} />
        ))}
      </div>
      <p className="mt-3.5 flex items-start gap-1.5 px-1 text-[11.5px] leading-snug text-[color:var(--v2-faint)]">
        <MIcon name="info" size={13} className="mt-px shrink-0 text-[color:var(--v2-accent)]" />
        <span>
          Los tipos son <b className="font-semibold text-[color:var(--v2-muted)]">vocabulario del deporte</b>,
          iguales para todo coach. La fase / grupo de tu método se etiqueta aparte — el tipo nunca
          depende de tu metodología.
        </span>
      </p>
    </>
  );
}

function ArchetypeCard({
  archetype,
  onPick,
}: {
  archetype: Archetype;
  onPick: () => void;
}) {
  const { name, purpose, icon, modalitySlug, frequency, deferred } = archetype;
  return (
    <button
      type="button"
      onClick={onPick}
      className="v2-focus group relative flex flex-col rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3.5 text-left transition-colors hover:border-[color:var(--v2-border-strong)]"
    >
      <span className="v2-num absolute right-3 top-3 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface-2)] px-1.5 py-0.5 text-[9.5px] font-bold text-[color:var(--v2-faint)]">
        {frequency}
      </span>
      <span
        aria-hidden
        className="mb-2.5 inline-flex h-9 w-9 items-center justify-center rounded-[var(--v2-r-s)]"
        style={{
          background: `var(--v2-mod-${modalitySlug}-soft)`,
          color: `var(--v2-mod-${modalitySlug})`,
        }}
      >
        <MIcon name={icon} size={20} />
      </span>
      <span className="text-[13px] font-bold leading-tight text-[color:var(--v2-fg)]">{name}</span>
      <span className="mt-1 text-[11px] leading-snug text-[color:var(--v2-muted)]">{purpose}</span>
      {deferred ? (
        <span
          className={cn(
            'mt-2 inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-warn-soft)] px-1.5 py-0.5',
            'text-[9.5px] font-bold uppercase tracking-wide text-[color:var(--v2-warn)]',
          )}
        >
          <MIcon name="schedule" size={11} />
          base · plantilla próx.
        </span>
      ) : null}
    </button>
  );
}
