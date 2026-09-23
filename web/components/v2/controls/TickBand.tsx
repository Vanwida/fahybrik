'use client';

// TickBand — banda de valores donde UN toque fija un valor y un SEGUNDO toque en
// otro lo convierte en rango (así entra el «65-80 % RM» real de la biblioteca sin
// teclear). Un tercer toque reinicia a valor suelto. Los bordes del rango van en
// tinta invertida y el interior en el gris de selección: se lee de un vistazo qué
// está dentro (neutro; el acento del club no marca selecciones).
// La selección es del padre (controlado): {min} = valor suelto, {min,max} = rango.

import { Button } from '@/components/v2/ui';
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
          <Button
            key={v}
            size="sm"
            variant="secondary"
            aria-pressed={isEdge || isIn}
            aria-label={`${ariaLabel}: ${v}`}
            onClick={() => pick(v)}
            className={cn(
              'min-w-0 flex-1 px-0.5 t-tnum',
              isEdge
                ? 'border-v2-fg bg-v2-fg text-v2-bg hover:border-v2-fg hover:bg-v2-fg'
                : isIn
                  ? 'border-v2-border-strong bg-v2-select text-v2-fg'
                  : 'border-v2-border text-v2-muted hover:text-v2-fg',
            )}
          >
            {format ? format(v) : v}
          </Button>
        );
      })}
    </div>
  );
}
