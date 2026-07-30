'use client';

// RosterTable — el instrumento del roster: cabecera de columnas, las filas y un
// pie con el conteo. Cabecera y filas comparten `GRID_COLS` para no descuadrarse.
//
// COMPOSICIÓN (§6.1 `llena`): el panel llega SIEMPRE al borde inferior del hueco
// y scrollea por dentro; el conteo va anclado al pie. Antes el panel medía lo que
// midieran sus filas, así que con tres atletas dejaba 295 px de cola muerta
// debajo y con cien pintaba 5.400 px que empujaban el pie fuera de la pantalla.
// Ahora la vista se lee igual con 3 que con 100: es la misma caja.
//
// EL HUECO SE DECLARA (§6.2 bis): con pocas filas sobra sitio DENTRO del panel, y
// ese sitio se gana con una invitación que el coach puede cumplir con un acto
// concreto — dar de alta a alguien —, no con aire. Con la lista llena la
// invitación no aparece: ya no sobra nada.
//
// Sin elementos la Lista se degrada a Vacío y se centra (§6.2), en vez de dejar
// un encabezado de tabla colgando sobre la nada.

import { EmptyState } from '@/components/v2/EmptyState';
import { AthleteTableRow } from '@/components/v2/atletas/AthleteTableRow';
import { GRID_COLS } from '@/components/v2/atletas/grid';
import { FillPanel } from '@/components/v2/PageFrame';
import { MIcon } from '@/components/ui/MIcon';
import type { RosterRow } from '@/lib/dashboard/v2/atletas-row';
import { cn } from '@/lib/utils';

/** Cuántas filas caben, más o menos, en el panel a 900 px de alto. Por debajo de
 *  eso sobra sitio dentro del panel y la invitación se gana su hueco; por encima
 *  el panel va lleno y la invitación estorbaría. */
const FILAS_QUE_LLENAN_EL_PANEL = 12;

function HeaderCell({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cn('v2-micro', className)}>{children}</div>;
}

export function RosterTable({
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
  /** Abre el alta — la salida del vacío y de la invitación (§5). */
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
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3.5 text-body font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
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

  const sobraSitio = rows.length < FILAS_QUE_LLENAN_EL_PANEL;

  return (
    <FillPanel
      head={
        <div
          className={cn(
            'hidden items-center gap-3 border-b border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2 lg:grid',
            GRID_COLS,
          )}
        >
          <HeaderCell className="pl-1">Atleta</HeaderCell>
          <HeaderCell>Nivel</HeaderCell>
          <HeaderCell>Estado</HeaderCell>
          <HeaderCell>Fase actual</HeaderCell>
          <HeaderCell>Adherencia</HeaderCell>
          <HeaderCell>Últ. registro</HeaderCell>
          <HeaderCell className="sr-only justify-self-end">Ver</HeaderCell>
        </div>
      }
      foot={
        <div className="flex items-center justify-between border-t border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
          <span className="text-label text-[color:var(--v2-muted)]">
            mostrando{' '}
            <span className="v2-num font-semibold text-[color:var(--v2-fg)]">{rows.length}</span> de{' '}
            <span className="v2-num">{total}</span>
          </span>
          {onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              className="v2-focus inline-flex items-center gap-1 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="person_add" size={14} />
              Agregar atleta
            </button>
          ) : null}
        </div>
      }
    >
      {rows.map((row, i) => (
        <AthleteTableRow key={row.athlete_id} row={row} index={i} />
      ))}

      {/* El hueco que sobra dentro del panel se declara con un acto concreto
          (§6.2 bis), no con aire. Desaparece en cuanto la lista llena el panel. */}
      {sobraSitio && onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="v2-focus m-3 flex w-[calc(100%-1.5rem)] items-center justify-center gap-1.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] py-4 text-body font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="person_add" size={17} />
          Agregar atleta
        </button>
      ) : null}
    </FillPanel>
  );
}
