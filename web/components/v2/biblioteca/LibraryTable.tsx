'use client';

// Entrenos o bloques de la biblioteca como TABLA densa (informe D §4.4): nombre y
// etiquetas, su contenido en compacto, «Usado en N», editado y estado. Por
// defecto solo lo LISTO; «Por revisar» es la cola de lo importado sin escribir
// (se abre con su texto original al lado del editor). «Posibles duplicados»
// agrupa por título. Selección en bloque: etiquetar y archivar, con deshacer.

import { useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Search, Tag as TagIcon } from 'lucide-react';
import type { LibraryRow, LibraryStatus } from '@/lib/dashboard/programming/library';
import {
  BulkBar,
  Button,
  DataTable,
  EmptyState,
  FilterChip,
  Input,
  StatusBadge,
  Tag,
  useToast,
  type DataTableColumn,
  type StatusTone,
} from '@/components/v2/ui';
import { MODALITY_META } from '@/components/v2/constants';
import { localToday, relativeDayLabel } from '@/components/v2/shared/format';
import { matchesQuery, searchIndex } from '@/lib/dashboard/programming/search-key';
import { TagDialog } from './TagDialog';
import { LibraryPreview } from './LibraryPreview';
import { defaultLibFilter, type LibFilter } from './library-filter';

const STATUS: Record<LibraryStatus, { tone: StatusTone; label: string }> = {
  listo: { tone: 'ok', label: 'Listo' },
  sin_dosis: { tone: 'warn', label: 'Incompleto' },
  por_revisar: { tone: 'info', label: 'Por revisar' },
};

function titleKey(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

async function bulk(body: unknown): Promise<boolean> {
  const res = await fetch('/api/coach/editor/library-bulk', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  return !!res?.ok;
}

export function LibraryTable({
  rows,
  noun,
  filter: asked,
  onFilter,
}: {
  rows: LibraryRow[];
  noun: 'entreno' | 'bloque';
  /** null = la URL no pide ninguno: se abre en el de por defecto (defaultLibFilter). */
  filter: LibFilter | null;
  onFilter: (f: LibFilter) => void;
}) {
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [selection, setSelection] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [tagging, setTagging] = useState(false);
  const today = localToday();

  const indexed = useMemo(() => rows.map((r) => ({ r, idx: searchIndex(r.search) })), [rows]);
  const dupTitles = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of rows) if (!r.archived) n.set(titleKey(r.title), (n.get(titleKey(r.title)) ?? 0) + 1);
    return n;
  }, [rows]);
  const identical = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of rows) if (!r.archived) n.set(r.content_key, (n.get(r.content_key) ?? 0) + 1);
    return n;
  }, [rows]);

  const live = indexed.filter((x) => !x.r.archived);
  const counts = {
    listos: live.filter((x) => x.r.status === 'listo').length,
    sin_dosis: live.filter((x) => x.r.status === 'sin_dosis').length,
    revisar: live.filter((x) => x.r.status === 'por_revisar').length,
    duplicados: live.filter((x) => (dupTitles.get(titleKey(x.r.title)) ?? 0) > 1).length,
    archivados: indexed.length - live.length,
  };
  const filter = asked ?? defaultLibFilter(counts);
  const visible = indexed
    .filter(({ r }) => {
      if (filter === 'archivados') return r.archived;
      if (r.archived) return false;
      if (filter === 'listos') return r.status === 'listo';
      if (filter === 'sin_dosis') return r.status === 'sin_dosis';
      if (filter === 'revisar') return r.status === 'por_revisar';
      return (dupTitles.get(titleKey(r.title)) ?? 0) > 1;
    })
    .filter((x) => matchesQuery(x.idx, q))
    .map((x) => x.r);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const activeRow = active ? (byId.get(active) ?? null) : (visible[0] ?? null);
  const hrefOf = (r: LibraryRow) =>
    `/${locale}/programar/biblioteca/${r.kind === 'bloque' ? 'bloque' : 'entreno'}/${r.id}${r.status === 'por_revisar' && filter === 'revisar' ? '?cola=1' : ''}`;

  const selectedItems = selection.map((id) => ({ kind: noun, id: Number(id) }));
  const archive = async (archived: boolean) => {
    const items = selectedItems;
    if (!(await bulk({ action: archived ? 'archive' : 'unarchive', items }))) return toast({ title: 'No se pudo guardar', tone: 'danger' });
    setSelection([]);
    router.refresh();
    toast({
      title: `${items.length} ${archived ? 'archivados' : 'recuperados'}`,
      undo: async () => {
        await bulk({ action: archived ? 'unarchive' : 'archive', items });
        router.refresh();
      },
    });
  };

  const columns: DataTableColumn<LibraryRow>[] = [
    {
      id: 'title',
      header: noun === 'entreno' ? 'Entreno' : 'Bloque',
      sortValue: (r) => (filter === 'duplicados' ? titleKey(r.title) : r.title.toLowerCase()),
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: r.modality ? `var(${MODALITY_META[r.modality].colorVar})` : 'var(--v2-border-strong)' }} />
          <span className="truncate font-medium text-v2-fg">{r.title}</span>
          {filter === 'duplicados' && (identical.get(r.content_key) ?? 0) > 1 ? <Tag>idéntico</Tag> : null}
          {r.tags.slice(0, 2).map((t) => (
            <Tag key={t} className="hidden lg:inline-flex">
              {t}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      id: 'content',
      header: 'Contenido',
      width: '34%',
      hideBelow: 'md',
      cell: (r) => <span className="block truncate text-v2-muted t-tnum">{r.status === 'por_revisar' ? (r.prose_excerpt ?? 'Sin texto') : r.lines.slice(0, 2).join(' · ')}</span>,
    },
    { id: 'used', header: 'Usado en', width: '96px', align: 'right', defaultDir: 'desc', sortValue: (r) => r.used_in, cell: (r) => (r.used_in > 0 ? <span className="t-tnum">{r.used_in}</span> : <span className="text-v2-faint">—</span>) },
    { id: 'edited', header: 'Editado', width: '104px', hideBelow: 'sm', defaultDir: 'desc', sortValue: (r) => r.updated_at, cell: (r) => <span className="text-v2-muted">{relativeDayLabel(r.updated_at, today)}</span> },
    { id: 'status', header: 'Estado', width: '128px', hideBelow: 'sm', sortValue: (r) => r.status, cell: (r) => <StatusBadge tone={STATUS[r.status].tone} label={STATUS[r.status].label} /> },
  ];

  const empty =
    q !== ''
      ? `Nada con «${q}»`
      : filter === 'revisar'
        ? 'Nada por revisar'
        : filter === 'duplicados'
          ? 'Sin títulos repetidos'
          : filter === 'archivados'
            ? 'Nada archivado'
            : filter === 'sin_dosis'
              ? 'Nada incompleto'
              : `Todavía no hay ${noun === 'entreno' ? 'entrenos' : 'bloques'} listos`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar (también en inglés)" aria-label="Buscar en la biblioteca" className="w-full sm:w-72" />
        <FilterChip active={filter === 'listos'} count={counts.listos} onClick={() => onFilter('listos')}>
          Listos
        </FilterChip>
        {counts.sin_dosis > 0 ? (
          <FilterChip active={filter === 'sin_dosis'} count={counts.sin_dosis} onClick={() => onFilter('sin_dosis')}>
            Incompletos
          </FilterChip>
        ) : null}
        <FilterChip active={filter === 'revisar'} count={counts.revisar} onClick={() => onFilter('revisar')}>
          Por revisar
        </FilterChip>
        {counts.duplicados > 0 ? (
          <FilterChip active={filter === 'duplicados'} count={counts.duplicados} onClick={() => onFilter('duplicados')}>
            Posibles duplicados
          </FilterChip>
        ) : null}
        {counts.archivados > 0 ? (
          <FilterChip active={filter === 'archivados'} count={counts.archivados} onClick={() => onFilter('archivados')}>
            Archivados
          </FilterChip>
        ) : null}
      </div>
      {filter === 'revisar' && visible[0] && q === '' ? (
        <p className="flex items-center gap-2 t-body-sm text-v2-muted">
          <span className="t-tnum">
            {counts.revisar} {noun === 'entreno' ? (counts.revisar === 1 ? 'entreno' : 'entrenos') : counts.revisar === 1 ? 'bloque' : 'bloques'} por revisar
          </span>
          <span aria-hidden>·</span>
          <Button size="sm" variant="primary" onClick={() => router.push(hrefOf(visible[0]!))}>
            Empezar
          </Button>
        </p>
      ) : null}
      <div className="flex min-w-0 gap-4">
        <div className="min-w-0 flex-1">
          <DataTable
            aria-label={noun === 'entreno' ? 'Entrenos' : 'Bloques'}
            rows={visible}
            columns={columns}
            getRowId={(r) => r.id}
            defaultSort={filter === 'duplicados' ? { id: 'title', dir: 'asc' } : { id: 'edited', dir: 'desc' }}
            selection={selection}
            onSelectionChange={setSelection}
            activeId={activeRow?.id ?? null}
            onActiveChange={setActive}
            onRowOpen={(r) => router.push(hrefOf(r))}
            stickyTop={48}
            empty={<EmptyState title={empty} />}
          />
        </div>
        {activeRow ? <LibraryPreview row={activeRow} className="sticky top-16 hidden w-80 shrink-0 self-start xl:flex" /> : null}
      </div>
      {selection.length > 0 ? (
        <BulkBar count={selection.length} onClear={() => setSelection([])} noun={noun === 'entreno' ? ['entreno', 'entrenos'] : ['bloque', 'bloques']}>
          <Button size="sm" icon={TagIcon} onClick={() => setTagging(true)}>
            Etiquetar…
          </Button>
          {filter === 'archivados' ? (
            <Button size="sm" icon={ArchiveRestore} onClick={() => void archive(false)}>
              Recuperar
            </Button>
          ) : (
            <Button size="sm" icon={Archive} onClick={() => void archive(true)}>
              Archivar
            </Button>
          )}
        </BulkBar>
      ) : null}
      {tagging ? (
        <TagDialog
          count={selection.length}
          noun={noun === 'entreno' ? ['entreno', 'entrenos'] : ['bloque', 'bloques']}
          existing={[...new Set(selection.flatMap((id) => byId.get(id)?.tags ?? []))]}
          onClose={() => setTagging(false)}
          onApply={async (add, remove) => {
            const ok = await bulk({ action: 'tag', items: selectedItems, add, remove });
            if (!ok) {
              toast({ title: 'No se pudieron guardar las etiquetas', tone: 'danger' });
              return;
            }
            setTagging(false);
            router.refresh();
            toast({ title: 'Etiquetas guardadas' });
          }}
        />
      ) : null}
    </div>
  );
}
