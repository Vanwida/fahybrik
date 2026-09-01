// SessionLine · ModalityTag · DoseLines — los ÁTOMOS de «una sesión mirada por
// encima», compartidos por las dos semanas del panel:
//   · la semana de la FICHA (lectura: qué tiene y qué hizo el atleta), y
//   · la semana del EDITOR de plantilla (autoría: qué estoy montando).
//
// Las dos pantallas siguen siendo distintas a propósito (una lee, otra escribe),
// pero la VOZ tiene que ser una: mismo orden (modalidad → título → dosis), misma
// escala tipográfica, mismo color por eje de modalidad, mismo «+N más». Antes
// eran dos implementaciones paralelas y ya habían divergido (tamaños distintos y
// la dosis solo en una). Extraer los átomos es la forma de que no vuelva a pasar
// sin fusionar dos pantallas que no hacen lo mismo.
//
// Pieza de presentación pura: cada superficie le pasa strings ya resueltos por
// SU cargador (la ficha, los formateadores canónicos de prescripción; el editor,
// su propio resumen de bloques). Aquí no se formatea dosis ni se adivina nada.

import { MODALITY_META } from '@/components/v2/constants';
import { cn } from '@/lib/utils';
import type { V2Modality } from '@/components/v2/constants';

/** La modalidad de la sesión; 'mixta' cuando combina varias. */
export type SessionLineModality = V2Modality | 'mixta';

/** Micro-etiqueta de modalidad: el color del eje + su nombre. */
export function ModalityTag({
  modality,
  className,
}: {
  modality: SessionLineModality;
  className?: string;
}) {
  const mixta = modality === 'mixta';
  return (
    <span
      className={cn('text-[9.5px] font-bold uppercase tracking-[0.07em]', className)}
      style={{ color: mixta ? 'var(--v2-faint)' : `var(${MODALITY_META[modality].colorVar})` }}
    >
      {mixta ? 'Mixta' : MODALITY_META[modality].label}
    </span>
  );
}

/** Las líneas de dosis ya legibles + «+N más» en línea propia (el recorte se lo
 *  comía cuando iba pegado a la última). */
export function DoseLines({ lines, more = 0 }: { lines: readonly string[]; more?: number }) {
  if (lines.length === 0 && more <= 0) return null;
  return (
    <span className="flex w-full min-w-0 flex-col">
      {lines.map((l, i) => (
        <span key={i} className="line-clamp-1 text-[11px] leading-snug text-[color:var(--v2-muted)]">
          {l}
        </span>
      ))}
      {more > 0 ? (
        <span className="text-[11px] leading-snug text-[color:var(--v2-faint)]">+{more} más</span>
      ) : null}
    </span>
  );
}

/** Una sesión vista por encima: modalidad, título y su dosis. El pie (`footer`)
 *  lo pone cada superficie: la ficha su estado, el editor sus avisos. */
export function SessionLine({
  modality,
  title,
  doseLines = [],
  doseMore = 0,
  fallback = null,
  footer = null,
  className,
}: {
  modality?: SessionLineModality | null;
  title: string;
  doseLines?: readonly string[];
  doseMore?: number;
  /** Lo que se dice cuando NO hay dosis que leer (formato · duración, un aviso…). */
  fallback?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('flex min-w-0 flex-col items-start gap-0.5', className)}>
      {modality ? <ModalityTag modality={modality} /> : null}
      <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[color:var(--v2-fg)]">
        {title}
      </span>
      {doseLines.length > 0 ? (
        <DoseLines lines={doseLines} more={doseMore} />
      ) : fallback ? (
        <span className="text-[11px] text-[color:var(--v2-muted)]">{fallback}</span>
      ) : null}
      {footer}
    </span>
  );
}
