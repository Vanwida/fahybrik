// RosterStatusDot — colored ● + label for a roster row's derived status. The
// shared StatusDot primitive only models the Hoy lane states (and maps `alta` to
// danger), so the roster — which has its own four-state model (activa · atención
// · nuevo · sin plan) — uses this thin dot driven by ROSTER_STATUS_META. Color is
// always paired with the text label (never color alone) for a11y.

import { ROSTER_STATUS_META, type RosterStatus } from '@/lib/dashboard/v2/atletas-status';
import { cn } from '@/lib/utils';

export function RosterStatusDot({
  status,
  showLabel = true,
  className,
}: {
  status: RosterStatus;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = ROSTER_STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: `var(${meta.colorVar})` }}
      />
      {showLabel ? (
        <span className="text-xs font-medium text-[color:var(--v2-fg)]">{meta.label}</span>
      ) : (
        <span className="sr-only">{meta.label}</span>
      )}
    </span>
  );
}
