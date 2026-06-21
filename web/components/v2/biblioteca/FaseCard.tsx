'use client';

// FaseCard — one periodization phase of the coach's method (ATR default set:
// Acumulación · Transformación · Realización). Shows the ordered phase name, its
// duration in weeks, the intensity ceiling, and the derived objectives. Links to
// the periodization editor where the phase set is actually defined. These are the
// coach's METHOD phases (not an athlete's plan), so the card is reference, not a
// queue item.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/dashboard/MIcon';
import { Pill } from '@/components/v2/Pill';
import { cn } from '@/lib/utils';
import type { V2FaseItem } from '@/lib/dashboard/v2/biblioteca-data';

/** Where the phase set is defined/edited (the periodization area). */
const PERIODIZACION_HREF = '/v2/planes';

export function FaseCard({ fase, index }: { fase: V2FaseItem; index: number }) {
  return (
    <Link
      href={PERIODIZACION_HREF}
      className={cn(
        'v2-stagger v2-focus group flex flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4',
        'shadow-[var(--v2-shadow-card)] transition-colors hover:border-[color:var(--v2-border-strong)]',
      )}
      style={{ ['--v2-stagger-i' as string]: index }}
    >
      {/* Order index + name */}
      <div className="flex items-center gap-2.5">
        <span
          className="v2-num flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-xs font-bold"
          style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
          aria-hidden
        >
          {fase.order}
        </span>
        <h3 className="min-w-0 text-base font-semibold leading-tight text-[color:var(--v2-fg)]">
          {fase.name}
        </h3>
      </div>

      {/* Duration + intensity ceiling */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Pill tone="neutral" variant="soft">
          <MIcon name="date_range" size={13} aria-hidden />
          <span className="v2-num">{fase.duration_weeks}</span> sem
        </Pill>
        <Pill tone="accent" variant="outline">
          techo {fase.intensity_ceiling}
        </Pill>
      </div>

      {/* Objectives */}
      <div className="mt-3 flex flex-1 flex-col gap-1.5">
        <p className="v2-micro">Objetivos</p>
        <ul className="flex flex-col gap-1">
          {fase.objectives.map((obj) => (
            <li
              key={obj}
              className="flex items-center gap-1.5 text-xs text-[color:var(--v2-muted)]"
            >
              <span
                aria-hidden
                className="h-1 w-1 shrink-0 rounded-full"
                style={{ background: 'var(--v2-faint)' }}
              />
              <span className="truncate">{obj}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer — edit affordance */}
      <div className="mt-3 flex items-center justify-between border-t border-[color:var(--v2-border)] pt-2">
        <span className="text-[11px] text-[color:var(--v2-faint)]">editar periodización</span>
        <span className="text-[color:var(--v2-faint)] transition-colors group-hover:text-[color:var(--v2-accent)]">
          <MIcon name="chevron_right" size={18} aria-hidden />
        </span>
      </div>
    </Link>
  );
}
