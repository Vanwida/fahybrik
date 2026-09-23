'use client';

// La tabla del roster: filas de 40 px, cabeceras que ordenan (aria-sort),
// casillas con ⇧-rango, teclado J/K · X · Enter (DataTable). El nombre es un
// enlace real a la ficha: clic normal abre el vistazo; ⌘/Ctrl-clic o botón
// central abren la ficha en otra pestaña con la lista en `?desde=`.

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import { DataTable, type DataTableColumn, type SortState } from '@/components/v2/ui';
import { AdherenceMini } from '@/components/v2/shared/AdherenceMini';
import { ReadinessMini } from '@/components/v2/shared/ReadinessMini';
import { AthleteCell, LastSessionCell, NextSessionCell, RaceCell, ReplyCell, StatusCell, WeekChip } from './cells';
import { DEFAULT_DIR, SORT_VALUES } from './roster-query';

export interface AthletesTableProps {
  rows: RosterRow[];
  today: string;
  sort: SortState | null;
  onSortChange: (sort: SortState) => void;
  selection: string[];
  onSelectionChange: (ids: string[]) => void;
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
  onOpen: (row: RosterRow) => void;
  hrefFor: (row: RosterRow) => string;
  empty: React.ReactNode;
}

/** «Próximo» solo cuando cabe sin estrujar el motivo (≈ 1400 px con la barra lateral). */
const WIDE_MIN = 1400;

function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${WIDE_MIN}px)`);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return wide;
}

function isModified(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

export function AthletesTable({
  rows,
  today,
  sort,
  onSortChange,
  selection,
  onSelectionChange,
  activeId,
  onActiveChange,
  onOpen,
  hrefFor,
  empty,
}: AthletesTableProps) {
  const now = useMemo(() => new Date(), []);
  const wide = useWide();
  const columns = useMemo<DataTableColumn<RosterRow>[]>(
    () => [
      {
        id: 'atleta',
        header: 'Atleta',
        width: '184px',
        sortValue: SORT_VALUES.atleta,
        cell: (r) => (
          <Link
            href={hrefFor(r)}
            data-row-ignore
            onClick={(e) => {
              if (isModified(e)) return;
              e.preventDefault();
              onActiveChange(r.athlete_id);
              onOpen(r);
            }}
            className="block min-w-0 rounded-[4px] outline-none focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
          >
            <AthleteCell row={r} />
          </Link>
        ),
      },
      {
        id: 'estado',
        header: 'Estado · motivo',
        sortValue: SORT_VALUES.estado,
        cell: (r) => <StatusCell row={r} />,
      },
      {
        id: 'semana',
        header: 'Semana',
        width: '100px',
        sortValue: SORT_VALUES.semana,
        cell: (r) => <WeekChip week={r.week_visibility} />,
      },
      {
        id: 'readiness',
        header: 'Readiness 14 d',
        width: '116px',
        sortValue: SORT_VALUES.readiness,
        hideBelow: 'md',
        cell: (r) => <ReadinessMini readiness={r.readiness} today={today} />,
      },
      {
        id: 'adherencia',
        header: 'Adh. 14 d',
        width: '108px',
        sortValue: SORT_VALUES.adherencia,
        hideBelow: 'md',
        cell: (r) => <AdherenceMini adherence={r.adherence_14d} windowDays={14} width={32} />,
      },
      {
        id: 'ultimo_entreno',
        header: 'Últ. entreno',
        width: '104px',
        sortValue: SORT_VALUES.ultimo_entreno,
        defaultDir: DEFAULT_DIR.ultimo_entreno,
        hideBelow: 'lg',
        cell: (r) => <LastSessionCell row={r} today={today} />,
      },
      ...(wide
        ? [
            {
              id: 'proximo',
              header: 'Próximo',
              width: '120px',
              sortValue: SORT_VALUES.proximo,
              cell: (r: RosterRow) => <NextSessionCell row={r} today={today} />,
            },
          ]
        : []),
      {
        id: 'carrera',
        header: 'Carrera',
        width: '108px',
        sortValue: SORT_VALUES.carrera,
        hideBelow: 'lg',
        cell: (r) => <RaceCell row={r} />,
      },
      {
        id: 'responder',
        header: (
          <span title="Por responder" className="inline-flex items-center">
            <MessageCircle aria-hidden strokeWidth={2} className="size-3.5" />
            <span className="sr-only">Por responder</span>
          </span>
        ),
        width: '76px',
        sortValue: SORT_VALUES.responder,
        defaultDir: DEFAULT_DIR.responder,
        hideBelow: 'lg',
        cell: (r) => <ReplyCell row={r} now={now} />,
      },
    ],
    [today, now, wide, hrefFor, onOpen, onActiveChange],
  );

  return (
    <DataTable
      aria-label="Atletas"
      rows={rows}
      columns={columns}
      getRowId={(r) => r.athlete_id}
      sort={sort}
      onSortChange={onSortChange}
      selection={selection}
      onSelectionChange={onSelectionChange}
      activeId={activeId}
      onActiveChange={onActiveChange}
      onRowOpen={onOpen}
      stickyTop={48}
      virtualize={false}
      empty={empty}
    />
  );
}
