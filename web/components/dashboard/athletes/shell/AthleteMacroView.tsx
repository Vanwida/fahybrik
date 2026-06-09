'use client';

// Zoom MACRO del calendario del atleta (UX redesign §2b): ribbon ATR con la
// semana actual marcada y los microciclos asignados como tramos (click en
// tramo → zoom a Mes), overlay de cumplimiento semana a semana y el panel de
// asignación/aprobación de bloques ATR.

import type { AthletePlanPayload } from '@/lib/dashboard/coach/athlete-plan';
import type { AthleteBlocksView } from '@/lib/dashboard/coach/assign-block';
import { MacroPhaseRibbon } from '@/components/dashboard/athletes/MacroPhaseRibbon';
import { AssignBlockPanel } from '@/components/dashboard/athletes/AssignBlockPanel';
import { cn } from '@/lib/utils';

interface AthleteMacroViewProps {
  plan: AthletePlanPayload;
  blockWeek: number | null;
  blocksView: AthleteBlocksView | null;
  /** Click en un tramo asignado del ribbon → zoom a Mes (spec §2b). */
  onZoomToMonth: () => void;
  onBlockAssigned: () => void;
}

function complianceFillClass(pct: number | null): string {
  if (pct == null) return 'bg-[color:var(--surface-container-high)]';
  if (pct >= 80) return 'bg-[color:var(--status-success)]';
  if (pct >= 50) return 'bg-[color:var(--status-warning)]';
  return 'bg-[color:var(--danger)]';
}

export function AthleteMacroView({
  plan,
  blockWeek,
  blocksView,
  onZoomToMonth,
  onBlockAssigned,
}: AthleteMacroViewProps) {
  const weeks = plan.macro.weeks;

  return (
    <div className="grid gap-6">
      <MacroPhaseRibbon
        progress={plan.macro}
        blockWeek={blockWeek}
        onSelectPhase={({ assignment }) => {
          if (assignment) onZoomToMonth();
        }}
      />

      {/* Overlay de cumplimiento por semana (estándar TrainingPeaks): lo
          planificado y lo hecho en la misma superficie, también en Macro. */}
      {weeks.length > 0 ? (
        <section
          aria-label="Cumplimiento por semana del macrociclo"
          className="rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-4"
        >
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <span className="micro-label">Cumplimiento semana a semana</span>
            <span className="text-[10px] text-[color:var(--text-muted)]">
              {weeks.length} semanas asignadas
            </span>
          </div>
          <ol className="flex flex-wrap gap-1.5">
            {weeks.map((w) => {
              const isCurrent = w.status === 'current';
              const label =
                w.compliance_pct != null
                  ? `Semana del ${w.week_start}: ${w.compliance_pct}% cumplido`
                  : `Semana del ${w.week_start}: sin datos`;
              return (
                <li key={w.week_start}>
                  <span
                    role="img"
                    aria-label={label}
                    title={label}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-[var(--r-s)]',
                      complianceFillClass(w.compliance_pct),
                      w.status === 'upcoming' && 'opacity-25',
                      isCurrent &&
                        'ring-2 ring-[color:var(--accent)] ring-offset-1 ring-offset-[color:var(--surface-card)]',
                    )}
                  >
                    <span className="metric-num text-[8px] font-bold text-[color:var(--bg)]">
                      {w.compliance_pct != null ? w.compliance_pct : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <AssignBlockPanel
        athlete_id={plan.athlete_id}
        initial={blocksView}
        onAssigned={onBlockAssigned}
      />
    </div>
  );
}
