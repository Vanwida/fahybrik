// LevelBadge — athlete competitive level (e.g. N1–N5, or any coach-defined name)
// as a compact outlined chip. Level is shown as neutral chrome (no semantic color)
// so it reads as a label, not a status; the name is the signal.
// Accepts null when the athlete has no level assigned — renders "—" in that case.

import { cn } from '@/lib/utils';

/** @deprecated Use `string | null` directly — kept only for legacy callers until
 *  they migrate. The heuristic that emitted exactly N1–N4 is removed; the DB now
 *  owns the level name (athlete_levels.name). */
export type AthleteLevel = 'N1' | 'N2' | 'N3' | 'N4';

export function LevelBadge({
  level,
  className,
}: {
  level: string | null;
  className?: string;
}) {
  if (level == null) {
    return (
      <span
        className={cn('v2-num text-xs text-[color:var(--v2-faint)]', className)}
        aria-label="Sin nivel asignado"
      >
        —
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--v2-r-xs)] px-1.5 py-0.5',
        'border border-[color:var(--v2-border-strong)] text-[color:var(--v2-muted)]',
        'v2-num text-eyebrow font-bold tracking-wide',
        className,
      )}
      title={`Nivel ${level}`}
    >
      {level}
    </span>
  );
}
