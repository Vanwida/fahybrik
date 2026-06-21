'use client';

// CategoryRail — the left filter rail for Biblioteca. Two grouped axes:
//   · POR MODALIDAD — single-select including "Todas". Each row carries the
//     modality color dot (the categorical axis), so the rail teaches the color
//     legend used on the cards.
//   · POR OBJETIVO — toggleable single-select (click the active one again to
//     clear). Objective has no color axis; it reads as plain rows.
// Pure controlled presentation; the view owns the selected state.

import { MODALITY_META, type V2Modality } from '@/components/v2/constants';
import { cn } from '@/lib/utils';
import type {
  V2LibModalityFilter,
  V2LibObjective,
} from '@/lib/dashboard/v2/biblioteca-data';

type ModalityRailId = 'todas' | V2LibModalityFilter;

/** Dot color for a modality rail row. "Todas" + "Mixta" have no single hue. */
function dotVar(id: ModalityRailId): string | null {
  if (id === 'todas' || id === 'mixta') return null;
  const meta = MODALITY_META[id as V2Modality];
  return meta ? meta.colorVar : null;
}

export function CategoryRail({
  modality,
  onModality,
  objective,
  onObjective,
  modalityOptions,
  objectiveOptions,
}: {
  modality: ModalityRailId;
  onModality: (next: ModalityRailId) => void;
  objective: V2LibObjective | null;
  onObjective: (next: V2LibObjective | null) => void;
  modalityOptions: ReadonlyArray<{ id: ModalityRailId; label: string }>;
  objectiveOptions: ReadonlyArray<{ id: V2LibObjective; label: string }>;
}) {
  return (
    <nav aria-label="Filtrar biblioteca" className="flex flex-col gap-5 lg:sticky lg:top-2">
      {/* POR MODALIDAD */}
      <div className="flex flex-col gap-1.5">
        <p className="v2-micro px-1">Por modalidad</p>
        <ul className="flex flex-col gap-0.5">
          {modalityOptions.map((opt) => {
            const active = modality === opt.id;
            const dv = dotVar(opt.id);
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onModality(opt.id)}
                  className={cn(
                    'v2-focus flex w-full items-center gap-2 rounded-[var(--v2-r-s)] px-2 py-1.5 text-left text-[13px] font-medium transition-colors',
                    active
                      ? 'bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-fg)]'
                      : 'text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]',
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: dv ? `var(${dv})` : 'var(--v2-faint)',
                      opacity: dv ? 1 : 0.5,
                    }}
                  />
                  <span className="truncate">{opt.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* POR OBJETIVO */}
      <div className="flex flex-col gap-1.5">
        <p className="v2-micro px-1">Por objetivo</p>
        <ul className="flex flex-col gap-0.5">
          {objectiveOptions.map((opt) => {
            const active = objective === opt.id;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onObjective(active ? null : opt.id)}
                  className={cn(
                    'v2-focus flex w-full items-center justify-between gap-2 rounded-[var(--v2-r-s)] px-2 py-1.5 text-left text-[13px] font-medium transition-colors',
                    active
                      ? 'bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-fg)]'
                      : 'text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]',
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {active ? (
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: 'var(--v2-accent)' }}
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
