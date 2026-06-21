// AdherenceBar — track + filled bar colored by adherence band (green ≥75 /
// amber 60–74 / red <60, per components/v2/constants). The numeric % is shown
// alongside so color is never the only signal. Null pct → a muted "—".

import { adherenceBand, ADHERENCE_BAND_COLOR_VAR } from '@/components/v2/constants';
import { cn } from '@/lib/utils';

export function AdherenceBar({
  pct,
  showValue = true,
  className,
}: {
  /** 0–100 adherence, or null when the athlete has no scheduled work. */
  pct: number | null;
  showValue?: boolean;
  className?: string;
}) {
  if (pct == null) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="h-1.5 flex-1 rounded-full bg-[color:var(--v2-surface-2)]" />
        {showValue ? <span className="v2-num text-xs text-[color:var(--v2-faint)]">—</span> : null}
      </div>
    );
  }
  const clamped = Math.max(0, Math.min(100, pct));
  const colorVar = ADHERENCE_BAND_COLOR_VAR[adherenceBand(clamped)];
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Adherencia ${clamped}%`}
    >
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--v2-surface-2)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${clamped}%`, background: `var(${colorVar})` }}
        />
      </div>
      {showValue ? (
        <span className="v2-num text-xs font-semibold" style={{ color: `var(${colorVar})` }}>
          {clamped}%
        </span>
      ) : null}
    </div>
  );
}
