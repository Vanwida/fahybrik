// LevelBadge — athlete competitive level N1–N4 as a compact outlined chip. Level
// is shown as neutral chrome (no semantic color) so it reads as a label, not a
// status; the number is the signal.

import { cn } from '@/lib/utils';

export type AthleteLevel = 'N1' | 'N2' | 'N3' | 'N4';

export function LevelBadge({ level, className }: { level: AthleteLevel; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--v2-r-xs)] px-1.5 py-0.5',
        'border border-[color:var(--v2-border-strong)] text-[color:var(--v2-muted)]',
        'v2-num text-[10px] font-bold tracking-wide',
        className,
      )}
      title={`Nivel ${level.slice(1)}`}
    >
      {level}
    </span>
  );
}
