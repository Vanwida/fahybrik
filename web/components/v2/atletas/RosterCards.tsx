'use client';

// RosterCards — la vista de TARJETAS del roster (dirección C del rediseño FLEXR:
// cada atleta es una tarjeta, la más humana el día uno). Es la MISMA lista que
// RosterTable con otra presentación: mismos datos derivados (RosterRow), mismos
// filtros/orden/búsqueda aplicados aguas arriba en RosterDirectory, mismas
// marcas de estado (MarcasDeEstado, compartida con la fila). El toggle de vista
// solo cambia cómo se pinta, nunca qué hay.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { AdherenceBar } from '@/components/v2/AdherenceBar';
import { RosterStatusDot } from '@/components/v2/atletas/RosterStatusDot';
import { MarcasDeEstado, UltimoRegistro } from '@/components/v2/atletas/AthleteTableRow';
import { ROSTER_STATUS_META } from '@/lib/dashboard/v2/atletas-status';
import type { RosterRow } from '@/lib/dashboard/v2/atletas-row';
import { cn } from '@/lib/utils';

function AthleteCard({ row, index }: { row: RosterRow; index: number }) {
  const statusMeta = ROSTER_STATUS_META[row.status];
  return (
    <Link
      href={`/atletas/${row.athlete_id}`}
      className={cn(
        'v2-focus v2-stagger group flex flex-col gap-2.5 rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)]',
        'bg-[color:var(--v2-surface)] p-4 shadow-[var(--v2-shadow-card)] transition-colors',
        'hover:border-[color:var(--v2-border-strong)]',
        // Los estados en reposo (pausa / baja) se leen apagados; el hover les
        // devuelve el contraste cuando el coach los enfoca.
        statusMeta.muted && 'opacity-60 hover:opacity-100',
      )}
      style={{ ['--v2-stagger-i' as string]: index }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <AthleteAvatar name={row.full_name} imageUrl={row.avatar_url} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-[color:var(--v2-fg)]">
            {row.full_name}
          </div>
          <div
            className={cn(
              'truncate text-xs',
              row.phase_code ? 'text-[color:var(--v2-muted)]' : 'text-[color:var(--v2-faint)]',
            )}
            title={row.phase_label}
          >
            {row.level ? `${row.level} · ` : ''}
            {row.phase_label}
          </div>
        </div>
        <RosterStatusDot status={row.status} detail={row.status_detail} showLabel={false} />
      </div>

      <AdherenceBar pct={row.adherence_pct} />

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {/* El estado se dice con texto cuando NO es el estado normal: lo
            excepcional habla, lo normal calla (el dot de arriba ya lo marca). */}
        {row.status !== 'activa' ? (
          <RosterStatusDot status={row.status} detail={row.status_detail} />
        ) : null}
        <MarcasDeEstado row={row} />
        <span className="ml-auto shrink-0">
          <UltimoRegistro row={row} />
        </span>
      </div>
    </Link>
  );
}

export function RosterCards({
  rows,
  total,
  hasAnyAthletes,
  onAdd,
}: {
  rows: RosterRow[];
  /** Tamaño total del roster (antes de filtrar) para el «mostrando X de N». */
  total: number;
  /** Falso sólo cuando el coach no tiene ni un atleta. */
  hasAnyAthletes: boolean;
  /** Abre el alta — la salida del vacío y de la tarjeta fantasma. */
  onAdd?: () => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState
          icon={hasAnyAthletes ? 'filter_alt_off' : 'groups'}
          title={hasAnyAthletes ? 'Ningún atleta coincide' : 'Aún no hay atletas'}
          description={
            hasAnyAthletes
              ? 'Ajusta los filtros o la búsqueda para ver más atletas.'
              : 'Da de alta a tu primer atleta y aparecerá aquí con su estado, su fase y su adherencia.'
          }
          className="max-w-md"
          action={
            hasAnyAthletes || !onAdd ? undefined : (
              <button
                type="button"
                onClick={onAdd}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-body font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
              >
                <MIcon name="person_add" size={17} />
                Agregar atleta
              </button>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row, i) => (
            <AthleteCard key={row.athlete_id} row={row} index={i} />
          ))}
          {onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              className="v2-focus flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[var(--v2-r-card)] border border-dashed border-[color:var(--v2-border-strong)] text-body font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-fg)] hover:text-[color:var(--v2-fg)]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--v2-border-strong)]">
                <MIcon name="person_add" size={17} />
              </span>
              Agregar atleta
            </button>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 pt-2.5">
        <span className="text-label text-[color:var(--v2-muted)]">
          mostrando{' '}
          <span className="v2-num font-semibold text-[color:var(--v2-fg)]">{rows.length}</span> de{' '}
          <span className="v2-num">{total}</span>
        </span>
      </div>
    </div>
  );
}
