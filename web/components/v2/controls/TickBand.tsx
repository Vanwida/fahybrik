'use client';

// TickBand — banda de valores donde UN toque fija un valor y un SEGUNDO toque en
// otro lo convierte en rango (así entra el «65-80 % RM» real de la biblioteca sin
// teclear). Un tercer toque reinicia a valor suelto. El rango pinta sus bordes en
// acento pleno y el interior en tinta suave: se lee de un vistazo qué está dentro.
// La selección es del padre (controlado): {min} = valor suelto, {min,max} = rango.

import { cn } from '@/lib/utils';

export type TickSelection = { min: number; max?: number } | null;

export function TickBand({
  values,
  selection,
  onChange,
  format,
  ariaLabel,
  className,
}: {
  values: readonly number[];
  selection: TickSelection;
  onChange: (next: TickSelection) => void;
  /** Cómo se pinta cada tick (p. ej. sin sufijo; el «%» lo pone la etiqueta del campo). */
  format?: (value: number) => string;
  ariaLabel: string;
  className?: string;
}) {
  const pick = (v: number) => {
    // Sin selección, o rango ya cerrado → empieza valor suelto.
    if (!selection || selection.max !== undefined) return onChange({ min: v });
    // Segundo toque en el mismo valor → sigue suelto; en otro → rango ordenado.
    if (v === selection.min) return onChange({ min: v });
    onChange({ min: Math.min(selection.min, v), max: Math.max(selection.min, v) });
  };

  const lo = selection?.min;
  const hi = selection?.max ?? selection?.min;

  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex gap-1', className)}>
      {values.map((v) => {
        const isEdge = v === lo || v === hi;
        const isIn = lo !== undefined && hi !== undefined && v > lo && v < hi;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={isEdge || isIn}
            aria-label={`${ariaLabel}: ${v}`}
            onClick={() => pick(v)}
            className={cn(
              'v2-focus v2-num flex-1 rounded-[var(--v2-r-s)] border px-0.5 py-2 text-[12.5px] font-bold transition-colors',
              isEdge
                ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                : isIn
                  ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent-text)]'
                  : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {format ? format(v) : v}
          </button>
        );
      })}
    </div>
  );
}
