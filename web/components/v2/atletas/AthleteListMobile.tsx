'use client';

// Atletas en el móvil = triaje: una columna de filas de 56 px con quién es, el
// estado con su motivo y su semana. Tocar abre el vistazo (a pantalla completa).

import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import { Avatar, List, ListRow, Tag } from '@/components/v2/ui';
import { StatusBadgeFor } from '@/components/v2/shared/StatusBadgeFor';
import { WeekChip } from './cells';

export function AthleteListMobile({ rows, onOpen }: { rows: RosterRow[]; onOpen: (row: RosterRow) => void }) {
  return (
    <List aria-label="Atletas">
      {rows.map((r) => (
        <ListRow
          key={r.athlete_id}
          className="min-h-14"
          leading={<Avatar name={r.name} src={r.avatar_url} size="md" />}
          title={
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{r.name}</span>
              {r.level ? <Tag>{r.level.label}</Tag> : null}
            </span>
          }
          detail={<StatusBadgeFor status={r.status} withReason size="sm" className="max-w-full" />}
          trailing={<WeekChip week={r.week_visibility} />}
          onClick={() => onOpen(r)}
        />
      ))}
    </List>
  );
}
