'use client';

// SequenceCell — one días-variant preview inside a level (level × days). Filled =
// a compact reading of the sequence: nº microciclos · total semanas + the first
// stretches of LA ESPINA, the same shared vertical path the athlete sees on his
// phone. Empty = a dashed "+" that invites building it.
//
// It used to be an anonymous grey sparkline (one segment per microciclo, width ∝
// weeks). It said how many pieces there were and nothing about which ones — so
// the coach had to open the editor to remember what he had built. The espina
// writes the coach's own names and the week ranges his athlete will read.
//
// Only the first few stretches fit in a card this size; the rest are COUNTED, not
// hidden, so a 6-microciclo sequence never looks like a 3-microciclo one.

import { MIcon } from '@/components/ui/MIcon';
import { Espina, TONOS_V2, TOKENS_V2, colorDelTono, type TramoEspina } from '@/components/plan-espina';
import { cn } from '@/lib/utils';
import { nodosDeCadena } from './cadena';

/** Cuántas paradas caben en una tarjeta de la rejilla antes de resumir. */
const PARADAS_EN_LA_PREVIA = 3;

export interface SequenceSparkSegment {
  /** El nombre del microciclo, o `null` si ya no está en la biblioteca. */
  name: string | null;
  /** Sus semanas (`program_month_weeks`). 0 = creado y todavía vacío. */
  weeks: number;
}

export interface SequenceCellPreview {
  microciclo_count: number;
  total_weeks: number;
  segments: SequenceSparkSegment[];
}

export function SequenceCell({
  preview,
  levelLabel,
  days,
  onClick,
}: {
  preview: SequenceCellPreview | null;
  levelLabel: string;
  days: number;
  onClick: () => void;
}) {
  if (preview) {
    const mc = preview.microciclo_count;
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${mc} ${mc === 1 ? 'microciclo' : 'microciclos'} · ${preview.total_weeks} sem`}
        className={cn(
          'v2-focus group relative flex h-full min-h-[84px] w-full flex-col items-start justify-start gap-2.5 rounded-[var(--v2-r-s)]',
          'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5',
          'text-left transition-colors hover:border-[color:var(--v2-border-strong)] hover:bg-[color:var(--v2-surface-2)]',
        )}
      >
        <div className="flex w-full items-center gap-2 text-eyebrow text-[color:var(--v2-muted)]">
          <span className="inline-flex items-center gap-1">
            <MIcon name="view_week" size={12} className="opacity-70" />
            <b className="v2-num text-[color:var(--v2-fg)]">{mc}</b> mc
          </span>
          <span className="inline-flex items-center gap-1">
            <MIcon name="date_range" size={12} className="opacity-70" />
            <b className="v2-num text-[color:var(--v2-fg)]">{preview.total_weeks}</b> sem
          </span>
        </div>
        <Camino segments={preview.segments} />
        <span className="pointer-events-none absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <MIcon name="edit" size={12} className="text-[color:var(--v2-muted)]" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Crear secuencia para ${levelLabel} · ${days} días`}
      className={cn(
        'v2-focus flex h-full min-h-[84px] w-full items-center justify-center rounded-[var(--v2-r-s)]',
        'border border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)]',
        'transition-colors hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent-text)]',
      )}
    >
      <MIcon name="add" size={18} aria-hidden />
    </button>
  );
}

/**
 * Las primeras paradas del camino. Los rótulos de semana se acumulan sobre la
 * cadena ENTERA (no sobre las que caben), así que «S1-S4 · S5-S8 · S9-S12» sigue
 * diciendo la verdad aunque se corte en la tercera.
 */
function Camino({ segments }: { segments: SequenceSparkSegment[] }) {
  if (segments.length === 0) {
    return <span className="text-eyebrow text-[color:var(--v2-faint)]">sin microciclos</span>;
  }
  const nodos = nodosDeCadena(
    segments.map((seg, i) => ({
      clave: `p${i}`,
      month_template_id: `p${i}`,
      nombre: seg.name,
      semanas: seg.weeks,
    })),
  );
  const visibles = nodos.slice(0, PARADAS_EN_LA_PREVIA);
  const restantes = nodos.length - visibles.length;
  const tramos: TramoEspina[] = visibles.map((nodo) => ({
    clave: nodo.clave,
    semanas: nodo.semanas,
    titulo: nodo.titulo,
    color: nodo.tono === null ? 'var(--v2-danger)' : colorDelTono(TONOS_V2, nodo.tono),
  }));

  return (
    <div className="w-full">
      <Espina tokens={TOKENS_V2} tramos={tramos} />
      {restantes > 0 ? (
        <span className="text-eyebrow text-[color:var(--v2-faint)]">
          y {restantes} {restantes === 1 ? 'microciclo más' : 'microciclos más'}
        </span>
      ) : null}
    </div>
  );
}
