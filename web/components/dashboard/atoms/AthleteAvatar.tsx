'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type AthleteAvatarSize = 'sm' | 'md' | 'lg' | 'xl';
export type AthleteAvatarVariant = 'default' | 'warning' | 'critical';

interface AthleteAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: AthleteAvatarSize;
  variant?: AthleteAvatarVariant;
  className?: string;
}

const SIZE_PX: Record<AthleteAvatarSize, number> = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 80,
};

const SIZE_CLASS: Record<AthleteAvatarSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
  xl: 'h-20 w-20',
};

// font-headline-md = 24px (display, weight 700). Para sm/md usamos 24px nativo,
// para lg/xl escalamos manteniendo el mismo lookup tipográfico de display.
const TEXT_CLASS: Record<AthleteAvatarSize, string> = {
  sm: 'text-xs', // 12px — 32px no aguanta 24px de tipo
  md: 'font-headline-md', // 24px
  lg: 'text-[28px] leading-none', // entre headline-md y lg
  xl: 'font-headline-lg', // 32px
};

const VARIANT_BORDER: Record<AthleteAvatarVariant, string> = {
  default: 'border border-[color:var(--border-subtle)]',
  warning:
    'border-2 border-[color:color-mix(in_srgb,var(--status-warning)_55%,transparent)]',
  critical: 'border-2 border-[color:var(--primary-container)]',
};

function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

export function AthleteAvatar({
  name,
  avatarUrl,
  size = 'md',
  variant = 'default',
  className,
}: AthleteAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  // Si la URL cambia, resetea el estado de fallo para reintentar: sincronización
  // legítima a la prop `avatarUrl`, no un setState derivado. Disable acotado.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const showImage = Boolean(avatarUrl) && !imageFailed;
  const px = SIZE_PX[size];

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'aspect-square select-none',
        SIZE_CLASS[size],
        VARIANT_BORDER[variant],
        !showImage && 'bg-[color:var(--surface-container-high)]',
        className,
      )}
      style={{ width: px, height: px }}
      aria-label={name}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl ?? ''}
          alt={name}
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'text-[color:var(--fg)] uppercase tracking-tight',
            TEXT_CLASS[size],
          )}
        >
          {initialsFor(name)}
        </span>
      )}
    </div>
  );
}
