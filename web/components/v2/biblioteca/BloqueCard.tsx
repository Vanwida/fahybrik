'use client';

// BloqueCard — one reusable library block. Modality-colored left border, the
// block title, its methodology-group label, an optional ATR phase hint, a clamped
// verbatim preview, and a "sin desglosar" flag for blocks pending Pablo's
// structured review. Blocks are not yet individually editable in v2, so the card
// is a non-link surface (no detail route assigned to this agent).

import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { MODALITY_META } from '@/components/v2/constants';
import { cn } from '@/lib/utils';
import type { V2BloqueItem } from '@/lib/dashboard/v2/biblioteca-data';

const ATR_LABEL: Record<'ACC' | 'TRANS' | 'REAL', string> = {
  ACC: 'Acumulación',
  TRANS: 'Transformación',
  REAL: 'Realización',
};

export function BloqueCard({ bloque, index }: { bloque: V2BloqueItem; index: number }) {
  const meta = MODALITY_META[bloque.modality];

  return (
    <div
      className={cn(
        'v2-stagger flex flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3',
        'shadow-[var(--v2-shadow-card)] transition-colors hover:border-[color:var(--v2-border-strong)]',
      )}
      style={{
        ['--v2-stagger-i' as string]: index,
        borderLeftWidth: '3px',
        borderLeftColor: `var(${meta.colorVar})`,
      }}
    >
      {/* Title + review flag */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold leading-snug text-[color:var(--v2-fg)]">
          {bloque.title}
        </h3>
        {bloque.needs_review ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: 'var(--v2-warn-soft)', color: 'var(--v2-warn)' }}
            title="Verbatim sin desglosar — pendiente de revisión"
          >
            <MIcon name="pending" size={13} aria-hidden />
            sin desglosar
          </span>
        ) : null}
      </div>

      {/* Group + ATR tags */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: `var(${meta.softVar})`, color: `var(${meta.colorVar})` }}
        >
          {bloque.group_label}
        </span>
        {bloque.atr_hint ? (
          <Pill tone="neutral" variant="outline" className="uppercase">
            {ATR_LABEL[bloque.atr_hint]}
          </Pill>
        ) : null}
      </div>

      {/* Verbatim preview */}
      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[color:var(--v2-muted)]">
        {bloque.description}
      </p>
    </div>
  );
}
