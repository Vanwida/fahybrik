'use client';

// ExercisePicker — the command-sheet that puts the REAL exercise_id on an
// authoring line (signed proposal §1, decision D1: command-sheet, not a long
// menu). It is the fix for A3: the exercise name stops being free text the
// serializer drops; the coach PICKS from the ~800-row catalog and the line gets a
// non-null exercise_id + inherits the exercise's intrinsic modality (mig 0053).
//
// Three modes in one sheet (same overlay/focus-trap/Esc pattern as ArchetypePicker):
//   • search  — keyboard-focused search + category chips + RECENTS (D2: recents
//               yes, derived free; favoritos no). Picking selects the exercise.
//   • create  — "crear ejercicio" (ExerciseCreateForm: name + category + modality
//               + optional video), POST /api/exercises, then selects the new
//               exercise (D3 scope = global single-coach). The coach DECLARES the
//               modality — the server stopped deriving it from the name, which is
//               what silently turned a Spanish "Remo 500m" into `other`.
//   • edit     — light "✎ editar ejercicio" (ExerciseEditForm): fork name/cues/
//               description/video_url on a base exercise, or edit an own
//               exercise directly, via the existing PATCH (D7: in the picker;
//               mig 0132: ownership + fork model, see coach-override.ts).
//
// AGNOSTIC: modality is the exercise's intrinsic data; the coach picks a category
// (the real enum), never a methodology/level/phase. Reuses GET /api/exercises and
// `exerciseVideoSchema` (lib/exercises/video-source.ts) — THE one video validator,
// shared with the server: a YouTube link or a file the coach uploaded. No new schema.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { Pencil, Plus, PlayCircle, Search } from 'lucide-react';
import { Button, Dialog, ErrorState, IconButton, Input } from '@/components/v2/ui';
import { EditExerciseForm } from './ExerciseEditForm';
import { CreateExerciseForm } from './ExerciseCreateForm';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { modalityColorSlug } from '@/lib/dashboard/v2/editor-axes';
import { equipmentLabel, MODALITY_LABELS, muscleLabel } from '@/lib/dashboard/exercises/catalog-ui';
import { exerciseDisplayName, exerciseMeasureLabels, filterExerciseCatalog } from '@/lib/dashboard/exercises/catalog-search';
import {
  CATEGORY_OPTIONS,
  FilterChip,
  ORIGIN_LABEL,
  toCatalogRow,
  type ApiExercise,
  type CatalogRow,
} from './exercise-catalog';

// ── The exercise shape the picker consumes (subset of CatalogExercise) ────────
export interface PickedExercise {
  id: number;
  name: string;
  category: ExerciseCategory;
  modality: Modality;
  video_url: string | null;
  slug?: string;
  name_es?: string | null;
  name_en?: string | null;
  search_terms?: string;
  movement_pattern?: string | null;
  is_unilateral?: boolean;
  implement_count?: number | null;
  default_metrics_json?: Record<string, boolean>;
  archived_at?: string | null;
  equipment?: string[];
  primary_muscle_groups?: string[];
}

type Mode = 'search' | 'create' | 'edit';

export function ExercisePicker({
  destinationLabel,
  defaultCategory,
  onPick,
  onClose,
}: {
  /** e.g. "Fuerza principal" — shown in the header sub-line. */
  destinationLabel: string;
  /** Pre-selects the create-form category (from the block's dominant modality). */
  defaultCategory?: ExerciseCategory;
  onPick: (exercise: PickedExercise) => void;
  onClose: () => void;
}) {
  const locale = useLocale();
  const searchRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExerciseCategory | 'all'>('all');
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  // The exercise being edited (✎) — drives the edit sheet.
  const [editing, setEditing] = useState<CatalogRow | null>(null);

  // Recents (D2) — the exercise_ids the coach used most recently, kept in
  // sessionStorage. Derived free from picks; no schema. Most-recent-first.
  const recentIds = useRecentExerciseIds();

  // Pre-load the catalog (same endpoint ExercisePalette uses). Focus search.
  useEffect(() => {
    let alive = true;
    fetch('/api/exercises?limit=2000', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('catalog_load_failed');
        return r.json();
      })
      .then((data: { exercises: ApiExercise[] } | null) => {
        if (!Array.isArray(data?.exercises)) throw new Error('invalid_catalog');
        if (alive) setCatalog(data.exercises.map(toCatalogRow));
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
          // preventScroll: enfocar arrastra el fondo para "revelar" el input y la
          // página de detrás se iba hasta abajo al abrir el picker. El scroll lock
          // NO lo tapa: overflow:hidden frena la rueda, no el scroll programático.
          searchRef.current?.focus({ preventScroll: true });
        }
      });
    return () => {
      alive = false;
    };
  }, [reload]);

  const filtered = useMemo(
    () => filterExerciseCatalog(catalog, { query, category: categoryFilter }),
    [catalog, query, categoryFilter],
  );

  const recents = useMemo(() => {
    if (recentIds.length === 0 || query.trim()) return [];
    const byId = new Map(filtered.map((ex) => [Number(ex.id), ex]));
    return recentIds
      .map((id) => byId.get(id))
      .filter((ex): ex is CatalogRow => ex != null)
      .slice(0, 5);
  }, [recentIds, filtered, query]);

  const retry = () => {
    setFailed(false);
    setLoading(true);
    setReload((n) => n + 1);
  };

  const select = useCallback(
    (ex: CatalogRow) => {
      if (ex.archived_at) return;
      rememberRecent(Number(ex.id));
      onPick({
        id: Number(ex.id),
        name: exerciseDisplayName(ex, locale),
        category: ex.category,
        modality: ex.modality,
        // video_url arrives already MERGED (coalesce(override, base) server-side)
        // — read it directly, don't re-apply the precedence client-side.
        video_url: ex.video_url,
        slug: ex.slug,
        name_es: ex.name_es,
        name_en: ex.name_en,
        search_terms: ex.search_terms,
        movement_pattern: ex.movement_pattern,
        is_unilateral: ex.is_unilateral,
        implement_count: ex.implement_count,
        default_metrics_json: ex.default_metrics_json,
        archived_at: ex.archived_at,
        equipment: ex.equipment,
        primary_muscle_groups: ex.primary_muscle_groups,
      });
    },
    [onPick, locale],
  );

  const onCreated = useCallback(
    (ex: CatalogRow) => {
      setCatalog((prev) => [ex, ...prev.filter((e) => e.id !== ex.id)]);
      select(ex);
    },
    [select],
  );

  const onEdited = useCallback((ex: CatalogRow) => {
    setCatalog((prev) => prev.map((e) => (e.id === ex.id ? ex : e)));
    setEditing(null);
    setMode('search');
  }, []);

  const title = mode === 'create' ? 'Crear ejercicio' : mode === 'edit' ? 'Editar ejercicio' : 'Añadir ejercicio';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={destinationLabel}
      footer={
        mode === 'search' && !loading && !failed ? (
          <Button variant="ghost" icon={Plus} onClick={() => setMode('create')} className="mr-auto max-w-full">
            <span className="truncate">
              Crear {query.trim() ? <span className="text-v2-fg">«{query.trim()}»</span> : null} como ejercicio nuevo
            </span>
          </Button>
        ) : undefined
      }
    >
      {mode === 'create' ? (
        <CreateExerciseForm
          seedName={query.trim()}
          defaultCategory={defaultCategory ?? 'strength'}
          onCancel={() => setMode('search')}
          onCreated={onCreated}
        />
      ) : mode === 'edit' && editing ? (
        <EditExerciseForm
          exercise={editing}
          onCancel={() => {
            setMode('search');
            setEditing(null);
          }}
          onEdited={onEdited}
        />
      ) : (
        <SearchBody
          searchRef={searchRef}
          query={query}
          onQuery={setQuery}
          categoryFilter={categoryFilter}
          onCategory={setCategoryFilter}
          loading={loading}
          failed={failed}
          onRetry={retry}
          locale={locale}
          recents={recents}
          filtered={filtered}
          onSelect={select}
          onEdit={(ex) => {
            setEditing(ex);
            setMode('edit');
          }}
        />
      )}
    </Dialog>
  );
}

// ── Search mode ───────────────────────────────────────────────────────────────
function SearchBody({
  searchRef,
  query,
  onQuery,
  categoryFilter,
  onCategory,
  loading,
  failed,
  onRetry,
  locale,
  recents,
  filtered,
  onSelect,
  onEdit,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (v: string) => void;
  categoryFilter: ExerciseCategory | 'all';
  onCategory: (v: ExerciseCategory | 'all') => void;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  locale: string;
  recents: CatalogRow[];
  filtered: CatalogRow[];
  onSelect: (ex: CatalogRow) => void;
  onEdit: (ex: CatalogRow) => void;
}) {
  return (
    <>
      <div className="sticky top-0 z-[1] -mx-5 space-y-2.5 border-b border-v2-border bg-v2-elevated px-5 pb-3">
        <Input
          ref={searchRef}
          type="text"
          icon={Search}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar (castellano o inglés)…"
          aria-label="Buscar ejercicio"
        />
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="Todo" active={categoryFilter === 'all'} onClick={() => onCategory('all')} />
          {CATEGORY_OPTIONS.map((c) => (
            <FilterChip
              key={c.value}
              label={c.label}
              active={categoryFilter === c.value}
              onClick={() => onCategory(c.value)}
            />
          ))}
        </div>
      </div>

      <div className="-mx-2 pt-2">
        {loading ? (
          <p className="px-2 py-3 t-body-sm text-v2-muted">Cargando catálogo…</p>
        ) : failed ? (
          <ErrorState title="El catálogo de ejercicios no ha cargado" onRetry={onRetry} className="mx-2 my-3" />
        ) : (
          <>
            {recents.length > 0 ? (
              <>
                <p className="px-2 pb-1 pt-1 t-label text-v2-faint">Recientes</p>
                {recents.map((ex) => (
                  <ExerciseRow key={`r-${ex.id}`} ex={ex} locale={locale} onSelect={onSelect} onEdit={onEdit} />
                ))}
                <p className="px-2 pb-1 pt-2.5 t-label text-v2-faint">Catálogo</p>
              </>
            ) : null}
            {filtered.length === 0 ? (
              <p className="px-2 py-3 t-body-sm text-v2-muted">
                Sin resultados{query.trim() ? ` para «${query.trim()}»` : ''}.
              </p>
            ) : (
              filtered.map((ex) => <ExerciseRow key={ex.id} ex={ex} locale={locale} onSelect={onSelect} onEdit={onEdit} />)
            )}
          </>
        )}
      </div>
    </>
  );
}

function ExerciseRow({
  ex,
  locale,
  onSelect,
  onEdit,
}: {
  ex: CatalogRow;
  locale: string;
  onSelect: (ex: CatalogRow) => void;
  onEdit: (ex: CatalogRow) => void;
}) {
  const slug = modalityColorSlug(ex.modality);
  const name = exerciseDisplayName(ex, locale);
  const muscles = ex.primary_muscle_groups.slice(0, 2).map(muscleLabel).join(', ');
  // Origin woven into the existing caption, restrained on purpose (task D4: this
  // is a dense in-editor picker, not the catalog screen) — no badge/icon for
  // 'base' (the unmarked majority), just a word for the other two.
  const originLabel = ORIGIN_LABEL[ex.origin];
  const sub = [
    originLabel,
    ex.is_unilateral ? 'Unilateral' : null,
    ex.implement_count != null && ex.implement_count > 1 ? `${ex.implement_count} implementos` : null,
    ...exerciseMeasureLabels(ex.default_metrics_json),
    ex.equipment[0] ? equipmentLabel(ex.equipment[0]) : null,
    muscles,
  ].filter(Boolean).join(' · ');
  // video_url arrives already MERGED — read it directly.
  const hasVideo = ex.video_url != null;
  return (
    <div className="flex items-center gap-2 rounded-ctl px-1 hover:bg-v2-hover">
      <Button
        variant="ghost"
        onClick={() => onSelect(ex)}
        className="h-auto min-w-0 flex-1 justify-start gap-2.5 px-1 py-1.5 text-left font-normal hover:bg-transparent"
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: `var(--v2-mod-${slug})` }} />
        <span className="min-w-0">
          <span className="block whitespace-normal t-body font-medium text-v2-fg sm:truncate">{name}</span>
          {sub ? <span className="block whitespace-normal t-meta text-v2-faint sm:truncate">{sub}</span> : null}
        </span>
      </Button>
      {/* El COLOR sale del cubo (remo/ski/bici comparten el color de "ergo"), pero
          el TEXTO dice la modalidad REAL — "Remo", no "Ergómetro". */}
      <span
        className="shrink-0 rounded-[4px] px-1.5 py-0.5 t-meta"
        style={{ background: `var(--v2-mod-${slug}-soft)`, color: `var(--v2-mod-${slug})` }}
      >
        {MODALITY_LABELS[ex.modality]}
      </span>
      {/* SIEMPRE visible: en un móvil no existe el hover. El que ya tiene vídeo va
          en tinta plena porque es un dato de la fila; el resto, apagado. */}
      <IconButton
        icon={hasVideo ? PlayCircle : Pencil}
        size="sm"
        onClick={() => onEdit(ex)}
        label={hasVideo ? `Editar ${name} (tiene vídeo)` : `Editar ${name}`}
        className={hasVideo ? 'text-v2-fg' : undefined}
      />
    </div>
  );
}

// ── Recents (D2): derived, free, sessionStorage. No schema, no favoritos. ─────
const RECENTS_KEY = 'fahybrik:v2:recent-exercises';
const RECENTS_MAX = 10;

function readRecents(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function rememberRecent(id: number): void {
  if (typeof window === 'undefined') return;
  try {
    const next = [id, ...readRecents().filter((n) => n !== id)].slice(0, RECENTS_MAX);
    window.sessionStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // sessionStorage unavailable — recents degrade silently (non-critical).
  }
}

function useRecentExerciseIds(): number[] {
  // Lazy initializer: read once on mount (client-only sessionStorage). The picker
  // mounts client-side (it lives behind a click), so SSR/client mismatch is moot;
  // readRecents() returns [] when window is absent. No setState-in-effect.
  const [ids] = useState<number[]>(() => readRecents());
  return ids;
}
