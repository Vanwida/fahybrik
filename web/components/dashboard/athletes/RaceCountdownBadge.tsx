import type { AthleteTargetRaceSummary } from '@/lib/dashboard/athletes/list';
import { formatDaysUntilShort } from '@/lib/dashboard/coach/race-labels';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

interface RaceCountdownBadgeProps {
  race: AthleteTargetRaceSummary;
  className?: string;
}

/**
 * Compact TARGET-race countdown chip for the athletes-list card —
 * "HYROX Barcelona · 58 días". Lets the coach scan who races when at a glance.
 * Rendered only when the athlete has an upcoming target race; the caller handles
 * the empty state (no badge).
 */
export function RaceCountdownBadge({ race, className }: RaceCountdownBadgeProps) {
  const isToday = race.days_until <= 0;
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-[var(--r-pill)] border px-2.5 py-1',
        'text-[10px] font-bold uppercase tracking-[0.06em]',
        'border-[color:color-mix(in_srgb,var(--accent)_38%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] text-[color:var(--accent)]',
        className,
      )}
      title={`Carrera objetivo: ${race.name} · ${formatDaysUntilShort(race.days_until)}`}
    >
      <MIcon name="flag" size={13} filled />
      <span className="truncate">{race.name}</span>
      <span aria-hidden className="opacity-50">·</span>
      <span className={cn('metric-num shrink-0 normal-case', isToday && 'animate-pulse')}>
        {formatDaysUntilShort(race.days_until)}
      </span>
    </span>
  );
}
