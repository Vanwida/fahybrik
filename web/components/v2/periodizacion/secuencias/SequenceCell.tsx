'use client';

// SequenceCell — one cell of the Secuencias matrix (level × days). Filled = a
// compact sequence preview (nº microciclos · total semanas + a per-item
// sparkline); empty = a dashed "+" that invites creating one. Mirrors the
// Biblioteca MatrixCell look so the two matrices read identically.
//
// The sparkline = one segment per microciclo, in order; width ∝ that microciclo's
// weeks. It is derived from data we already have (microciclo week_count), never
// invented.

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export interface SequenceSparkSegment {
  /** Relative width — the microciclo's week count (>=1). */
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
          'v2-focus group relative flex h-full min-h-[84px] w-full flex-col items-start justify-between gap-2 rounded-[var(--v2-r-s)]',
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
        <Sparkline segments={preview.segments} />
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
        'transition-colors hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent)]',
      )}
    >
      <MIcon name="add" size={18} aria-hidden />
    </button>
  );
}

function Sparkline({ segments }: { segments: SequenceSparkSegment[] }) {
  if (segments.length === 0) {
    return <span className="text-eyebrow text-[color:var(--v2-faint)]">sin microciclos</span>;
  }
  const total = segments.reduce((sum, s) => sum + Math.max(s.weeks, 1), 0);
  return (
    <div className="flex h-1.5 w-full items-center gap-[2px]" aria-hidden>
      {segments.map((seg, i) => (
        <span
          key={i}
          className="h-1.5 rounded-[var(--v2-r-3xs)]"
          style={{
            width: `${(Math.max(seg.weeks, 1) / total) * 100}%`,
            background: 'var(--v2-muted)',
          }}
        />
      ))}
    </div>
  );
}
