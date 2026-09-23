'use client';

import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';
import { cn } from '@/lib/utils';

// Nada por debajo de 11 px (plan §3): en xs (20 px) cabe UNA inicial a 11 px, en
// sm (24 px) las dos.
const SIZE = {
  xs: 'size-5 text-[11px]',
  sm: 'size-6 text-[11px] tracking-[-0.02em]',
  md: 'size-7 text-[11px]',
  lg: 'size-8 text-[12px]',
  xl: 'size-10 text-[14px]',
} as const;

/** Iniciales de un nombre: «Marc Vidal» → «MV». */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** Avatar redondo; sin foto, iniciales en gris neutro (sin arcoíris). Decorativo:
 *  el nombre siempre va escrito al lado, así que el lector no lo lee dos veces. */
export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      aria-hidden
      title={name}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full',
        'bg-v2-surface-2 font-semibold text-v2-muted ring-1 ring-v2-border ring-inset',
        SIZE[size],
        className,
      )}
    >
      {src ? <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback>{size === 'xs' ? initials(name).slice(0, 1) : initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
