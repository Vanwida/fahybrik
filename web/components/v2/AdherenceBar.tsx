// AdherenceBar — carril + barra teñida por la banda de adherencia (verde ≥75 /
// ámbar 60–74 / rojo <60, según components/v2/constants). El % va al lado, así el
// color nunca es la única señal.
//
// SIN DATO NO SE PINTA UNA BARRA (§7): «lo que no se sabe no se pinta — ni con
// guiones, ni con una barra vacía que insinúe progreso». `pct == null` no es una
// medida que falte: es que NO HAY TRABAJO PROGRAMADO en la ventana (sin microciclo
// activo, o una pausa que congela el plan — ver lib/dashboard/athletes/list). Eso
// es un hueco que SE DECLARA (§6.2 bis), porque el coach lo llena con un acto
// concreto: asignarle plan. Así que se dice con palabras, no con un «—» sobre un
// carril vacío que se lee como 0 %.

import { adherenceBand, ADHERENCE_BAND_COLOR_VAR } from '@/components/v2/constants';
import { cn } from '@/lib/utils';

export function AdherenceBar({
  pct,
  showValue = true,
  className,
}: {
  /** 0–100 adherence, or null when the athlete has no scheduled work. */
  pct: number | null;
  showValue?: boolean;
  className?: string;
}) {
  if (pct == null) {
    return (
      <span
        className={cn('text-xs text-[color:var(--v2-faint)]', className)}
        title="Sin trabajo programado en la ventana: la adherencia no se puede calcular"
      >
        sin programar
      </span>
    );
  }
  const clamped = Math.max(0, Math.min(100, pct));
  const colorVar = ADHERENCE_BAND_COLOR_VAR[adherenceBand(clamped)];
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Adherencia ${clamped}%`}
    >
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--v2-surface-2)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${clamped}%`, background: `var(${colorVar})` }}
        />
      </div>
      {showValue ? (
        <span className="v2-num text-xs font-semibold" style={{ color: `var(${colorVar})` }}>
          {clamped}%
        </span>
      ) : null}
    </div>
  );
}
