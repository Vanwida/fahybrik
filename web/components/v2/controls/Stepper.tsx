'use client';

// Stepper — número que se edita con los dedos, no con el teclado (rediseño del
// editor de microciclos, ver docs/design/microciclos-editor-rediseno-mockup.html).
// − / + con mantener-pulsado (useHoldRepeat); el valor es mono tabular para que
// no baile al cambiar de cifras. `align-self:flex-start` es deliberado: dentro de
// una columna flex un inline-flex se estira a lo ancho y el control parece un
// campo vacío (el único fallo que señaló Alex en el mock).

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

  const btn = cn(
    'grid select-none place-items-center font-semibold text-[color:var(--v2-muted)] transition-colors',
    'hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]',
    'active:bg-[color:var(--v2-accent-soft)] active:text-[color:var(--v2-accent)]',
    size === 'md' ? 'w-11 text-[19px]' : 'w-9 text-[16px]',
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex touch-none select-none items-stretch self-start overflow-hidden',
        'rounded-[var(--v2-r-m)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)]',
        className,
      )}
    >
      <button
        type="button"
        {...dec}
        disabled={value <= min}
        aria-label={`${ariaLabel}: menos`}
        className={cn(btn, 'v2-focus disabled:opacity-40')}
      >
        −
      </button>
      <output
        aria-label={ariaLabel}
        className={cn(
          'v2-num grid place-items-center border-x border-[color:var(--v2-border)] font-bold',
          size === 'md' ? 'min-w-16 px-2.5 py-2 text-[21px]' : 'min-w-12 px-2 py-1.5 text-[17px]',
        )}
      >
        {format ? format(value) : value}
      </output>
      <button
        type="button"
        {...inc}
        disabled={value >= max}
        aria-label={`${ariaLabel}: más`}
        className={cn(btn, 'v2-focus disabled:opacity-40')}
      >
        ＋
      </button>
    </div>
  );
}
