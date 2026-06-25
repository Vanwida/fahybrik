'use client';

// BibliotecaView — client orchestrator for the v2 Biblioteca screen. Owns the
// active tab (mirrored to ?tab= so it's linkable), the two filter axes (modality
// rail + objective rail) and the live search. Filtering is client-side over the
// server-shaped data passed in via props; the header counts reflect the FILTERED
// view so the coach always sees how many items match.
//
// The "bloques" tab additionally supports a Level × Days matrix view, toggled
// via a Lista/Matriz SegmentedControl. Matrix data is fetched client-side on
// first toggle so the page load stays fast.

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import { EmptyState } from '@/components/v2/EmptyState';
import {
  IntroStrip,
  InfoDot,
  PipelineCue,
  ContextHint,
  TeachingEmptyState,
  useOrientationState,
  type IntroMicroStep,
} from '@/components/v2/orientacion';
import type { PipelineProgress, PipelineStepKey } from '@/lib/dashboard/v2/orientacion-types';
import { CategoryRail } from '@/components/v2/biblioteca/CategoryRail';
import { SesionCard } from '@/components/v2/biblioteca/SesionCard';
import { BloqueCard } from '@/components/v2/biblioteca/BloqueCard';
import { MicrocicloCard } from '@/components/v2/biblioteca/MicrocicloCard';
import { LevelMatrix } from '@/components/v2/biblioteca/LevelMatrix';
import type { LevelRow } from '@/components/v2/biblioteca/LevelMatrix';
import type { MatrixCellData } from '@/components/v2/biblioteca/MatrixCell';
import {
  LIB_MODALITY_FILTERS,
  LIB_OBJECTIVES,
  type V2LibModalityFilter,
  type V2LibObjective,
} from '@/lib/dashboard/v2/biblioteca-axes';
import type { V2BibliotecaData } from '@/lib/dashboard/v2/biblioteca-data';
import { cn } from '@/lib/utils';

// Periodization phases (Fases) live in the Periodización section now, not here.
export type BibliotecaTab = 'sesiones' | 'bloques' | 'microciclos';

/** Whether the bloques sub-tab shows a card grid or the level × days matrix. */
type BloqueView = 'lista' | 'matriz';

/** Route to create a brand-new sesión (owned by the editing-cluster agent). */
const NUEVA_SESION_HREF = '/biblioteca/sesion/nueva';

// ── Inline orientation (shared primitives) ──────────────────────────────────
const SECTION_KEY = 'biblioteca';

// Biblioteca spans steps 2–4 of the build pipeline.
const BIBLIOTECA_STEPS: readonly PipelineStepKey[] = ['sesiones', 'bloques', 'microciclos'];

// The IntroStrip line defines the CURRENT tab (one sentence each, ≤22 words).
const TAB_INTRO_LINE: Record<BibliotecaTab, React.ReactNode> = {
  sesiones: (
    <>
      Una <b>sesión</b> es un entreno tipado — el ladrillo con el que armas tus bloques.
    </>
  ),
  bloques: (
    <>
      Un <b>bloque</b> es un conjunto reutilizable de sesiones — la pieza de los días de tus microciclos.
    </>
  ),
  microciclos: (
    <>
      Un <b>microciclo</b> es una estructura de varias semanas — la unidad que vivirá tu atleta.
    </>
  ),
};

// The 3 micro-steps teach the size ordering — the typical confusion in Biblioteca.
const INTRO_STEPS: IntroMicroStep[] = [
  {
    title: 'Sesión',
    body: <>Un entreno tipado. El ladrillo más pequeño de tu método.</>,
  },
  {
    title: 'Bloque',
    body: <>Varias sesiones reutilizables. Lo que pones en cada día.</>,
  },
  {
    title: 'Microciclo',
    body: <>Varias semanas de días. Lo que luego ordenas en Secuencias.</>,
  },
];

const TAB_OPTIONS = (
  counts: V2BibliotecaData['counts'],
): ReadonlyArray<{ value: BibliotecaTab; label: string }> => [
  { value: 'sesiones', label: `Sesiones · ${counts.sesiones}` },
  { value: 'bloques', label: `Bloques · ${counts.bloques}` },
  { value: 'microciclos', label: `Microciclos · ${counts.microciclos}` },
];

const BLOQUE_VIEW_OPTIONS: ReadonlyArray<{ value: BloqueView; label: string }> = [
  { value: 'lista', label: 'Lista' },
  { value: 'matriz', label: 'Matriz' },
];

type ModalityRailId = 'todas' | V2LibModalityFilter;

function matchesText(haystack: string, q: string): boolean {
  return haystack.toLowerCase().includes(q);
}

export function BibliotecaView({
  data,
  initialTab,
  coachKey,
  progress,
}: {
  data: V2BibliotecaData;
  initialTab: BibliotecaTab;
  coachKey: string;
  progress: PipelineProgress;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const orient = useOrientationState(coachKey, SECTION_KEY);

  const [tab, setTab] = useState<BibliotecaTab>(initialTab);
  const [modality, setModality] = useState<ModalityRailId>('todas');
  const [objective, setObjective] = useState<V2LibObjective | null>(null);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  // Matrix view (bloques tab only)
  const [bloqueView, setBloqueView] = useState<BloqueView>('lista');
  const [matrixLevels, setMatrixLevels] = useState<LevelRow[]>([]);
  const [matrixCells, setMatrixCells] = useState<Record<string, MatrixCellData | null>>({});
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  // Fetch matrix data once when the coach switches to matrix view.
  useEffect(() => {
    if (tab !== 'bloques' || bloqueView !== 'matriz') return;
    if (matrixLevels.length > 0) return; // already loaded

    setMatrixLoading(true);
    setMatrixError(null);
    fetch('/api/coach/blocks/matrix')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const json = (await res.json()) as {
          levels: LevelRow[];
          cells: Record<string, MatrixCellData | null>;
        };
        setMatrixLevels(json.levels);
        setMatrixCells(json.cells);
      })
      .catch((err: unknown) => {
        setMatrixError(err instanceof Error ? err.message : 'Error cargando la matriz');
      })
      .finally(() => setMatrixLoading(false));
  }, [tab, bloqueView, matrixLevels.length]);

  const handleMatrixCellClick = useCallback(
    (levelId: number, days: number, existingBlockId?: number) => {
      if (existingBlockId != null) {
        router.push(`/biblioteca/bloque/${existingBlockId}`);
      } else {
        router.push(`/biblioteca/bloque/nuevo?level=${levelId}&days=${days}`);
      }
    },
    [router],
  );

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

  // Microciclos are not modality/objective scoped — only text-filtered.
  const microciclos = useMemo(() => {
    if (!q) return data.microciclos;
    return data.microciclos.filter((m) => matchesText(`${m.name} ${m.level}`, q));
  }, [data.microciclos, q]);

  // The modality/objective rail only makes sense for sesiones + bloques.
  const railVisible = tab === 'sesiones' || tab === 'bloques';
  const filteredCount =
    tab === 'sesiones'
      ? sesiones.length
      : tab === 'bloques'
        ? bloques.length
        : microciclos.length;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="v2-display text-3xl sm:text-4xl">
            <span className="text-[color:var(--v2-fg)]">Biblioteca</span>
            {orient.hydrated && !orient.visible ? (
              <InfoDot onClick={orient.recall} className="ml-2" />
            ) : null}
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

      {/* ── Inline orientation: pipeline cue + intro strip ───────────────── */}
      <div className="mt-5">
        <PipelineCue
          coachKey={coachKey}
          sectionKey={SECTION_KEY}
          activeKeys={BIBLIOTECA_STEPS}
          progress={progress}
          line={
            <>
              Tu <b>contenido</b> reutilizable: Sesiones → Bloques → Microciclos. Lo que ordenas en Periodización.
            </>
          }
        />
        {orient.visible ? (
          <IntroStrip
            icon="dashboard"
            line={TAB_INTRO_LINE[tab]}
            steps={INTRO_STEPS}
            expanded={orient.expanded}
            onToggle={orient.toggleExpanded}
            onDismiss={orient.dismiss}
          />
        ) : null}
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="mt-1 border-b border-[color:var(--v2-border)] pb-3">
        <SegmentedControl<BibliotecaTab>
          options={TAB_OPTIONS(data.counts)}
          value={tab}
          onChange={onTab}
          ariaLabel="Tipo de biblioteca"
        />
      </div>

      {/* size-ordering context — the typical Biblioteca confusion */}
      <ContextHint className="mt-3">
        De lo más pequeño a lo más grande: <b>Sesión</b> (un entreno) → <b>Bloque</b> (varias sesiones) →{' '}
        <b>Microciclo</b> (varias semanas).
      </ContextHint>

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
          {/* Lista/Matriz toggle — only shown for the bloques tab */}
          {tab === 'bloques' ? (
            <div className="mb-4">
              <SegmentedControl<BloqueView>
                options={BLOQUE_VIEW_OPTIONS}
                value={bloqueView}
                onChange={setBloqueView}
                size="sm"
                ariaLabel="Vista de bloques"
              />
            </div>
          ) : null}

          {tab === 'sesiones' ? (
            <SesionesGrid items={sesiones} hasAny={data.sesiones.length > 0} />
          ) : tab === 'bloques' && bloqueView === 'lista' ? (
            <BloquesGrid items={bloques} hasAny={data.bloques.length > 0} />
          ) : tab === 'bloques' && bloqueView === 'matriz' ? (
            <MatrixPane
              levels={matrixLevels}
              cells={matrixCells}
              loading={matrixLoading}
              error={matrixError}
              onCellClick={handleMatrixCellClick}
            />
          ) : (
            <MicrociclosGrid items={microciclos} hasAny={data.microciclos.length > 0} />
          )}

          {/* Footer count — honest, reflects active filters. */}
          {filteredCount > 0 ? (
            <p className="mt-4 text-xs text-[color:var(--v2-faint)]">
              <span className="v2-num">{filteredCount}</span>{' '}
              {tab === 'sesiones'
                ? 'sesiones'
                : tab === 'bloques'
                  ? 'bloques'
                  : 'microciclos'}
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
    // Filtered-to-empty → plain prompt. Genuinely empty → teaching moment.
    if (hasAny) {
      return (
        <EmptyState
          icon="filter_alt_off"
          title="Ninguna sesión con estos filtros"
          description="Ajusta la modalidad, el objetivo o la búsqueda."
        />
      );
    }
    return (
      <TeachingEmptyState
        icon="library_add"
        title="Aún no tienes sesiones"
        whatToDo={<>Crea tu primera sesión: un entreno tipado, el ladrillo de tu método.</>}
        why={<><b>Por qué importa:</b> con las sesiones armas los bloques, y con los bloques los microciclos.</>}
        highlightStep="sesiones"
        action={
          <Link
            href={NUEVA_SESION_HREF}
            className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-xs font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="add" size={16} />
            Crear mi primera sesión
          </Link>
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
    if (hasAny) {
      return (
        <EmptyState
          icon="filter_alt_off"
          title="Ningún bloque con estos filtros"
          description="Ajusta la modalidad, el objetivo o la búsqueda."
        />
      );
    }
    return (
      <TeachingEmptyState
        icon="dashboard"
        title="Aún no tienes bloques"
        whatToDo={<>Un bloque agrupa varias sesiones reutilizables — lo que pones en cada día.</>}
        why={<><b>Por qué importa:</b> los bloques son las piezas con las que armas los días de tus microciclos.</>}
        highlightStep="bloques"
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

function MicrociclosGrid({
  items,
  hasAny,
}: {
  items: V2BibliotecaData['microciclos'];
  hasAny: boolean;
}) {
  if (items.length === 0) {
    if (hasAny) {
      return (
        <EmptyState
          icon="search_off"
          title="Ningún microciclo coincide"
          description="Prueba con otro término de búsqueda."
        />
      );
    }
    return (
      <TeachingEmptyState
        icon="calendar_view_week"
        title="Aún no tienes microciclos"
        whatToDo={<>Un microciclo es una estructura de varias semanas — la unidad que vivirá tu atleta.</>}
        why={<><b>Por qué importa:</b> son las piezas que luego encadenas en Periodización → Secuencias.</>}
        highlightStep="microciclos"
      />
    );
  }
  return (
    <div className={GRID_CLS}>
      {items.map((m, i) => (
        <MicrocicloCard key={m.id} microciclo={m} index={i} />
      ))}
    </div>
  );
}

// ── MatrixPane ───────────────────────────────────────────────────────────────
// Wraps LevelMatrix with loading/error states.

function MatrixPane({
  levels,
  cells,
  loading,
  error,
  onCellClick,
}: {
  levels: LevelRow[];
  cells: Record<string, MatrixCellData | null>;
  loading: boolean;
  error: string | null;
  onCellClick: (levelId: number, days: number, existingBlockId?: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <span className="text-sm text-[color:var(--v2-muted)]">Cargando matriz…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <span className="text-sm text-[color:var(--v2-danger)]">{error}</span>
      </div>
    );
  }
  return <LevelMatrix levels={levels} cells={cells} onCellClick={onCellClick} />;
}
