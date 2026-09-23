'use client';

// ChipGroup — valores frecuentes a un toque (RIR 0-4, descansos 45″/60″/1'30…).
// Es un radio-group de botones de 28 px: exclusivo, con el elegido en tinta
// invertida (neutro; el acento del club no marca selecciones). Los valores
// numéricos van en cifras tabulares (`mono`) para que 45″ y 1'30 pesen igual.
// No confundir con SegmentedControl: aquel es un eje cerrado de pocas opciones
// pegadas; esto es una fila abierta de accesos rápidos que puede crecer.

import { Button } from '@/components/v2/ui';
import { cn } from '@/lib/utils';

export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  mono = true,
  className,
}: {
  /** `disabled` deja la opción A LA VISTA pero apagada: una opción que
   *  desaparece manda al coach a buscar algo que recuerda haber visto. El motivo
   *  se dice en texto al lado del grupo, no sólo en un `title` que nadie lee. */
  options: readonly { value: T; label: string; hint?: string; disabled?: boolean }[];
  value: T | null;
  onChange: (next: T) => void;
  ariaLabel: string;
  /** Cifras tabulares (por defecto). Texto → false. */
  mono?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex flex-wrap gap-1', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Button
            key={String(o.value)}
            size="sm"
            variant="secondary"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'px-2.5',
              mono && 't-tnum',
              on
                ? 'border-v2-fg bg-v2-fg text-v2-bg hover:border-v2-fg hover:bg-v2-fg'
                : 'border-v2-border text-v2-muted hover:text-v2-fg',
            )}
          >
            {o.label}
            {o.hint ? <span className={cn('t-meta', on ? 'opacity-70' : 'text-v2-faint')}>{o.hint}</span> : null}
          </Button>
        );
      })}
    </div>
  );
}
