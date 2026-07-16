'use client';

// CategoryRail — the left filter rail for Biblioteca. Three grouped axes:
//   · POR MODALIDAD — single-select including "Todas". Each row carries the
//     modality color dot (the categorical axis), so the rail teaches the color
//     legend used on the cards.
//   · POR OBJETIVO — toggleable single-select (click the active one again to
//     clear). Objective has no color axis; it reads as plain rows.
//   · POR ESTADO — bloques only. NO es una preferencia de vista: es el trabajo
//     pendiente del coach (bloques sin dosis / sin tipar). Lleva el contador
//     porque el valor está en el número: "29 sin dosis" dice cuánto queda.
// Pure controlled presentation; the view owns the selected state.

import { MODALITY_META, type V2Modality } from '@/components/v2/constants';
import { cn } from '@/lib/utils';
import type {
  V2LibModalityFilter,
  V2LibObjective,
} from '@/lib/dashboard/v2/biblioteca-data';
import type { V2LibReadiness } from '@/lib/dashboard/v2/biblioteca-axes';

type ModalityRailId = 'todas' | V2LibModalityFilter;

const ROW_CLS =
  'v2-focus flex w-full items-center justify-between gap-2 rounded-[var(--v2-r-s)] px-2 py-1.5 text-left text-[13px] font-medium transition-colors';
const ROW_ACTIVE = 'bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-fg)]';
const ROW_IDLE =
  'text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]';

/**
 * Un eje de conmutar: selección única que se limpia al re-pulsar la activa.
 * Lo comparten OBJETIVO y ESTADO — misma mecánica, así que un solo sitio.
 */
function ToggleAxis<T extends string>({
  title,
  options,
  value,
  onChange,
  counts,
}: {
  title: string;
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T | null;
  onChange: (next: T | null) => void;
  /** Opcional: cuántos hay de cada uno. Un 0 se pinta igual — es información. */
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="v2-micro px-1">{title}</p>
      <ul className="flex flex-col gap-0.5">
        {options.map((opt) => {
          const active = value === opt.id;
          const n = counts?.[opt.id];
          return (
            <li key={opt.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? null : opt.id)}
                className={cn(ROW_CLS, active ? ROW_ACTIVE : ROW_IDLE)}
              >
                <span className="truncate">{opt.label}</span>
                {n != null ? (
                  <span className="v2-num shrink-0 text-[11px] text-[color:var(--v2-faint)]">
                    {n}
                  </span>
                ) : active ? (
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
  );
}

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
  showModality = true,
  readiness,
  onReadiness,
  readinessOptions,
  readinessCounts,
}: {
  modality: ModalityRailId;
  onModality: (next: ModalityRailId) => void;
  objective: V2LibObjective | null;
  onObjective: (next: V2LibObjective | null) => void;
  modalityOptions: ReadonlyArray<{ id: ModalityRailId; label: string }>;
  objectiveOptions: ReadonlyArray<{ id: V2LibObjective; label: string }>;
  /** Modality is an attribute of BLOQUES only — hidden on the other tabs. */
  showModality?: boolean;
  /** ESTADO — bloques only. Omitir las opciones oculta el eje entero. */
  readiness?: V2LibReadiness | null;
  onReadiness?: (next: V2LibReadiness | null) => void;
  readinessOptions?: ReadonlyArray<{ id: V2LibReadiness; label: string }>;
  readinessCounts?: Partial<Record<V2LibReadiness, number>>;
}) {
  return (
    <nav aria-label="Filtrar biblioteca" className="flex flex-col gap-5 lg:sticky lg:top-2">
      {/* POR MODALIDAD — bloques only */}
      {showModality ? (
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
      ) : null}

      {/* POR OBJETIVO */}
      <ToggleAxis
        title="Por objetivo"
        options={objectiveOptions}
        value={objective}
        onChange={onObjective}
      />

      {/* POR ESTADO — bloques only. Va al final: es trabajo pendiente, no una
          forma de clasificar el método. */}
      {readinessOptions && onReadiness ? (
        <ToggleAxis
          title="Por estado"
          options={readinessOptions}
          value={readiness ?? null}
          onChange={onReadiness}
          counts={readinessCounts}
        />
      ) : null}
    </nav>
  );
}
