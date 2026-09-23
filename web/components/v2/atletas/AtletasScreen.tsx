'use client';

// /atletas — la tabla del roster (plan §6 «Atletas»). Orquesta: cabecera con
// recuentos e invitar · vistas guardadas · búsqueda y filtros (todo en la URL:
// sobrevive a atrás/adelante y a recargar) · tabla, tarjetas o lista del móvil ·
// vistazo no modal (Enter / clic; J/K cambian de atleta con él abierto) ·
// barra de acciones en bloque. Las filas llegan del servidor una vez; filtrar,
// buscar y ordenar es local y cambia la URL con la History API (sin recargar).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { MoreHorizontal, Search, Upload, UserPlus, Users } from 'lucide-react';
import type { SavedView } from '@fahybrid/shared/schema/saved-views';
import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Kbd,
  Menu,
  PageHeader,
  SegmentedControl,
  type SortState,
} from '@/components/v2/ui';
import { AthletePeek } from '@/components/v2/shared/AthletePeek';
import { PageContainer } from '@/components/v2/PageFrame';
import type { AtletasData } from './load-atletas';
import {
  applyRosterQuery,
  fichaHref,
  parseRosterQuery,
  serializeRosterQuery,
  viewQueryString,
  type Density,
  type RosterFilter,
  type RosterQuery,
} from './roster-query';
import { AthletesTable } from './AthletesTable';
import { AthleteCards } from './AthleteCards';
import { AthleteListMobile } from './AthleteListMobile';
import { ViewChips } from './ViewChips';
import { FilterBar, FilterSheetButton, useFacets, withFacet } from './RosterFilters';
import { BulkActions } from './BulkActions';
import { InviteDialog, type InviteMode } from './InviteDialog';
import { DoublesSheet } from './DoublesSheet';

function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

/** «94 activos · 6 nuevos · 5 en pausa». */
function headline(rows: readonly RosterRow[]): string {
  const n = (k: RosterRow['lifecycle']) => rows.filter((r) => r.lifecycle === k).length;
  const parts = [`${n('activo')} activos`];
  if (n('nuevo') > 0) parts.push(`${n('nuevo')} ${n('nuevo') === 1 ? 'nuevo' : 'nuevos'}`);
  if (n('pausado') > 0) parts.push(`${n('pausado')} en pausa`);
  return parts.join(' · ');
}

export function AtletasScreen({ data }: { data: AtletasData }) {
  const router = useRouter();
  const params = useSearchParams();
  const phone = useIsPhone();
  const rows = useMemo(() => data.rows ?? [], [data.rows]);
  const query = useMemo(() => parseRosterQuery(params.toString()), [params]);
  const visible = useMemo(() => applyRosterQuery(rows, query), [rows, query]);

  const [views, setViews] = useState<SavedView[]>(data.saved_views);
  const [selection, setSelection] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteMode | null>(null);
  const [doubles, setDoubles] = useState(false);
  const [search, setSearch] = useState(query.q);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── URL ────────────────────────────────────────────────────────────────────
  const go = useCallback((next: RosterQuery, mode: 'push' | 'replace' = 'push') => {
    const qs = serializeRosterQuery(next);
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    if (mode === 'push') window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  }, []);

  const setFilter = (f: RosterFilter) => go({ ...query, ...f });
  const pickView = (viewQuery: string) => {
    const next = parseRosterQuery(viewQuery);
    setSearch('');
    go({ ...next, q: '', densidad: query.densidad });
  };

  // La búsqueda escribe en la URL sin apilar historial por cada letra.
  useEffect(() => {
    if (search.trim() === query.q) return;
    const t = setTimeout(() => go({ ...query, q: search.trim() }, 'replace'), 150);
    return () => clearTimeout(t);
  }, [search, query, go]);

  // Atrás/adelante cambian la URL: la caja de búsqueda la sigue. Lo que escribe el
  // coach vuelve igual (recortado), así que no se le pisa mientras teclea.
  const [urlQ, setUrlQ] = useState(query.q);
  if (urlQ !== query.q) {
    setUrlQ(query.q);
    if (search.trim() !== query.q) setSearch(query.q);
  }

  // Intención del shell: /atletas?invitar=1 abre «Invitar atletas» (también si ya
  // estábamos aquí) y el parámetro sale de la URL para que recargar no lo repita.
  const inviteIntent = params.get('invitar') === '1';
  const [intentSeen, setIntentSeen] = useState(false);
  if (inviteIntent !== intentSeen) {
    setIntentSeen(inviteIntent);
    if (inviteIntent) setInvite('uno');
  }
  useEffect(() => {
    if (!inviteIntent) return;
    const p = new URLSearchParams(window.location.search);
    p.delete('invitar');
    const qs = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [inviteIntent]);

  // «/» lleva a la búsqueda; J/K con el vistazo abierto y el foco fuera de la tabla.
  const visibleIds = useMemo(() => visible.map((r) => r.athlete_id), [visible]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!peekId || (e.key !== 'j' && e.key !== 'k' && e.key !== 'J' && e.key !== 'K')) return;
      const i = visibleIds.indexOf(peekId);
      const next = visibleIds[Math.min(visibleIds.length - 1, Math.max(0, i + (e.key.toLowerCase() === 'j' ? 1 : -1)))];
      if (next) {
        e.preventDefault();
        setActiveId(next);
        setPeekId(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [peekId, visibleIds]);

  // Con el vistazo abierto, moverse por la tabla (J/K dentro) le lleva detrás.
  const onActiveChange = useCallback(
    (id: string | null) => {
      setActiveId(id);
      if (peekId && id) setPeekId(id);
    },
    [peekId],
  );
  const openPeek = useCallback((r: RosterRow) => {
    setActiveId(r.athlete_id);
    setPeekId(r.athlete_id);
  }, []);
  const hrefFor = useCallback((r: RosterRow) => fichaHref(r.athlete_id, query), [query]);

  // La selección solo guarda lo que sigue a la vista.
  const selectedRows = useMemo(() => {
    const set = new Set(selection);
    return visible.filter((r) => set.has(r.athlete_id));
  }, [selection, visible]);

  const refresh = useCallback(() => {
    setSelection([]);
    router.refresh();
  }, [router]);

  const facets = useFacets(rows, query, data.levels, data.level_axis_label);
  const hasFilters =
    query.q !== '' || serializeRosterQuery({ ...query, q: '', orden: null, densidad: 'tabla' }) !== '';
  const clear = hasFilters ? () => pickView('estado=todos') : null;
  const peekRow = peekId ? rows.find((r) => r.athlete_id === peekId) : undefined;

  const actions = (
    <>
      <Button icon={Upload} onClick={() => setInvite('lista')} className="hidden sm:inline-flex">
        Importar lista
      </Button>
      <Button variant="primary" icon={UserPlus} onClick={() => setInvite('uno')}>
        Invitar atletas
      </Button>
      <Menu
        trigger={<IconButton icon={MoreHorizontal} label="Más" variant="ghost" />}
        items={[
          { label: 'Importar lista', icon: Upload, onSelect: () => setInvite('lista') },
          { label: 'Parejas de dobles', icon: Users, onSelect: () => setDoubles(true) },
        ]}
      />
    </>
  );

  const isTodos = serializeRosterQuery({ ...query, orden: null, densidad: 'tabla' }) === 'estado=todos';
  const isDefault = serializeRosterQuery({ ...query, orden: null, densidad: 'tabla' }) === '';
  const empty =
    rows.length === 0 ? (
      <EmptyState
        title="Todavía no tienes atletas"
        action={
          <Button size="sm" variant="primary" icon={UserPlus} onClick={() => setInvite('uno')}>
            Invitar atletas
          </Button>
        }
      />
    ) : (
      <EmptyState
        title={isDefault ? 'Nadie necesita nada ahora' : 'Nadie en esta vista'}
        description={query.q ? `ninguno coincide con «${query.q}»` : undefined}
        action={
          isTodos && !query.q ? undefined : (
            <Button size="sm" variant="ghost" onClick={() => pickView('estado=todos')}>
              Ver todos
            </Button>
          )
        }
      />
    );

  return (
    <PageContainer>
      <PageHeader title="Atletas" count={data.rows ? rows.length : null} subtitle={data.rows && rows.length > 0 ? headline(rows) : undefined} actions={actions}>
        {data.rows && rows.length > 0 ? (
          <ViewChips
            rows={rows}
            filter={query}
            currentViewQuery={viewQueryString(query)}
            views={views}
            onViewsChange={setViews}
            onPick={pickView}
          />
        ) : null}
      </PageHeader>

      {data.rows == null ? (
        <ErrorState
          variant="page"
          title="No se ha podido cargar tu lista de atletas"
          description="Tus datos están bien; es la lista la que no ha cargado."
          onRetry={() => router.refresh()}
        />
      ) : (
        <>
          {rows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                ref={searchRef}
                icon={Search}
                size={phone ? 'lg' : 'md'}
                type="search"
                aria-label="Buscar atleta"
                placeholder="Buscar nombre, email, grupo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && search) {
                    e.preventDefault();
                    setSearch('');
                  }
                }}
                trailing={phone ? undefined : <Kbd>/</Kbd>}
                className="min-w-0 flex-1 md:w-64 md:flex-none"
              />
              <FilterSheetButton
                facets={facets}
                onFacetChange={(k, v) => setFilter(withFacet(query, k, v))}
                onClear={clear}
                resultCount={visible.length}
              />
              <FilterBar facets={facets} onFacetChange={(k, v) => setFilter(withFacet(query, k, v))} onClear={clear} />
              <span className="ml-auto hidden t-body-sm text-v2-muted t-tnum md:inline">
                {visible.length} de {rows.length}
              </span>
              <SegmentedControl<Density>
                aria-label="Presentación"
                size="sm"
                className="hidden md:inline-flex"
                value={query.densidad}
                onValueChange={(d) => go({ ...query, densidad: d }, 'replace')}
                items={[
                  { value: 'tabla', label: 'Tabla' },
                  { value: 'tarjetas', label: 'Tarjetas' },
                ]}
              />
            </div>
          ) : null}

          {phone ? (
            visible.length === 0 ? (
              <div className="rounded-panel border border-v2-border bg-v2-surface px-4 py-6">{empty}</div>
            ) : (
              <AthleteListMobile rows={visible} onOpen={openPeek} />
            )
          ) : query.densidad === 'tarjetas' && visible.length > 0 ? (
            <AthleteCards
              rows={visible}
              today={data.today}
              selection={selection}
              onSelectionChange={setSelection}
              activeId={activeId}
              onOpen={openPeek}
              hrefFor={hrefFor}
            />
          ) : (
            <AthletesTable
              rows={visible}
              today={data.today}
              sort={query.orden}
              onSortChange={(s: SortState) => go({ ...query, orden: s }, 'replace')}
              selection={selection}
              onSelectionChange={setSelection}
              activeId={activeId}
              onActiveChange={onActiveChange}
              onOpen={openPeek}
              hrefFor={hrefFor}
              empty={empty}
            />
          )}
        </>
      )}

      {!phone ? (
        <BulkActions
          selected={selectedRows}
          levels={data.levels}
          axisLabel={data.level_axis_label}
          today={data.today}
          weekStart={data.week_start}
          nextWeekStart={data.next_week_start}
          onClear={() => setSelection([])}
          onDone={refresh}
        />
      ) : null}

      <AthletePeek
        athleteId={peekId}
        onClose={() => setPeekId(null)}
        initial={peekRow ? { name: peekRow.name, avatar_url: peekRow.avatar_url, level_label: peekRow.level?.label ?? null } : undefined}
        onChange={() => router.refresh()}
      />

      {invite ? (
        <InviteDialog
          open
          mode={invite}
          onClose={() => setInvite(null)}
          rows={rows}
          levels={data.levels}
          axisLabel={data.level_axis_label}
          onInvited={() => router.refresh()}
        />
      ) : null}
      {doubles ? <DoublesSheet rows={rows} onClose={() => setDoubles(false)} /> : null}
    </PageContainer>
  );
}
