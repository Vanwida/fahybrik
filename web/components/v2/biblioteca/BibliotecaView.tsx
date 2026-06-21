'use client';

// BibliotecaView — client orchestrator for the v2 Biblioteca screen. Owns the
// active tab (mirrored to ?tab= so it's linkable), the two filter axes (modality
// rail + objective rail) and the live search. Filtering is client-side over the
// server-shaped data passed in via props; the header counts reflect the FILTERED
// view so the coach always sees how many items match.

import { useMemo, useState, useCallback } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/dashboard/MIcon';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import { EmptyState } from '@/components/v2/EmptyState';
import { CategoryRail } from '@/components/v2/biblioteca/CategoryRail';
import { SesionCard } from '@/components/v2/biblioteca/SesionCard';
import { BloqueCard } from '@/components/v2/biblioteca/BloqueCard';
import { FaseCard } from '@/components/v2/biblioteca/FaseCard';
import {
  LIB_MODALITY_FILTERS,
  LIB_OBJECTIVES,
  type V2LibModalityFilter,
  type V2LibObjective,
} from '@/lib/dashboard/v2/biblioteca-axes';
import type { V2BibliotecaData } from '@/lib/dashboard/v2/biblioteca-data';
import { cn } from '@/lib/utils';

export type BibliotecaTab = 'sesiones' | 'bloques' | 'fases';

/** Route to create a brand-new sesión (owned by the editing-cluster agent). */
const NUEVA_SESION_HREF = '/v2/biblioteca/sesion/nueva';

const TAB_OPTIONS = (
  counts: V2BibliotecaData['counts'],
): ReadonlyArray<{ value: BibliotecaTab; label: string }> => [
  { value: 'sesiones', label: `Sesiones · ${counts.sesiones}` },
  { value: 'bloques', label: `Bloques · ${counts.bloques}` },
  { value: 'fases', label: `Fases · ${counts.fases}` },
];

type ModalityRailId = 'todas' | V2LibModalityFilter;

function matchesText(haystack: string, q: string): boolean {
  return haystack.toLowerCase().includes(q);
}

export function BibliotecaView({
  data,
  initialTab,
}: {
  data: V2BibliotecaData;
  initialTab: BibliotecaTab;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [tab, setTab] = useState<BibliotecaTab>(initialTab);
  const [modality, setModality] = useState<ModalityRailId>('todas');
  const [objective, setObjective] = useState<V2LibObjective | null>(null);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  // Tab change → update state + reflect in the URL (shallow, no scroll jump).
  const onTab = useCallback(
    (next: BibliotecaTab) => {
      setTab(next);
      router.replace(`${pathname}?tab=${next}`, { scroll: false });
    },
    [router, pathname],
  );

  // ── Filtered collections (per active tab) ─────────────────────────────────
  const sesiones = useMemo(() => {
    return data.sesiones.filter((s) => {
      if (modality !== 'todas' && s.modality_filter !== modality) return false;
      if (objective && s.objective !== objective) return false;
      if (q && !matchesText(`${s.name} ${s.format_label}`, q)) return false;
      return true;
    });
  }, [data.sesiones, modality, objective, q]);

  const bloques = useMemo(() => {
    return data.bloques.filter((b) => {
      if (modality !== 'todas' && b.modality_filter !== modality) return false;
      if (objective && b.objective !== objective) return false;
      if (q && !matchesText(`${b.title} ${b.description} ${b.group_label}`, q)) return false;
      return true;
    });
  }, [data.bloques, modality, objective, q]);

  // Fases are not modality/objective scoped — only text-filtered.
  const fases = useMemo(() => {
    if (!q) return data.fases;
    return data.fases.filter((f) => matchesText(`${f.name} ${f.objectives.join(' ')}`, q));
  }, [data.fases, q]);

  const railVisible = tab !== 'fases';
  const filteredCount =
    tab === 'sesiones' ? sesiones.length : tab === 'bloques' ? bloques.length : fases.length;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="v2-display text-3xl sm:text-4xl">
            <span className="text-[color:var(--v2-fg)]">Biblioteca</span>
          </h1>
          <p className="text-sm text-[color:var(--v2-muted)]">Codificar el método.</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Search */}
          <label className="relative flex items-center">
            <span className="pointer-events-none absolute left-2.5 text-[color:var(--v2-faint)]">
              <MIcon name="search" size={18} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="buscar…"
              aria-label="Buscar en la biblioteca"
              className={cn(
                'v2-focus h-9 w-40 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] pl-8 pr-3 text-sm sm:w-52',
                'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]',
                'focus:border-[color:var(--v2-border-strong)]',
              )}
            />
          </label>
          <Link
            href={NUEVA_SESION_HREF}
            className="v2-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="add" size={18} />
            Nueva sesión
          </Link>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="mt-4 border-b border-[color:var(--v2-border)] pb-3">
        <SegmentedControl<BibliotecaTab>
          options={TAB_OPTIONS(data.counts)}
          value={tab}
          onChange={onTab}
          ariaLabel="Tipo de biblioteca"
        />
      </div>

      {/* ── Two-pane: category rail + grid ───────────────────────────────── */}
      <div
        className={cn(
          'mt-4 grid gap-4',
          railVisible ? 'lg:grid-cols-[200px_1fr]' : 'grid-cols-1',
        )}
      >
        {railVisible ? (
          <CategoryRail
            modality={modality}
            onModality={setModality}
            objective={objective}
            onObjective={setObjective}
            modalityOptions={LIB_MODALITY_FILTERS}
            objectiveOptions={LIB_OBJECTIVES}
          />
        ) : null}

        <div className="min-w-0">
          {tab === 'sesiones' ? (
            <SesionesGrid items={sesiones} hasAny={data.sesiones.length > 0} />
          ) : tab === 'bloques' ? (
            <BloquesGrid items={bloques} hasAny={data.bloques.length > 0} />
          ) : (
            <FasesGrid items={fases} hasAny={data.fases.length > 0} />
          )}

          {/* Footer count — honest, reflects active filters. */}
          {filteredCount > 0 ? (
            <p className="mt-4 text-xs text-[color:var(--v2-faint)]">
              <span className="v2-num">{filteredCount}</span>{' '}
              {tab === 'sesiones' ? 'sesiones' : tab === 'bloques' ? 'bloques' : 'fases'}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Grids ───────────────────────────────────────────────────────────────────

const GRID_CLS = 'grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3';

function SesionesGrid({
  items,
  hasAny,
}: {
  items: V2BibliotecaData['sesiones'];
  hasAny: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={hasAny ? 'filter_alt_off' : 'library_add'}
        title={hasAny ? 'Ninguna sesión con estos filtros' : 'Aún no hay sesiones'}
        description={
          hasAny
            ? 'Ajusta la modalidad, el objetivo o la búsqueda.'
            : 'Crea tu primera sesión para empezar a codificar el método.'
        }
        action={
          hasAny ? undefined : (
            <Link
              href={NUEVA_SESION_HREF}
              className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-xs font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
            >
              <MIcon name="add" size={16} />
              Nueva sesión
            </Link>
          )
        }
      />
    );
  }
  return (
    <div className={GRID_CLS}>
      {items.map((s, i) => (
        <SesionCard key={s.id} sesion={s} index={i} />
      ))}
      {/* Dashed "+ nueva sesión" tile closes the grid. */}
      <Link
        href={NUEVA_SESION_HREF}
        className="v2-focus flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-[var(--v2-r-l)] border border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
      >
        <MIcon name="add" size={22} />
        <span className="text-xs font-semibold">nueva sesión</span>
      </Link>
    </div>
  );
}

function BloquesGrid({
  items,
  hasAny,
}: {
  items: V2BibliotecaData['bloques'];
  hasAny: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={hasAny ? 'filter_alt_off' : 'dashboard'}
        title={hasAny ? 'Ningún bloque con estos filtros' : 'Aún no hay bloques'}
        description={
          hasAny
            ? 'Ajusta la modalidad, el objetivo o la búsqueda.'
            : 'Los bloques reutilizables de tu metodología aparecerán aquí.'
        }
      />
    );
  }
  return (
    <div className={GRID_CLS}>
      {items.map((b, i) => (
        <BloqueCard key={b.id} bloque={b} index={i} />
      ))}
    </div>
  );
}

function FasesGrid({ items, hasAny }: { items: V2BibliotecaData['fases']; hasAny: boolean }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={hasAny ? 'search_off' : 'view_timeline'}
        title={hasAny ? 'Ninguna fase coincide' : 'Aún no hay fases'}
        description={
          hasAny
            ? 'Prueba con otro término de búsqueda.'
            : 'Define las fases de tu periodización en Metodología.'
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
      {items.map((f, i) => (
        <FaseCard key={f.id} fase={f} index={i} />
      ))}
    </div>
  );
}
