// CARD 5 — AVISOS POR CONFIRMAR. Eyebrow = a warning-tint gate chip
// "GATE · {acked}/{total} CONFIRMADOS". One row per warning with a severity
// left-stripe (danger for critical, amber otherwise), leading icon + bold label
// + severity chip + detail inline, and the acknowledge control as a natural
// TRAILING control inside the row (vertically centered, never stranded
// far-right with a dead gap). The critical A-event warning shows a muted
// "Se resuelve al anclar el evento" instead of a confirm — it clears
// automatically when the event is anchored (matching current gate logic).
// ackedWarnings state + allWarningsAcked gate preserved from IntakeDecision.

import { cn } from '@/lib/utils';
import { MIcon } from '@/components/ui/MIcon';
import { StatusChip } from '@/components/dashboard/ui';
import type { IntakeWarning } from '@/lib/coach/intake';
import { DecisionCard } from '../ui/DecisionCard';

/** True for the critical A-event warning that resolves by anchoring the event. */
export function isEventResolvedWarning(w: IntakeWarning): boolean {
  return w.severity === 'critical' && w.kind.startsWith('a_event');
}

export function WarningsCard({
  warnings,
  acked,
  ackedCount,
  hasEvent,
  onToggle,
}: {
  warnings: IntakeWarning[];
  acked: Set<string>;
  /** Number of warnings considered confirmed (for the gate chip count). */
  ackedCount: number;
  hasEvent: boolean;
  onToggle: (kind: string) => void;
}) {
  if (warnings.length === 0) return null;

  const total = warnings.length;
  const allAcked = ackedCount >= total;

  const eyebrow = (
    <StatusChip
      tier={allAcked ? 'success' : 'warning'}
      icon={allAcked ? 'shield' : 'shield'}
      label={`Gate · ${ackedCount}/${total} confirmados`}
    />
  );

  return (
    <DecisionCard
      step={5}
      title="Avisos por confirmar"
      eyebrow={eyebrow}
      subline="Confirma cada aviso para poder asignar."
    >
      <ul className="flex flex-col gap-2.5">
        {warnings.map((w) => (
          <WarningRow
            key={w.kind}
            warning={w}
            acked={acked.has(w.kind)}
            hasEvent={hasEvent}
            onToggle={() => onToggle(w.kind)}
          />
        ))}
      </ul>
    </DecisionCard>
  );
}

function WarningRow({
  warning,
  acked,
  hasEvent,
  onToggle,
}: {
  warning: IntakeWarning;
  acked: boolean;
  hasEvent: boolean;
  onToggle: () => void;
}) {
  const critical = warning.severity === 'critical';
  const resolvesByEvent = isEventResolvedWarning(warning);
  const resolved = resolvesByEvent && hasEvent;

  return (
    <li
      className={cn(
        'relative flex flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden rounded-[var(--r-m)] border border-[color:var(--border-subtle)] py-3 pl-4 pr-3.5 transition-opacity',
        critical
          ? 'bg-[color:color-mix(in_srgb,var(--danger)_5%,var(--surface-card))]'
          : 'bg-[color:color-mix(in_srgb,var(--warning)_5%,var(--surface-card))]',
        (acked || resolved) && 'opacity-60',
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: critical ? 'var(--danger)' : 'var(--warning)' }}
      />
      <MIcon
        name={critical ? 'priority_high' : 'info'}
        size={20}
        className={cn('shrink-0', critical ? 'text-[color:var(--danger)]' : 'text-[color:var(--warning)]')}
        aria-hidden
      />
      <span
        className={cn(
          'text-[13.5px] font-bold text-[color:var(--fg)]',
          (acked || resolved) && 'line-through',
        )}
      >
        {warning.label}
      </span>
      <StatusChip
        tier={critical ? 'error' : 'warning'}
        label={critical ? 'Crítico' : 'Aviso'}
      />
      <span className="basis-full text-[12.5px] text-[color:var(--text-muted)]">
        {warning.detail}
      </span>

      <div className="ml-auto flex shrink-0 items-center self-center">
        {resolvesByEvent ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] italic text-[color:var(--text-muted)]">
            <MIcon name="arrow_upward" size={14} className="opacity-70" aria-hidden />
            Se resuelve al anclar el evento
          </span>
        ) : (
          <label
            className={cn(
              'focus-within:ring-2 focus-within:ring-[color:var(--accent)] inline-flex cursor-pointer items-center gap-2 rounded-[var(--r-s)] border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] transition-colors',
              acked
                ? 'border-[color:color-mix(in_srgb,var(--ok)_40%,var(--border-subtle))] bg-[color:var(--ok-tint)] text-[color:var(--ok)]'
                : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] text-[color:var(--fg)] hover:border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))]',
            )}
          >
            <input
              type="checkbox"
              checked={acked}
              onChange={onToggle}
              aria-label={`Confirmar aviso: ${warning.label}`}
              className="sr-only"
            />
            <MIcon name={acked ? 'check_circle' : 'check'} size={15} aria-hidden />
            {acked ? 'Confirmado' : 'Confirmar'}
          </label>
        )}
      </div>
    </li>
  );
}
