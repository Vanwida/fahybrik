'use client';

// Programar › Programas: la tabla de programas del coach. Nombre y etiquetas,
// semanas, nivel, cuántos atletas lo hacen, en qué grupos está y cuándo se tocó.
// Buscar, «+ Nuevo programa», duplicar y archivar (con deshacer).

import { useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Archive, Copy, MoreHorizontal, Plus, Search } from 'lucide-react';
import type { ProgramRow } from '@/lib/dashboard/programming/programs';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  FilterChip,
  IconButton,
  Input,
  Menu,
  PageHeader,
  Tag,
  useToast,
  type DataTableColumn,
} from '@/components/v2/ui';
import { localToday, relativeDayLabel } from '@/components/v2/shared/format';
import { matchesQuery, searchIndex } from '@/lib/dashboard/programming/search-key';
import { NewProgramDialog } from './NewProgramDialog';

type View = 'activos' | 'archivados';

async function patch(id: string, body: unknown): Promise<boolean> {
  const res = await fetch(`/api/coach/program-months/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  return !!res?.ok;
}

export function ProgramasList({
  programs,
  levels,
  maxWeeks,
}: {
  programs: ProgramRow[] | null;
  levels: Array<{ id: string; name: string; label: string }>;
  maxWeeks: number;
}) {
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('activos');
  // «+ Nuevo › Programa» del shell llega con ?nuevo=1: abre el diálogo.
  const params = useSearchParams();
  const [creating, setCreating] = useState(params?.get('nuevo') === '1');
  const today = localToday();
  const hrefOf = (id: string) => `/${locale}/programar/programas/${id}`;

  const indexed = useMemo(
    () => (programs ?? []).map((p) => ({ p, idx: searchIndex([p.name, p.level?.name ?? '', ...p.tags, ...p.groups.map((g) => g.name)].join(' ')) })),
    [programs],
  );
  const archivedCount = indexed.filter((x) => x.p.archived).length;
  const rows = indexed.filter((x) => (view === 'archivados' ? x.p.archived : !x.p.archived) && matchesQuery(x.idx, q)).map((x) => x.p);

  const archive = async (p: ProgramRow, archived: boolean) => {
    if (!(await patch(p.id, { archived }))) return toast({ title: 'No se pudo guardar', tone: 'danger' });
    router.refresh();
    toast({
      title: archived ? `«${p.name}» archivado` : `«${p.name}» recuperado`,
      description: archived && p.used_by > 0 ? 'Quien ya lo tiene asignado lo sigue haciendo.' : undefined,
      undo: async () => {
        await patch(p.id, { archived: !archived });
        router.refresh();
      },
    });
  };
  const duplicate = async (p: ProgramRow) => {
    const res = await fetch(`/api/coach/program-months/${p.id}/duplicate`, { method: 'POST', credentials: 'include' }).catch(() => null);
    const body = res?.ok ? ((await res.json()) as { id: string }) : null;
    if (!body) return toast({ title: 'No se pudo duplicar', tone: 'danger' });
    toast({ title: `«${p.name} (copia)» creado`, action: { label: 'Abrir', onClick: () => router.push(hrefOf(body.id)) } });
    router.refresh();
  };

  const columns: DataTableColumn<ProgramRow>[] = [
    {
      id: 'name',
      header: 'Programa',
      sortValue: (p) => p.name.toLowerCase(),
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-v2-fg">{p.name}</span>
          {p.tags.slice(0, 3).map((t) => (
            <Tag key={t} className="hidden md:inline-flex">
              {t}
            </Tag>
          ))}
        </div>
      ),
    },
    { id: 'weeks', header: 'Semanas', width: '96px', align: 'right', sortValue: (p) => p.weeks, cell: (p) => <span className="t-tnum">{p.weeks}</span> },
    {
      id: 'sessions',
      header: 'Entrenos',
      width: '96px',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (p) => p.sessions,
      cell: (p) => (p.sessions > 0 ? <span className="t-tnum">{p.sessions}</span> : <span className="text-v2-faint">vacío</span>),
    },
    {
      id: 'level',
      header: 'Nivel',
      width: '120px',
      hideBelow: 'md',
      sortValue: (p) => p.level?.name ?? '',
      cell: (p) => (p.level ? p.level.name : <span className="text-v2-faint">Sin nivel</span>),
    },
    {
      id: 'used',
      header: 'Atletas',
      width: '96px',
      align: 'right',
      defaultDir: 'desc',
      sortValue: (p) => p.used_by,
      cell: (p) => (p.used_by > 0 ? <span className="t-tnum">{p.used_by}</span> : <span className="text-v2-faint">—</span>),
    },
    {
      id: 'groups',
      header: 'Grupos',
      width: '18%',
      hideBelow: 'lg',
      cell: (p) =>
        p.groups.length > 0 ? <span className="truncate text-v2-muted">{p.groups.map((g) => g.name).join(', ')}</span> : <span className="text-v2-faint">—</span>,
    },
    {
      id: 'edited',
      header: 'Editado',
      width: '112px',
      hideBelow: 'sm',
      defaultDir: 'desc',
      sortValue: (p) => p.updated_at,
      cell: (p) => <span className="text-v2-muted">{relativeDayLabel(p.updated_at, today)}</span>,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Acciones</span>,
      width: '56px',
      cell: (p) => (
        <Menu
          trigger={<IconButton icon={MoreHorizontal} label={`Acciones de ${p.name}`} size="sm" />}
          items={[
            { label: 'Duplicar', icon: Copy, onSelect: () => void duplicate(p) },
            { label: p.archived ? 'Recuperar' : 'Archivar', icon: Archive, onSelect: () => void archive(p, !p.archived) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Programas"
        count={programs ? indexed.length - archivedCount : null}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Nuevo programa
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar programa, etiqueta o grupo" aria-label="Buscar programas" className="w-full sm:w-72" />
          <FilterChip active={view === 'activos'} onClick={() => setView('activos')}>
            Activos
          </FilterChip>
          {archivedCount > 0 ? (
            <FilterChip active={view === 'archivados'} count={archivedCount} onClick={() => setView('archivados')}>
              Archivados
            </FilterChip>
          ) : null}
        </div>
      </PageHeader>

      {programs === null ? (
        <ErrorState variant="page" description="La lista de programas no ha cargado." onRetry={() => router.refresh()} />
      ) : indexed.length === 0 ? (
        <EmptyState
          variant="page"
          title="Todavía no tienes programas"
          description="Un programa son varias semanas con nombre que luego das a un grupo o a varios atletas."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              Nuevo programa
            </Button>
          }
        />
      ) : (
        <DataTable
          aria-label="Programas"
          rows={rows}
          columns={columns}
          getRowId={(p) => p.id}
          defaultSort={{ id: 'edited', dir: 'desc' }}
          onRowOpen={(p) => router.push(hrefOf(p.id))}
          stickyTop={48}
          empty={<EmptyState title={q ? `Ningún programa con «${q}»` : 'Nada archivado'} />}
        />
      )}
      {creating ? <NewProgramDialog levels={levels} maxWeeks={maxWeeks} onClose={() => setCreating(false)} onCreated={(id) => router.push(hrefOf(id))} /> : null}
    </div>
  );
}
