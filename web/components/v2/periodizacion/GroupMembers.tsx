'use client';

// La gente del grupo: dónde está cada uno de su plan y hasta cuándo tiene.
// Seleccionar y «Sacar del grupo» (conservan el plan que ya tienen).

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import type { GroupDetail, GroupMember, GroupRemoveResult } from '@fahybrid/shared/schema/groups';
import { Avatar, BulkBar, Button, Card, CardHeader, DataTable, EmptyState, useToast, type DataTableColumn } from '@/components/v2/ui';
import { localToday, shortDate } from '@/components/v2/shared/format';
import { groupApi } from './group-api';
import { memberSpot } from './group-pace';

export function GroupMembers({ group, onChanged, onAdd }: { group: GroupDetail; onChanged: () => void; onAdd: () => void }) {
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [selection, setSelection] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const today = localToday();

  const columns: DataTableColumn<GroupMember>[] = [
    {
      id: 'name',
      header: 'Atleta',
      sortValue: (m) => m.name.toLowerCase(),
      cell: (m) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={m.name} src={m.avatar_url} size="sm" />
          <div className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-medium text-v2-fg">{m.name}</span>
              {m.level_label ? <span className="hidden shrink-0 t-meta text-v2-faint sm:inline">{m.level_label}</span> : null}
            </span>
            <span className="truncate t-meta text-v2-muted t-tnum sm:hidden">{memberSpot(m, today)}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'program',
      header: 'Ahora',
      width: '42%',
      hideBelow: 'sm',
      sortValue: (m) => m.position * 100 + (m.week ?? 0),
      cell: (m) => <span className={m.program ? 'block truncate text-v2-muted t-tnum' : 'text-v2-faint'}>{memberSpot(m, today)}</span>,
    },
    {
      id: 'until',
      header: 'Plan hasta',
      width: '112px',
      hideBelow: 'md',
      sortValue: (m) => m.plan_end ?? '',
      cell: (m) => (m.plan_end ? <span className="text-v2-muted">{shortDate(m.plan_end)}</span> : <span className="text-v2-faint">—</span>),
    },
  ];

  const remove = async () => {
    setBusy(true);
    const r = await groupApi<GroupRemoveResult>(`/api/coach/groups/${group.id}/members`, 'POST', { athlete_ids: selection, action: 'remove' });
    setBusy(false);
    if (!r.ok) return toast({ title: r.error, tone: 'danger' });
    setSelection([]);
    toast({ title: `${r.data.removed.length} fuera del grupo`, description: 'Conservan el plan que ya tenían.' });
    onChanged();
  };

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 pt-4">
        <CardHeader
          title="Atletas"
          subtitle={group.member_count > 0 ? `${group.member_count} en el grupo` : undefined}
          action={
            <Button size="sm" icon={UserPlus} onClick={onAdd}>
              Añadir
            </Button>
          }
        />
      </div>
      {group.members.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState title="Nadie en el grupo todavía" action={<Button size="sm" onClick={onAdd}>Añadir atletas</Button>} />
        </div>
      ) : (
        <DataTable
          aria-label="Atletas del grupo"
          rows={group.members}
          columns={columns}
          getRowId={(m) => m.athlete_id}
          defaultSort={{ id: 'name', dir: 'asc' }}
          selection={selection}
          onSelectionChange={setSelection}
          onRowOpen={(m) => router.push(`/${locale}/atletas/${m.athlete_id}`)}
          className="rounded-none border-x-0 border-b-0"
        />
      )}
      {selection.length > 0 ? (
        <BulkBar count={selection.length} onClear={() => setSelection([])} noun={['atleta', 'atletas']}>
          <Button size="sm" loading={busy} onClick={() => void remove()}>
            Sacar del grupo
          </Button>
        </BulkBar>
      ) : null}
    </Card>
  );
}
