'use client';

// Screen 6 · Panel ① Fases — the coach's periodization phases as selectable
// cards (name · N sem · published ● / borrador ✎). The selected phase rings in
// accent. Footer note explains week derivation; a dashed "+ definir fase" stub
// (no phase-create endpoint wired yet → TODO).

import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import type { PlanPhase } from '@/lib/dashboard/v2/planes-model';
import { cn } from '@/lib/utils';

export function PhasesPanel({
  phases,
  selectedId,
  onSelect,
}: {
  phases: PlanPhase[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section
      className="flex flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]"
      aria-label="Fases del plan"
    >
      <header className="border-b border-[color:var(--v2-border)] px-3 py-2.5">
        <h2 className="v2-micro">Fases</h2>
      </header>

      <div className="flex flex-col gap-1.5 p-1.5">
        {phases.map((phase) => {
          const active = phase.id === selectedId;
          const draft = phase.status === 'draft';
          return (
            <button
              key={phase.id}
              type="button"
              onClick={() => onSelect(phase.id)}
              aria-pressed={active}
              className={cn(
                'v2-focus rounded-[var(--v2-r-m)] border bg-[color:var(--v2-surface)] p-2.5 text-left transition-colors',
                active
                  ? 'border-[color:var(--v2-accent)] ring-1 ring-[color:var(--v2-accent)]'
                  : 'border-[color:var(--v2-border)] hover:border-[color:var(--v2-border-strong)]',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
                  {phase.name}
                </span>
                {draft ? (
                  <span
                    className="text-[color:var(--v2-warn)]"
                    title="Borrador"
                    aria-label="Borrador"
                  >
                    <MIcon name="edit" size={15} />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: 'var(--v2-ok)' }}
                    title="Publicada"
                  />
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Pill tone="neutral" variant="soft">
                  <span className="v2-num">{phase.week_count}</span>&nbsp;sem
                </Pill>
                <Pill tone="info" variant="outline">
                  {phase.intensity_ceiling}
                </Pill>
              </div>
            </button>
          );
        })}

        {/* + definir fase (no create endpoint yet) */}
        <button
          type="button"
          // TODO(endpoint): wire to phase-create once the methodology_phases
          // mutation is exposed to web.
          className="v2-focus flex items-center justify-center gap-1.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] py-2.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="add" size={16} />
          Definir fase
        </button>
      </div>

      <p className="px-3 pb-3 text-[11px] leading-relaxed text-[color:var(--v2-faint)]">
        Las semanas se derivan de la duración de la fase.
      </p>
    </section>
  );
}
