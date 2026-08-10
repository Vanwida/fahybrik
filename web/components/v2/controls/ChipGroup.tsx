'use client';

// ChipGroup — valores frecuentes a un toque (RIR 0-4, descansos 45″/60″/1'30…).
// Es un radio-group con forma de pastillas: exclusivo, con la seleccionada en
// tinta invertida. Los valores numéricos van en mono (`mono`) para que 45″ y
// 1'30 pesen igual; las opciones de texto («Series iguales») en la sans normal.
// No confundir con SegmentedControl: aquel es un eje cerrado de pocas opciones
// pegadas; esto es una fila abierta de accesos rápidos que puede crecer.

import { cn } from '@/lib/utils';

export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  mono = true,
  className,
}: {
  /** `disabled` deja la pastilla A LA VISTA pero apagada: una opción que
   *  desaparece manda al coach a buscar algo que recuerda haber visto. El motivo
   *  se dice en texto al lado del grupo, no sólo en un `title` que nadie lee. */
  options: readonly { value: T; label: string; hint?: string; disabled?: boolean }[];
  value: T | null;
  onChange: (next: T) => void;
  ariaLabel: string;
  /** Pastillas numéricas en mono tabular (por defecto). Texto → false. */
  mono?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'v2-focus inline-flex h-[34px] items-center gap-1.5 rounded-[var(--v2-r-pill)] border px-3.5 text-[13px] font-bold transition-colors',
              mono && 'v2-num',
              o.disabled && 'cursor-not-allowed opacity-45',
              on
                ? 'border-[color:var(--v2-fg)] bg-[color:var(--v2-fg)] text-[color:var(--v2-bg)]'
                : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {o.label}
            {o.hint ? (
              <span className={cn('text-[11px] font-medium', on ? 'opacity-70' : 'text-[color:var(--v2-faint)]')}>
                {o.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
