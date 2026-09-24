'use client';

// La biblioteca al lado de la rejilla: buscar (ES/EN, sin tildes ni plurales),
// ver lo que hay listo, arrastrar a una celda (o Enter / «Insertar» en la celda
// seleccionada). Un entreno entra como un entreno más del día; un bloque, como
// bloques del entreno de la celda. Siempre es una copia.

import { useMemo, useState, type DragEvent } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import type { LibraryRow } from '@/lib/dashboard/programming/library';
import { EmptyState, FilterChip, IconButton, Input } from '@/components/v2/ui';
import { MODALITY_META } from '@/components/v2/constants';
import { matchesQuery, searchIndex } from '@/lib/dashboard/programming/search-key';
import { cn } from '@/lib/utils';

export const LIB_DRAG_TYPE = 'application/x-programar-biblioteca';

type Filter = 'listos' | 'revisar';

export function LibraryPanel({
  items,
  onInsert,
  className,
}: {
  items: LibraryRow[];
  onInsert: (item: LibraryRow) => void;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('listos');
  const indexed = useMemo(() => items.filter((i) => !i.archived).map((i) => ({ item: i, idx: searchIndex(i.search) })), [items]);
  const counts = useMemo(
    () => ({
      listos: indexed.filter((x) => x.item.status !== 'por_revisar').length,
      revisar: indexed.filter((x) => x.item.status === 'por_revisar').length,
    }),
    [indexed],
  );
  const shown = indexed
    .filter((x) => (filter === 'listos' ? x.item.status !== 'por_revisar' : x.item.status === 'por_revisar'))
    .filter((x) => matchesQuery(x.idx, q))
    .slice(0, 80);

  const onDragStart = (item: LibraryRow, e: DragEvent) => {
    e.dataTransfer.setData(LIB_DRAG_TYPE, JSON.stringify({ kind: item.kind, id: item.id }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside aria-label="Biblioteca" className={cn('flex min-h-0 flex-col gap-3', className)}>
      <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en tu biblioteca…" aria-label="Buscar en la biblioteca" />
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={filter === 'listos'} count={counts.listos} onClick={() => setFilter('listos')}>
          Listos
        </FilterChip>
        <FilterChip active={filter === 'revisar'} count={counts.revisar} onClick={() => setFilter('revisar')}>
          Por revisar
        </FilterChip>
      </div>
      <ul className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="Entrenos y bloques de la biblioteca">
        {shown.length === 0 ? (
          <li className="px-1">
            <EmptyState title={q ? `Nada con «${q}»` : filter === 'listos' ? 'Todavía no hay nada listo' : 'Nada por revisar'} />
          </li>
        ) : (
          shown.map(({ item }) => {
            const insertable = item.status !== 'por_revisar';
            return (
              <li
                key={`${item.kind}-${item.id}`}
                draggable={insertable}
                onDragStart={(e) => onDragStart(item, e)}
                className={cn('group/lib flex items-start gap-2 rounded-ctl px-1.5 py-1.5', insertable ? 'cursor-grab hover:bg-v2-hover active:cursor-grabbing' : 'opacity-80')}
              >
                <span
                  aria-hidden
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.modality ? `var(${MODALITY_META[item.modality].colorVar})` : 'var(--v2-border-strong)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate t-body-sm font-medium text-v2-fg">{item.kind === 'entreno' ? `Entreno «${item.title}»` : item.title}</p>
                  <p className="truncate t-meta text-v2-faint">
                    {insertable
                      ? [item.lines[0], item.used_in > 0 ? `usado en ${item.used_in}` : null].filter(Boolean).join(' · ')
                      : (item.prose_excerpt ?? 'Sin escribir')}
                  </p>
                </div>
                {insertable ? (
                  <IconButton
                    icon={CornerDownLeft}
                    label="Insertar en la celda seleccionada"
                    size="sm"
                    className="opacity-0 group-hover/lib:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                    onClick={() => onInsert(item)}
                  />
                ) : null}
              </li>
            );
          })
        )}
      </ul>
      <p className="t-meta text-v2-faint">Arrastra a una celda · Alt para copiar entre celdas</p>
    </aside>
  );
}
