// AthleteAvatar — initials circle for an athlete, sized variants. Deterministic
// neutral fill (no per-athlete color) so it never competes with the modality /
// status color axes. Reuses initialsFromName from the athletes helper.

import { initialsFromName } from '@/lib/dashboard/athletes/discipline-label';
import { cn } from '@/lib/utils';

type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE: Record<AvatarSize, string> = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
};

export function AthleteAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: AvatarSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold',
        'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)]',
        'ring-1 ring-inset ring-[color:var(--v2-border)]',
        SIZE[size],
        className,
      )}
    >
      {initialsFromName(name)}
    </span>
  );
}
