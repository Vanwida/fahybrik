'use client';

// RosterTable — the directory table: a tracked-uppercase header row + the data
// rows + a footer count. Header and rows share GRID_COLS so columns stay aligned.
// Empty result → a themed EmptyState (distinguishing "no athletes at all" from
// "none match the filter"). The list scrolls within a bounded panel for long
// rosters; a true windowing layer can drop in later without changing the row API.

import { EmptyState } from '@/components/v2/EmptyState';
import { AthleteTableRow } from '@/components/v2/atletas/AthleteTableRow';
import { GRID_COLS } from '@/components/v2/atletas/grid';
import type { RosterRow } from '@/lib/dashboard/v2/atletas-row';
import { cn } from '@/lib/utils';

function HeaderCell({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cn('v2-micro', className)}>{children}</div>;
}

export function RosterTable({
  rows,
  total,
  hasAnyAthletes,
}: {
  rows: RosterRow[];
  /** Total roster size (pre-filter) for the "mostrando X de N" footer. */
  total: number;
  /** False only when the coach has zero athletes at all. */
  hasAnyAthletes: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-card)]">
      {/* Column header */}
      <div
        className={cn(
          'grid items-center gap-3 border-b border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2',
          GRID_COLS,
        )}
      >
        <HeaderCell className="pl-1">Atleta</HeaderCell>
        <HeaderCell className="hidden sm:block">Nivel</HeaderCell>
        <HeaderCell>Estado</HeaderCell>
        <HeaderCell className="hidden md:block">Fase actual</HeaderCell>
        <HeaderCell className="hidden lg:block">Adherencia</HeaderCell>
        <HeaderCell className="hidden xl:block">Últ. registro</HeaderCell>
        <HeaderCell className="hidden xl:block">Próx. test</HeaderCell>
        <HeaderCell className="justify-self-end sr-only">Ver</HeaderCell>
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={hasAnyAthletes ? 'filter_alt_off' : 'groups'}
            title={hasAnyAthletes ? 'Ningún atleta coincide' : 'Aún no hay atletas'}
            description={
              hasAnyAthletes
                ? 'Ajusta los filtros o la búsqueda para ver más atletas.'
                : 'Cuando des de alta a tu primer atleta aparecerá aquí.'
            }
          />
        </div>
      ) : (
        <div className="max-h-[calc(100dvh-15rem)] overflow-y-auto">
          {rows.map((row, i) => (
            <AthleteTableRow key={row.athlete_id} row={row} index={i} />
          ))}
        </div>
      )}

      {/* Footer count */}
      {rows.length > 0 ? (
        <div className="flex items-center justify-between border-t border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
          <span className="text-[11px] text-[color:var(--v2-muted)]">
            mostrando <span className="v2-num font-semibold text-[color:var(--v2-fg)]">{rows.length}</span> de{' '}
            <span className="v2-num">{total}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
