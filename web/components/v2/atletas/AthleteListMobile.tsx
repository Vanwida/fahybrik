'use client';

// Atletas en el móvil = triaje: filas con un mínimo de 56 px que crecen con el motivo,
// estado con su motivo y su semana. Tocar abre el vistazo (a pantalla completa).

import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import { Avatar, List, ListRow, Tag } from '@/components/v2/ui';
import { StatusCell, WeekChip } from './cells';

export function AthleteListMobile({ rows, onOpen }: { rows: RosterRow[]; onOpen: (row: RosterRow) => void }) {
  return (
    <List aria-label="Atletas">
      {rows.map((r) => (
        <ListRow
          key={r.athlete_id}
          className="min-h-14 py-2"
          leading={<Avatar name={r.name} src={r.avatar_url} size="md" />}
          title={
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate">{r.name}</span>
                {r.level ? <Tag>{r.level.label}</Tag> : null}
              </span>
              <WeekChip week={r.week_visibility} nextStart={r.next_start} />
            </span>
          }
          detail={<StatusCell row={r} />}
          onClick={() => onOpen(r)}
        />
      ))}
    </List>
  );
}
