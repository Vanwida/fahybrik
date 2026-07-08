'use client';

// AthleteTableRow — one roster row as a full-width link to the athlete detail.
// Columns mirror the directory header: Atleta · Nivel · Estado · Fase · Adherencia
// · Últ. registro · ›. Rows carry a soft status tint (atención=red, nuevo=blue) +
// a matching status-colored left accent so the eye triages down the list. Pure
// presentational; the table owns data + ordering.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { AdherenceBar } from '@/components/v2/AdherenceBar';
import { Pill } from '@/components/v2/Pill';
import { RosterStatusDot } from '@/components/v2/atletas/RosterStatusDot';
import { ROSTER_STATUS_META } from '@/lib/dashboard/v2/atletas-status';
import type { RosterRow } from '@/lib/dashboard/v2/atletas-row';
import { formatRelative } from '@/lib/dashboard/relative-time';
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
        // Resting lifecycle states (pausa / baja) read de-emphasized; hover restores
        // full contrast so the row stays legible when the coach focuses it.
        statusMeta.muted && 'opacity-60 hover:opacity-100',
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

      {/* Estado — status badge (+ threaded pause reason), and a "Pidió pausa" chip
          when the athlete has an open pause request the coach hasn't resolved yet. */}
      <div className="flex min-w-0 flex-col items-start gap-1">
        <RosterStatusDot status={row.status} detail={row.status_detail} />
        {row.pause_request_label ? (
          <Pill tone="warn" variant="soft" className="max-w-full" title="El atleta ha pedido una pausa">
            <MIcon name="pan_tool" size={11} />
            <span className="truncate">Pidió pausa</span>
          </Pill>
        ) : null}
      </div>

      {/* Fase actual — block span so `truncate` actually clips (an inline span
          ignores overflow and would bleed into Adherencia); full label on hover. */}
      <div className="hidden min-w-0 md:block" title={row.phase_label}>
        {row.phase_code ? (
          <span className="block truncate text-xs text-[color:var(--v2-muted)]">
            {row.phase_label}
          </span>
        ) : (
          <span className="block truncate text-xs text-[color:var(--v2-faint)]">
            {row.phase_label}
          </span>
        )}
      </div>

      {/* Adherencia */}
      <div className="hidden lg:block">
        <AdherenceBar pct={row.adherence_pct} />
      </div>

      {/* Últ. registro — most recent logged session ("hace 2 d"), honest empty
          state when the athlete has never logged one. */}
      <div className="hidden xl:block">
        {row.last_activity_at ? (
          <span className="v2-num text-xs text-[color:var(--v2-muted)]">
            {formatRelative(row.last_activity_at)}
          </span>
        ) : (
          <span className="text-xs text-[color:var(--v2-faint)]">sin registros</span>
        )}
      </div>

      {/* Chevron */}
      <div className="flex justify-end text-[color:var(--v2-faint)] transition-colors group-hover:text-[color:var(--v2-muted)]">
        <MIcon name="chevron_right" size={20} />
      </div>
    </Link>
  );
}
