'use client';

// AthleteTableRow — one roster row as a full-width link to the athlete detail.
// Columns mirror the directory header: Atleta · Nivel · Estado · Fase · Adherencia
// · Últ. registro · Próx. test · ›. Rows carry a soft status tint (atención=red,
// nuevo=blue) + a matching status-colored left accent so the eye triages down the
// list. Pure presentational; the table owns data + ordering.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { AdherenceBar } from '@/components/v2/AdherenceBar';
import { RosterStatusDot } from '@/components/v2/atletas/RosterStatusDot';
import { ROSTER_STATUS_META } from '@/lib/dashboard/v2/atletas-status';
import type { RosterRow } from '@/lib/dashboard/v2/atletas-row';
import { cn } from '@/lib/utils';
import { GRID_COLS } from '@/components/v2/atletas/grid';

export function AthleteTableRow({ row, index }: { row: RosterRow; index: number }) {
  const statusMeta = ROSTER_STATUS_META[row.status];
  const tint = statusMeta.rowTintVar;

  return (
    <Link
      href={`/atletas/${row.athlete_id}`}
      className={cn(
        'v2-focus v2-stagger group grid items-center gap-3 border-b border-[color:var(--v2-border)] px-3 py-2.5',
        'transition-colors hover:bg-[color:var(--v2-elevated)]',
        GRID_COLS,
      )}
      style={{
        ['--v2-stagger-i' as string]: index,
        // Status-colored left accent + a faint row wash for triage states.
        boxShadow: `inset 3px 0 0 0 var(${statusMeta.colorVar})`,
        background: tint ? `var(${tint})` : undefined,
      }}
    >
      {/* Atleta */}
      <div className="flex min-w-0 items-center gap-2.5 pl-1">
        <AthleteAvatar name={row.full_name} size="sm" />
        <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
          {row.full_name}
        </span>
      </div>

      {/* Nivel */}
      <div className="hidden sm:block">
        <LevelBadge level={row.level} />
      </div>

      {/* Estado */}
      <div className="min-w-0">
        <RosterStatusDot status={row.status} />
      </div>

      {/* Fase actual */}
      <div className="hidden min-w-0 md:block">
        {row.phase_code ? (
          <span className="truncate text-xs text-[color:var(--v2-muted)]">{row.phase_label}</span>
        ) : (
          <span className="text-xs text-[color:var(--v2-faint)]">{row.phase_label}</span>
        )}
      </div>

      {/* Adherencia */}
      <div className="hidden lg:block">
        <AdherenceBar pct={row.adherence_pct} />
      </div>

      {/* Últ. registro — no last-activity field on the roster row yet. */}
      {/* TODO(model): surface athlete.last_activity_at on the roster loader. */}
      <div className="hidden xl:block">
        <span className="v2-num text-xs text-[color:var(--v2-faint)]">—</span>
      </div>

      {/* Próx. test — no scheduled-test field exists (target_race is a comp, not */}
      {/* a re-test). TODO(model): surface athlete.next_test_at on the loader. */}
      <div className="hidden xl:block">
        <span className="v2-num text-xs text-[color:var(--v2-faint)]">—</span>
      </div>

      {/* Chevron */}
      <div className="flex justify-end text-[color:var(--v2-faint)] transition-colors group-hover:text-[color:var(--v2-muted)]">
        <MIcon name="chevron_right" size={20} />
      </div>
    </Link>
  );
}
