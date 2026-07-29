// AthleteAvatar — a person avatar: photo when present, deterministic initials
// fallback otherwise. Neutral fill (no per-person color) so it never competes
// with the modality / status color axes. Used for athletes (initials only) and
// for the coach (optional photo via `imageUrl`).

import Image from 'next/image';
import { initialsFromName } from '@/lib/dashboard/athletes/discipline-label';
import { cn } from '@/lib/utils';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<AvatarSize, string> = {
  sm: 'h-7 w-7 text-eyebrow',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-16 w-16 text-base',
};

const SIZE_PX: Record<AvatarSize, number> = { sm: 28, md: 36, lg: 48, xl: 64 };

export function AthleteAvatar({
  name,
  imageUrl,
  size = 'md',
  className,
}: {
  name: string;
  /** Photo URL; when present it replaces the initials. */
  imageUrl?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const base = cn(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold',
    'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)]',
    'ring-1 ring-inset ring-[color:var(--v2-border)]',
    SIZE[size],
    className,
  );

  if (imageUrl) {
    return (
      <span aria-hidden className={base}>
        <Image src={imageUrl} alt="" fill sizes={`${SIZE_PX[size]}px`} className="object-cover" />
      </span>
    );
  }

  return (
    <span aria-hidden className={base}>
      {initialsFromName(name)}
    </span>
  );
}
