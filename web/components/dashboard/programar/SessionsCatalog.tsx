'use client';

// SessionsCatalog — pestaña "Sesiones" de la biblioteca única (/programar,
// spec §3a). Funde los bloques de Pablo (read-only, badge Pablo) y los
// entrenos propios (badge Propia) en UN grid con UN sistema de tags: grupo
// metodológico (con su color), formato, fase ATR y nivel — más búsqueda.

import { useMemo, useState } from 'react';
import type { Block } from '@fahybrid/shared/schema/blocks';
import type { MethodologyGroup } from '@fahybrid/shared/schema/methodology-groups';
import { FilterChip } from '@/components/dashboard/ui/FilterChip';
import { SearchInput } from '@/components/dashboard/ui/SearchInput';
import { groupColorFor } from '@/lib/dashboard/programming/group-colors';
import { ATR_PHASE_ORDER } from '@/lib/dashboard/constants/atr-phases';
import { cn } from '@/lib/utils';
import {
  blockToLibraryItem,
  countActiveFilters,
  EMPTY_LIBRARY_FILTERS,
  filterLibraryItems,
  FORMAT_FACETS,
  SESSION_LEVEL_LABELS,
  templateToLibraryItem,
  type LibraryFilters,
  type LibrarySessionItem,
  type TemplateRow,
} from './library-items';
import { SessionCard } from './SessionCard';
import { LibrarySessionDrawer, type LibraryDrawerItem } from './LibrarySessionDrawer';

interface SessionsCatalogProps {
  blocks: Block[];
  templates: TemplateRow[];
  methodologyGroups: MethodologyGroup[];
  /** Drawer del item abierto + alta — los controla el hub (deep-link de "+ Nueva sesión"). */
  openItem: LibraryDrawerItem | null;
  onOpenItem: (item: LibraryDrawerItem | null) => void;
  onMutated: () => void;
}

export function SessionsCatalog({
  blocks,
  templates,
  methodologyGroups,
  openItem,
  onOpenItem,
  onMutated,
}: SessionsCatalogProps) {
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_LIBRARY_FILTERS);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const items = useMemo<LibrarySessionItem[]>(() => {
    const own = templates.map(templateToLibraryItem);
    const pablo = blocks.map(blockToLibraryItem);
    // Propias primero (lo que el coach toca a diario), luego la base de Pablo.
    return [...own, ...pablo];
  }, [blocks, templates]);

  const groupNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of methodologyGroups) map.set(g.id, g.name_es);
    return map;
  }, [methodologyGroups]);

  const sortedGroups = useMemo(
    () => [...methodologyGroups].sort((a, b) => a.sort_order - b.sort_order),
    [methodologyGroups],
  );

  const filtered = useMemo(() => filterLibraryItems(items, filters), [items, filters]);
  const activeFilters = countActiveFilters(filters);

  const patch = (p: Partial<LibraryFilters>) => setFilters((prev) => ({ ...prev, ...p }));
  const toggle = <K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) =>
    patch({ [key]: filters[key] === value ? 'all' : value } as Partial<LibraryFilters>);

  const handleDelete = async (item: LibrarySessionItem) => {
    setDeletingId(item.key);
    try {
      // Pre-vuelo: aviso de uso en semanas plantilla (mismo contrato que antes).
      const detailRes = await fetch(`/api/coach/templates/${item.source_id}`, {
        credentials: 'include',
      });
      let usage = 0;
      if (detailRes.ok) {
        const json = (await detailRes.json()) as { usage_in_weeks?: number };
        usage = json.usage_in_weeks ?? 0;
      }
      const message =
        usage > 0
          ? `Esta sesión se usa en ${usage} ${usage === 1 ? 'semana plantilla' : 'semanas plantilla'}. Borrarla no afecta a semanas ya guardadas, pero no podrás reutilizarla. ¿Continuar?`
          : `¿Borrar "${item.title}"?`;
      if (!window.confirm(message)) return;

      const res = await fetch(`/api/coach/templates/${item.source_id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        window.alert(json?.error?.message ?? `Error al borrar (HTTP ${res.status})`);
        return;
      }
      onMutated();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Error al borrar');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Búsqueda + resumen */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] max-w-md flex-1">
          <SearchInput
            value={filters.search}
            onChange={(v) => patch({ search: v })}
            placeholder="Buscar sesión… (nombre, prescripción)"
          />
        </div>
        <p className="text-xs text-[color:var(--text-muted)]">
          <strong className="metric-num font-semibold text-[color:var(--fg)]">
            {filtered.length}
          </strong>{' '}
          {filtered.length === 1 ? 'sesión' : 'sesiones'}
          {activeFilters > 0 ? (
            <>
              {' '}
              · filtrado por{' '}
              <strong className="font-semibold text-[color:var(--fg)]">
                {activeFilters} {activeFilters === 1 ? 'tag' : 'tags'}
              </strong>
            </>
          ) : null}
        </p>
        {activeFilters > 0 || filters.search ? (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_LIBRARY_FILTERS)}
            className="focus-ring text-xs font-semibold text-[color:var(--text-muted)] underline underline-offset-2 hover:text-[color:var(--fg)]"
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>

      {/* Un solo sistema de tags, agrupado por faceta */}
      <div className="flex flex-col gap-2" role="group" aria-label="Filtrar por tags">
        <Facet label="Grupo">
          {sortedGroups.map((g) => {
            const color = groupColorFor(g.id);
            return (
              <FilterChip
                key={g.id}
                label={g.name_es}
                active={filters.group === g.id}
                onClick={() => toggle('group', g.id)}
                className="inline-flex items-center gap-1.5"
                leading={
                  <span
                    aria-hidden
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ backgroundColor: color.color }}
                  />
                }
              />
            );
          })}
          <FilterChip
            label="Sin grupo"
            active={filters.group === 'none'}
            onClick={() => toggle('group', 'none')}
          />
        </Facet>

        <Facet label="Formato">
          {FORMAT_FACETS.map((f) => (
            <FilterChip
              key={f.id}
              label={f.label}
              active={filters.format === f.id}
              onClick={() => toggle('format', f.id)}
            />
          ))}
        </Facet>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Facet label="Fase ATR">
            {ATR_PHASE_ORDER.map((key) => (
              <FilterChip
                key={key}
                label={key}
                active={filters.atr === key}
                onClick={() => toggle('atr', key)}
              />
            ))}
          </Facet>
          <Facet label="Nivel">
            {Object.entries(SESSION_LEVEL_LABELS).map(([value, label]) => (
              <FilterChip
                key={value}
                label={label}
                active={filters.level === Number(value)}
                onClick={() => toggle('level', Number(value))}
              />
            ))}
          </Facet>
          <Facet label="Origen">
            <FilterChip
              label="Pablo"
              active={filters.origin === 'pablo'}
              onClick={() => toggle('origin', 'pablo')}
            />
            <FilterChip
              label="Propias"
              active={filters.origin === 'propia'}
              onClick={() => toggle('origin', 'propia')}
            />
          </Facet>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState anyItems={items.length > 0} />
      ) : (
        <ul
          role="list"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >
          {filtered.map((item) => (
            <li key={item.key} className="h-full">
              <SessionCard
                item={item}
                groupName={
                  item.methodology_group_id != null
                    ? (groupNames.get(item.methodology_group_id) ?? null)
                    : null
                }
                onOpen={() =>
                  onOpenItem(
                    item.origin === 'pablo'
                      ? { kind: 'pablo', block_id: Number(item.source_id) }
                      : { kind: 'own', template_id: item.source_id },
                  )
                }
                onDelete={item.origin === 'propia' ? () => void handleDelete(item) : undefined}
                deleting={deletingId === item.key}
              />
            </li>
          ))}
        </ul>
      )}

      <LibrarySessionDrawer
        item={openItem}
        methodologyGroups={methodologyGroups}
        onClose={() => onOpenItem(null)}
        onMutated={onMutated}
      />
    </div>
  );
}

function Facet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={label}
    >
      <span className="micro-label mr-0.5">{label}</span>
      {children}
    </span>
  );
}

function EmptyState({ anyItems }: { anyItems: boolean }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span
          aria-hidden
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-full border text-2xl',
            'border-[color:var(--border-subtle)] text-[color:var(--text-muted)]',
          )}
        >
          +
        </span>
        <h2 className="font-headline-md text-[color:var(--fg)]">
          {anyItems ? 'Sin resultados' : 'Aún no hay sesiones'}
        </h2>
        <p className="text-sm text-[color:var(--text-muted)]">
          {anyItems
            ? 'Ajusta los tags o el término de búsqueda.'
            : 'Crea la primera con "+ Nueva sesión".'}
        </p>
      </div>
    </div>
  );
}
