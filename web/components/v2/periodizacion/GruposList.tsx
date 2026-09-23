'use client';

// Programar › Grupos: cada grupo con su gente y su plan (la cadena de programas).
// La regla nivel × días, si la tiene, se ve como una etiqueta — no es la entrada.

import { useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import type { GroupSummary } from '@fahybrid/shared/schema/groups';
import { Button, DataTable, EmptyState, ErrorState, Input, PageHeader, Tag, type DataTableColumn } from '@/components/v2/ui';
import { localToday, relativeDayLabel } from '@/components/v2/shared/format';
import { matchesQuery, searchIndex } from '@/lib/dashboard/programming/search-key';
import { NewGroupDialog } from './NewGroupDialog';

export function GruposList({ groups }: { groups: GroupSummary[] | null }) {
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(params?.get('nuevo') === '1');
  const today = localToday();
  const indexed = useMemo(() => (groups ?? []).map((g) => ({ g, idx: searchIndex([g.display_name, ...g.programs.map((p) => p.name)].join(' ')) })), [groups]);
  const rows = indexed.filter((x) => matchesQuery(x.idx, q)).map((x) => x.g);

  const columns: DataTableColumn<GroupSummary>[] = [
    {
      id: 'name',
      header: 'Grupo',
      sortValue: (g) => g.display_name.toLowerCase(),
      cell: (g) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-v2-fg">{g.display_name}</span>
          {g.auto_rule && g.name ? <Tag className="hidden md:inline-flex">{`${g.level?.name} · ${g.days_per_week} días`}</Tag> : null}
        </div>
      ),
    },
    { id: 'members', header: 'Atletas', width: '96px', align: 'right', defaultDir: 'desc', sortValue: (g) => g.member_count, cell: (g) => (g.member_count > 0 ? <span className="t-tnum">{g.member_count}</span> : <span className="text-v2-faint">—</span>) },
    {
      id: 'plan',
      header: 'Plan',
      width: '40%',
      hideBelow: 'md',
      cell: (g) =>
        g.programs.length > 0 ? (
          <span className="block truncate text-v2-muted">{g.programs.map((p) => p.name).join(' → ')}</span>
        ) : (
          <span className="text-v2-faint">Sin programas</span>
        ),
    },
    { id: 'weeks', header: 'Semanas', width: '96px', align: 'right', hideBelow: 'sm', sortValue: (g) => g.total_weeks, cell: (g) => <span className="t-tnum">{g.total_weeks || '—'}</span> },
    { id: 'edited', header: 'Editado', width: '104px', hideBelow: 'lg', defaultDir: 'desc', sortValue: (g) => g.updated_at, cell: (g) => <span className="text-v2-muted">{relativeDayLabel(g.updated_at, today)}</span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Grupos"
        count={groups ? groups.length : null}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Nuevo grupo
          </Button>
        }
      >
        <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar grupo o programa" aria-label="Buscar grupos" className="w-full sm:w-72" />
      </PageHeader>
      {groups === null ? (
        <ErrorState variant="page" description="Los grupos no han cargado." onRetry={() => router.refresh()} />
      ) : groups.length === 0 ? (
        <EmptyState
          variant="page"
          title="Todavía no tienes grupos"
          description="Un grupo son atletas que siguen el mismo plan: sus programas en orden."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              Nuevo grupo
            </Button>
          }
        />
      ) : (
        <DataTable
          aria-label="Grupos"
          rows={rows}
          columns={columns}
          getRowId={(g) => g.id}
          defaultSort={{ id: 'members', dir: 'desc' }}
          onRowOpen={(g) => router.push(`/${locale}/programar/grupos/${g.id}`)}
          stickyTop={48}
          empty={<EmptyState title={`Ningún grupo con «${q}»`} />}
        />
      )}
      {creating ? <NewGroupDialog onClose={() => setCreating(false)} onCreated={(id) => router.push(`/${locale}/programar/grupos/${id}`)} /> : null}
    </div>
  );
}
