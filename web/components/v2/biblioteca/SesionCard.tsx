'use client';

// SesionCard — one template in the Biblioteca grid. A modality-colored left
// border encodes the training modality; the body shows name + format tag +
// "~min · N bloques"; the footer reads "usada en N planes" (real usage count)
// plus a draft pill when applicable. The whole card links to the session editor.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { MODALITY_META } from '@/components/v2/constants';
import { cn } from '@/lib/utils';
import type { V2SesionItem } from '@/lib/dashboard/v2/biblioteca-data';

export function SesionCard({ sesion, index }: { sesion: V2SesionItem; index: number }) {
  const meta = MODALITY_META[sesion.modality];
  const usageLabel =
    sesion.used_in_plans === 1 ? 'usada en 1 plan' : `usada en ${sesion.used_in_plans} planes`;

  return (
    <Link
      href={`/v2/biblioteca/sesion/${sesion.id}`}
      className={cn(
        'v2-stagger v2-focus group flex flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3',
        'shadow-[var(--v2-shadow-card)] transition-colors hover:border-[color:var(--v2-border-strong)]',
      )}
      style={{
        ['--v2-stagger-i' as string]: index,
        borderLeftWidth: '3px',
        borderLeftColor: `var(${meta.colorVar})`,
      }}
    >
      {/* Title + draft state */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold leading-snug text-[color:var(--v2-fg)]">
          {sesion.name}
        </h3>
        {sesion.is_draft ? (
          <Pill tone="warn" variant="soft" className="shrink-0">
            Borrador
          </Pill>
        ) : null}
      </div>

      {/* Modality + format tags */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: `var(${meta.softVar})`, color: `var(${meta.colorVar})` }}
        >
          {meta.label}
        </span>
        <Pill tone="neutral" variant="soft">
          {sesion.format_label}
        </Pill>
      </div>

      {/* Meta line — minutes (estimate) + block count */}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-[color:var(--v2-muted)]">
        <MIcon name="schedule" size={14} aria-hidden />
        <span className="v2-num">~{sesion.est_minutes}</span> min
        <span className="text-[color:var(--v2-faint)]">·</span>
        <span className="v2-num">{sesion.block_count}</span>{' '}
        {sesion.block_count === 1 ? 'bloque' : 'bloques'}
      </p>

      {/* Footer — usage count */}
      <div className="mt-3 flex items-center justify-between border-t border-[color:var(--v2-border)] pt-2">
        <span className="text-[11px] text-[color:var(--v2-faint)]">{usageLabel}</span>
        <span className="text-[color:var(--v2-faint)] transition-colors group-hover:text-[color:var(--v2-accent)]">
          <MIcon name="chevron_right" size={18} aria-hidden />
        </span>
      </div>
    </Link>
  );
}
