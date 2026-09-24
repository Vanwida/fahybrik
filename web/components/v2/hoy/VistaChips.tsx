'use client';

// Los filtros de Hoy (Todo · Por responder · Sesiones…). En el móvil se desplazan
// de lado: el activo se trae a la vista, un velo al borde dice «hay más» y la
// fila tiene holgura vertical para que el área de toque de cada chip (44 px) no
// quede recortada por el desplazamiento.

import { useEffect, useRef } from 'react';
import { FilterChip } from '@/components/v2/ui';
import { VISTAS, type HoyVista } from './hoy-model';

export function VistaChips({
  vista,
  counts,
  onChange,
}: {
  vista: HoyVista;
  counts: Record<HoyVista, number>;
  onChange: (next: HoyVista) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    const chip = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (chip && box) box.scrollLeft = Math.max(0, chip.offsetLeft - box.offsetLeft - 16);
  }, [vista]);

  return (
    <div className="relative -mx-4 sm:mx-0">
      <div
        ref={ref}
        className="flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] max-sm:-my-2.5 sm:flex-wrap sm:px-0 sm:py-0"
      >
        {VISTAS.map((v) => (
          <FilterChip
            key={v.key}
            active={vista === v.key}
            count={counts[v.key]}
            onClick={() => onChange(v.key)}
            className="pointer-coarse:after:-inset-y-2.5"
          >
            {v.label}
          </FilterChip>
        ))}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-v2-bg to-transparent sm:hidden"
      />
    </div>
  );
}
