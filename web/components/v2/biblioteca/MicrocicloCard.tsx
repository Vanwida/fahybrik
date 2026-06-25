'use client';

// MicrocicloCard — one microcycle template in the Biblioteca › Microciclos index.
// Unlike BloqueCard, this is a LINK: the whole card opens the existing editor at
// /microciclos/[id]. Shows the name, the program level, and the number of
// weeks defined. Matches the BloqueCard surface (rounded, bordered, hover).

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { cn } from '@/lib/utils';
import type { V2MicrocicloItem } from '@/lib/dashboard/v2/biblioteca-data';

export function MicrocicloCard({
  microciclo,
  index,
}: {
  microciclo: V2MicrocicloItem;
  index: number;
}) {
  const weeks = microciclo.week_count;
  return (
    <Link
      href={`/microciclos/${microciclo.id}`}
      aria-label={`Editar microciclo ${microciclo.name}`}
      className={cn(
        'v2-stagger v2-focus group flex flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3',
        'shadow-[var(--v2-shadow-card)] transition-colors hover:border-[color:var(--v2-border-strong)]',
      )}
      style={{
        ['--v2-stagger-i' as string]: index,
        borderLeftWidth: '3px',
        borderLeftColor: 'var(--v2-accent)',
      }}
    >
      {/* Title + chevron affordance */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold leading-snug text-[color:var(--v2-fg)]">
          {microciclo.name}
        </h3>
        <span className="shrink-0 text-[color:var(--v2-faint)] transition-colors group-hover:text-[color:var(--v2-fg)]">
          <MIcon name="chevron_right" size={18} aria-hidden />
        </span>
      </div>

      {/* Level + weeks */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Pill tone="neutral" variant="outline" className="capitalize">
          {microciclo.level}
        </Pill>
        <span className="inline-flex items-center gap-1 text-xs text-[color:var(--v2-muted)]">
          <MIcon name="date_range" size={14} aria-hidden />
          <span className="v2-num">{weeks}</span>
          {weeks === 1 ? 'semana' : 'semanas'}
        </span>
      </div>
    </Link>
  );
}
