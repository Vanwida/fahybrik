import type { MacroProgressPayload } from '@/lib/dashboard/coach/macro-progress';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import { ATR_PHASE_ORDER } from '@/lib/dashboard/constants/atr-phases';

interface MacroProgressRibbonProps {
  progress: MacroProgressPayload;
  compact?: boolean;
  /**
   * Coach-defined periodization phases (migration 0052). When provided, the pill
   * row iterates these (ordered by sequence_order) instead of the legacy ATR
   * triplet. Empty/omitted => legacy ACC/TRANS/REAL fallback (zero regression).
   */
  coachPhases?: ReadonlyArray<MethodologyPhase>;
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'var(--ok)',
  current: 'var(--accent)',
  upcoming: 'color-mix(in srgb, var(--muted) 35%, transparent)',
  missed: 'var(--danger)',
};

export function MacroProgressRibbon({
  progress,
  compact,
  coachPhases = [],
}: MacroProgressRibbonProps) {
  if (progress.weeks.length === 0) {
    return (
      <section className="card-surface px-4 py-3">
        <p className="text-xs text-[color:var(--muted)]">
          Sin semanas materializadas — asigna el primer mes para ver progreso.
        </p>
      </section>
    );
  }

  // Pill row data source. When the coach has configured phases (0052), iterate
  // those ordered by sequence_order; otherwise fall back to the legacy ATR
  // triplet (byte-for-byte identical to the previous BLOCK_PHASES render).
  // `code` is the compact badge text; `active` matches against progress.block
  // case-insensitively (coach seed codes are lowercase 'acc' vs legacy 'ACC').
  const activeCode = progress.block?.toUpperCase() ?? null;
  const phasePills =
    coachPhases.length > 0
      ? [...coachPhases]
          .sort((a, b) => a.sequence_order - b.sequence_order)
          .map((p) => {
            const code = p.code.toUpperCase();
            return { key: String(p.id), code, active: code === activeCode };
          })
      : ATR_PHASE_ORDER.map((code) => ({
          key: code,
          code,
          active: progress.block === code,
        }));

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
          {phasePills.map((phase) => (
            <span
              key={phase.key}
              className={`rounded-[var(--r-pill)] px-2 py-0.5 text-[9px] font-bold tracking-[0.08em] ${
                phase.active
                  ? 'bg-[color:var(--accent)] text-[color:var(--accent-on)]'
                  : 'border border-[color:var(--hairline)] text-[color:var(--muted)]'
              }`}
            >
              {phase.code}
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
