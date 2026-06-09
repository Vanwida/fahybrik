import type { MacroProgressPayload } from '@/lib/dashboard/coach/macro-progress';

interface MacroProgressRibbonProps {
  progress: MacroProgressPayload;
  compact?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'var(--ok)',
  current: 'var(--accent)',
  upcoming: 'color-mix(in srgb, var(--muted) 35%, transparent)',
  missed: 'var(--danger)',
};

const BLOCK_PHASES = ['ACC', 'TRANS', 'REAL'] as const;

export function MacroProgressRibbon({ progress, compact }: MacroProgressRibbonProps) {
  if (progress.weeks.length === 0) {
    return (
      <section className="card-surface px-4 py-3">
        <p className="text-xs text-[color:var(--muted)]">
          Sin semanas materializadas — asigna el primer mes para ver progreso.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Progreso macrociclo" className="card-surface px-4 py-3">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--muted)]">
        <span>Macrociclo</span>
        <span>
          {progress.block ?? '—'}
          {!compact && progress.a_event_days != null ? ` · ${progress.a_event_days}d A-event` : ''}
          {!compact ? ` · ${progress.total_assigned_weeks} sem` : ''}
        </span>
      </div>
      {!compact ? (
        <div className="mt-2 flex gap-2">
          {BLOCK_PHASES.map((phase) => (
            <span
              key={phase}
              className={`rounded-[var(--r-pill)] px-2 py-0.5 text-[9px] font-bold tracking-[0.08em] ${
                progress.block === phase
                  ? 'bg-[color:var(--accent)] text-[color:var(--accent-on)]'
                  : 'border border-[color:var(--hairline)] text-[color:var(--muted)]'
              }`}
            >
              {phase}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
        {progress.weeks.map((w) => (
          <div
            key={w.week_start}
            title={`${w.week_start}${w.compliance_pct != null ? ` · ${Math.round(w.compliance_pct * 100)}%` : ''}${w.adjusted ? ' · ajuste IA' : ''}`}
            className="flex min-w-[24px] flex-col items-center gap-1"
          >
            <div
              className={`w-full min-w-[20px] rounded-[2px] ${compact ? 'h-5' : 'h-8'}`}
              style={{ background: STATUS_COLOR[w.status] ?? STATUS_COLOR.upcoming }}
            />
            {!compact ? (
              <span className="text-[9px] tabular-nums text-[color:var(--muted)]">
                {w.week_start.slice(5)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
