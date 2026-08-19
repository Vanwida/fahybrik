'use client';

// WeekStrip — el resumen de la semana encima del tablero (mock «Semana»):
// «N sesiones · N bloques · N ejercicios» + barra apilada de modalidades (por nº
// de bloques) + chip ámbar «N bloques sin dosis» + Copiar a…/Duplicar semana.
// El chip abre el primer día con trabajo pendiente. Aquí vive también StackBar,
// la barra apilada que comparten el strip y el pie de cada día del tablero.

import { MIcon } from '@/components/ui/MIcon';
import { MODALITY_META } from '@/components/v2/constants';
import type { MicroWeek } from '@/components/v2/planes/MicrocicloEditor';
import {
  firstSinDosisDay,
  modalitySegments,
  weekBlockCount,
  weekBlocks,
  weekItemCount,
  weekSinDosisCount,
  type ModalitySegment,
} from '@/components/v2/planes/semana-model';
import { cn } from '@/lib/utils';

// ── Barra apilada de modalidades (por nº de bloques) ─────────────────────────
// `null` (bloque sin clasificar) pinta un segmento neutro. El texto siempre
// acompaña: la barra lleva su reparto en aria-label/title, nunca color a secas.
export function StackBar({
  segments,
  className,
  heightClass,
}: {
  segments: ModalitySegment[];
  className?: string;
  heightClass: string;
}) {
  if (segments.length === 0) return null;
  const detail = segments
    .map((s) => `${s.modality ? MODALITY_META[s.modality].label : 'Sin clasificar'} ${s.count}`)
    .join(' · ');
  return (
    <span
      role="img"
      aria-label={`Reparto por modalidad: ${detail}`}
      title={`Reparto por modalidad (nº de bloques): ${detail}`}
      className={cn(
        'flex overflow-hidden rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface-2)]',
        heightClass,
        className,
      )}
    >
      {segments.map((s, i) => (
        <span
          key={i}
          className="block h-full"
          style={{
            flex: s.count,
            background: s.modality
              ? `var(${MODALITY_META[s.modality].colorVar})`
              : 'var(--v2-border-strong)',
          }}
        />
      ))}
    </span>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <b className="v2-num text-reading font-extrabold text-[color:var(--v2-fg)]">{value}</b>
      <span className="text-label text-[color:var(--v2-muted)]">{label}</span>
    </span>
  );
}

export function WeekStrip({
  week,
  onOpenSinDosis,
  canCopyWeek,
  onCopyWeek,
  onDuplicateWeek,
  duplicating,
  duplicateError,
}: {
  week: MicroWeek;
  /** Abre el primer día con un bloque sin dosis (1..7). */
  onOpenSinDosis: (dayOfWeek: number) => void;
  canCopyWeek: boolean;
  onCopyWeek: () => void;
  onDuplicateWeek: () => void;
  duplicating: boolean;
  duplicateError: boolean;
}) {
  const blocks = weekBlockCount(week.days);
  const items = weekItemCount(week.days);
  const sinDosis = weekSinDosisCount(week.days);
  const sinDosisDay = firstSinDosisDay(week.days);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3.5 py-2">
      <Stat value={week.session_count} label={week.session_count === 1 ? 'sesión' : 'sesiones'} />
      <Stat value={blocks} label={blocks === 1 ? 'bloque' : 'bloques'} />
      <Stat value={items} label={items === 1 ? 'ejercicio' : 'ejercicios'} />
      <StackBar
        segments={modalitySegments(weekBlocks(week.days))}
        heightClass="h-2"
        className="min-w-[140px] flex-1"
      />
      {sinDosis > 0 && sinDosisDay != null ? (
        <button
          type="button"
          onClick={() => onOpenSinDosis(sinDosisDay)}
          title="Abre el primer día con un bloque sin dosis"
          className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-warn-soft)] px-2.5 py-1 text-label font-bold text-[color:var(--v2-warn)] transition-opacity hover:opacity-80"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--v2-warn)]" />
          {sinDosis} {sinDosis === 1 ? 'bloque sin dosis' : 'bloques sin dosis'}
        </button>
      ) : null}
      <div className="ml-auto flex items-center gap-1.5">
        {canCopyWeek ? (
          <button
            type="button"
            onClick={onCopyWeek}
            title="Copia el contenido de esta semana sobre otras semanas del microciclo"
            className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] px-2.5 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="library_add" size={14} />
            Copiar a…
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDuplicateWeek}
          disabled={duplicating}
          title="Crea una copia idéntica de esta semana justo después"
          className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] px-2.5 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:opacity-60"
        >
          <MIcon name={duplicating ? 'progress_activity' : 'content_copy'} size={14} />
          {duplicating ? 'Duplicando…' : 'Duplicar semana'}
        </button>
      </div>
      {duplicateError ? (
        <p className="basis-full text-label font-semibold text-[color:var(--v2-danger)]">
          No se pudo duplicar la semana. Inténtalo de nuevo.
        </p>
      ) : null}
    </div>
  );
}
