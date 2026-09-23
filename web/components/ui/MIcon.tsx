import type { CSSProperties } from 'react';
import { Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MICON_MAP } from './micon-map';

interface MIconProps {
  /** Nombre Material Symbols (`check_circle`, `arrow_forward`…) — ver micon-map.ts. */
  name: string;
  /** Relleno suave (15 %) en vez de solo trazo. Lucide no tiene variante «filled». */
  filled?: boolean;
  /** Peso heredado del eje wght: 300 → trazo fino, 600+ → grueso. */
  weight?: number;
  /** Tamaño en px. Por defecto 16. */
  size?: number;
  className?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean;
}

// Un aviso por nombre y sesión, solo en desarrollo.
const warned = new Set<string>();

function strokeFor(size: number, weight: number): number {
  if (weight >= 600) return 2.25;
  if (weight <= 300) return 1.5;
  // A 14 px o menos, 1,75 se queda en ~1 px real y el icono parece de alambre.
  return size <= 14 ? 2 : 1.75;
}

/**
 * Icono del producto. Mantiene la API de la antigua fuente Material Symbols
 * (`name`, `size`, `filled`, `className`) pero pinta SVG de Lucide a través de
 * un mapa de nombres: sin fuente de 3,9 MB, sin palabras sueltas mientras carga.
 * Un nombre desconocido pinta un cuadrado neutro y avisa en desarrollo.
 */
export function MIcon({
  name,
  filled = false,
  weight = 400,
  size = 16,
  className,
  style,
  'aria-hidden': ariaHidden = true,
}: MIconProps) {
  const Icon = MICON_MAP[name];
  if (!Icon && process.env.NODE_ENV !== 'production' && !warned.has(name)) {
    warned.add(name);
    console.warn(`[MIcon] icono sin mapear: "${name}" — añádelo a components/ui/micon-map.ts`);
  }
  const Glyph = Icon ?? Square;
  return (
    <Glyph
      aria-hidden={ariaHidden}
      focusable={false}
      width={size}
      height={size}
      strokeWidth={strokeFor(size, weight)}
      fill={filled ? 'currentColor' : 'none'}
      fillOpacity={filled ? 0.15 : undefined}
      data-icon={name}
      className={cn('inline-block shrink-0 align-middle', !Icon && 'opacity-40', className)}
      style={style}
    />
  );
}
