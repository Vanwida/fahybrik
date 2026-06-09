import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface MIconProps {
  name: string;
  /** Variable font FILL axis — true = filled (1), false = outlined (0). */
  filled?: boolean;
  /** Variable font weight axis (100..700). */
  weight?: number;
  /** Pixel size override. Default uses CSS font-size (24px). */
  size?: number;
  className?: string;
  /** Extra CSS variation overrides (rarely needed). */
  style?: CSSProperties;
  'aria-hidden'?: boolean;
}

/**
 * Material Symbols Outlined icon. Lightweight wrapper that handles
 * variable-font FILL/wght axes via `font-variation-settings`.
 */
export function MIcon({
  name,
  filled = false,
  weight = 400,
  size,
  className,
  style,
  'aria-hidden': ariaHidden = true,
}: MIconProps) {
  return (
    <span
      aria-hidden={ariaHidden}
      className={cn('material-symbols-outlined', className)}
      style={{
        fontVariationSettings: `"FILL" ${filled ? 1 : 0}, "wght" ${weight}, "GRAD" 0, "opsz" 24`,
        ...(size ? { fontSize: `${size}px` } : null),
        ...style,
      }}
    >
      {name}
    </span>
  );
}
