// RosterStatusDot — colored ● + label for a roster row's derived status. The
// shared StatusDot primitive only models the Hoy lane states (and maps `alta` to
// danger), so the roster — which has its own four-state model (activa · atención
// · nuevo · sin plan) — uses this thin dot driven by ROSTER_STATUS_META. Color is
// always paired with the text label (never color alone) for a11y.

import { ROSTER_STATUS_META, type RosterStatus } from '@/lib/dashboard/v2/atletas-status';
import { cn } from '@/lib/utils';

export function RosterStatusDot({
  status,
  detail,
  showLabel = true,
  className,
}: {
  status: RosterStatus;
  /** Optional qualifier appended after the label, e.g. "Lesión" → "En pausa · Lesión". */
  detail?: string | null;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = ROSTER_STATUS_META[status];
  const label = detail ? `${meta.label} · ${detail}` : meta.label;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: `var(${meta.colorVar})` }}
      />
      {showLabel ? (
        <span className="truncate text-xs font-medium text-[color:var(--v2-fg)]">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
