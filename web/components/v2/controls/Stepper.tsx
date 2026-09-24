'use client';

// Stepper — número que se edita con los dedos, no con el teclado. − / + con
// mantener-pulsado (useHoldRepeat); el valor va en cifras tabulares para que no
// baile al cambiar de cifras. `self-start` es deliberado: dentro de una columna
// flex un inline-flex se estira a lo ancho y el control parece un campo vacío.
// Alturas del sistema: md 40 (formulario) · sm 32 (barra).

import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { useHoldRepeat } from './useHoldRepeat';

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  step = 1,
  format,
  ariaLabel,
  size = 'md',
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Cómo se pinta el valor (p. ej. añadir «%»). Por defecto, el número tal cual. */
  format?: (value: number) => string;
  ariaLabel: string;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const dec = useHoldRepeat(() => onChange(clamp(value - step)));
  const inc = useHoldRepeat(() => onChange(clamp(value + step)));
  const md = size === 'md';
  const btn = cn('rounded-none border-0', md ? 'h-full w-10 px-0' : 'h-full w-8 px-0');

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex touch-none select-none items-stretch self-start overflow-hidden rounded-ctl border border-v2-border-strong bg-v2-surface',
        md ? 'h-10' : 'h-8',
        className,
      )}
    >
      <Button
        variant="ghost"
        size={md ? 'lg' : 'md'}
        {...dec}
        disabled={value <= min}
        aria-label={`${ariaLabel}: menos`}
        className={btn}
      >
        <Minus aria-hidden strokeWidth={2} />
      </Button>
      <output
        aria-label={ariaLabel}
        className={cn(
          'grid place-items-center border-x border-v2-border font-semibold text-v2-fg t-tnum',
          md ? 'min-w-14 px-2 text-base' : 'min-w-11 px-1.5 text-sm',
        )}
      >
        {format ? format(value) : value}
      </output>
      <Button
        variant="ghost"
        size={md ? 'lg' : 'md'}
        {...inc}
        disabled={value >= max}
        aria-label={`${ariaLabel}: más`}
        className={btn}
      >
        <Plus aria-hidden strokeWidth={2} />
      </Button>
    </div>
  );
}
