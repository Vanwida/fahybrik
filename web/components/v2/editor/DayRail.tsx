'use client';

// DayRail — el carril izquierdo de días del editor de día (rediseño de
// microciclos): la semana queda siempre a un clic, cambiar de día no es «volver
// atrás». 216px sticky en ancho; por debajo de 900px pasa a tira horizontal con
// scroll (el resumen se oculta, los puntos de modalidad se quedan). El color
// nunca es la única señal: cada día lleva su nombre y su resumen en texto.

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { MODALITY_META, type V2Modality } from '@/components/v2/constants';

/** Un día del carril, resumido por quien pinta la semana (lo pasa SEMANA). */
export interface DayRailDay {
  /** 1..7 (Lunes..Domingo) — lo que recibe onSelectDay. */
  dia: number;
  /** «Lun», «Mar»… */
  nombre: string;
  /** Resumen corto del contenido («Fuerza tren superior», «vacío»). */
  resumen: string;
  /** Slugs de modalidad para los puntos de color (carrera/ergo/fuerza/…). */
  modalidades: string[];
  descanso: boolean;
}

const MAX_DOTS = 4; // más de 4 puntos deja de leerse como resumen

function isV2Modality(slug: string): slug is V2Modality {
  return slug in MODALITY_META;
}

export function DayRail({
  days,
  currentDia,
  onSelectDay,
  onBackToWeek,
  weekLabel,
}: {
  days: DayRailDay[];
  currentDia: number;
  onSelectDay: (dia: number) => void;
  onBackToWeek?: () => void;
  weekLabel: string;
}) {
  return (
    <nav
      aria-label="Días de la semana"
      className="flex min-w-0 gap-1 overflow-x-auto pb-1 min-[900px]:sticky min-[900px]:top-20 min-[900px]:flex-col min-[900px]:overflow-visible min-[900px]:pb-0"
    >
      {onBackToWeek ? (
        <button
          type="button"
          onClick={onBackToWeek}
          className="v2-focus mb-2 hidden w-fit items-center gap-1 rounded-[var(--v2-r-s)] px-1 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)] min-[900px]:inline-flex"
        >
          <MIcon name="arrow_back" size={15} />
          {weekLabel}
        </button>
      ) : null}
      {days.map((d) => {
        const on = d.dia === currentDia;
        const dots = d.modalidades.filter(isV2Modality).slice(0, MAX_DOTS);
        return (
          <button
            key={d.dia}
            type="button"
            onClick={() => onSelectDay(d.dia)}
            aria-current={on ? 'true' : undefined}
            className={cn(
              'v2-focus flex shrink-0 items-center gap-2.5 rounded-[var(--v2-r-m)] border px-3 py-2 text-left transition-colors min-[900px]:w-full',
              on
                ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)]'
                : 'border-transparent hover:bg-[color:var(--v2-surface)]',
            )}
          >
            <span
              className={cn(
                'v2-display w-9 shrink-0 text-xs uppercase',
                on && 'text-[color:var(--v2-accent-fg)]',
              )}
            >
              {d.nombre}
            </span>
            <span
              className={cn(
                'hidden min-w-0 flex-1 truncate text-label min-[900px]:block',
                on
                  ? 'text-[color:var(--v2-accent-fg)]'
                  : d.descanso
                    ? 'italic text-[color:var(--v2-faint)]'
                    : 'text-[color:var(--v2-muted)]',
              )}
            >
              {d.resumen}
            </span>
            <span className="flex shrink-0 gap-1" aria-hidden>
              {dots.map((slug) => (
                <i
                  key={slug}
                  className="block h-1.5 w-1.5 rounded-full"
                  style={{ background: `var(${MODALITY_META[slug].colorVar})` }}
                />
              ))}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
