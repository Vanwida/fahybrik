'use client';

// Screen 6 · Panel ② Semanas — the weeks derived from the selected phase. Each
// week card carries a WeekStrip (7-day modality view), "Semana k · N sesiones"
// and the ATR load stage (entrada→carga→pico→descarga). Selected week rings in
// accent. The header is tinted by the phase to anchor the panel to its phase.

import { Pill } from '@/components/v2/Pill';
import { WeekStrip } from '@/components/v2/planes/WeekStrip';
import { LoadBar } from '@/components/v2/planes/parts';
import { EmptyState } from '@/components/v2/EmptyState';
import {
  weekSessionCount,
  type DayModalityInfo,
  type PlanPhase,
  type WeekLoad,
} from '@/lib/dashboard/v2/planes-model';
import { cn } from '@/lib/utils';

export function WeeksPanel({
  phase,
  weeks,
  loads,
  selectedIndex,
  onSelect,
}: {
  phase: PlanPhase | null;
  weeks: DayModalityInfo[][];
  loads: WeekLoad[];
  selectedIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <section
      className="flex flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]"
      aria-label="Semanas de la fase"
    >
      <header className="flex items-center justify-between gap-2 rounded-t-[var(--v2-r-l)] border-b border-[color:var(--v2-border)] bg-[color:var(--v2-accent-soft)] px-3 py-2.5">
        <h2 className="v2-micro" style={{ color: 'var(--v2-accent)' }}>
          {phase ? `Semanas · ${phase.name}` : 'Semanas'}
        </h2>
        {phase ? (
          <Pill tone="neutral" variant="soft">
            <span className="v2-num">{phase.week_count}</span>&nbsp;semanas
          </Pill>
        ) : null}
      </header>

      <div className="flex flex-col gap-1.5 p-1.5">
        {weeks.length === 0 ? (
          <EmptyState
            icon="event_busy"
            title="Sin fase seleccionada"
            className="border-none py-10"
          />
        ) : (
          weeks.map((week, i) => {
            const active = i === selectedIndex;
            const sessions = weekSessionCount(week);
            const load = loads[i];
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(i)}
                aria-pressed={active}
                className={cn(
                  'v2-focus rounded-[var(--v2-r-m)] border bg-[color:var(--v2-surface)] p-2.5 text-left transition-colors',
                  active
                    ? 'border-[color:var(--v2-accent)] ring-1 ring-[color:var(--v2-accent)]'
                    : 'border-[color:var(--v2-border)] hover:border-[color:var(--v2-border-strong)]',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
                    Semana {i + 1}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {load ? (
                      <span className="text-[10px] font-semibold text-[color:var(--v2-muted)]">
                        {load.label}
                      </span>
                    ) : null}
                    <span className="v2-num text-[11px] text-[color:var(--v2-faint)]">
                      {sessions} ses
                    </span>
                  </div>
                </div>

                <div className="mt-2">
                  <WeekStrip days={week} size="sm" showLabels />
                </div>

                {load ? (
                  <div className="mt-2">
                    <LoadBar load={load} />
                  </div>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
