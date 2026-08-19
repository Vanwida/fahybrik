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
import { ModalPortal } from './ModalPortal';
import { EditExerciseForm } from './ExerciseEditForm';
import { CreateExerciseForm } from './ExerciseCreateForm';
import { MIcon } from '@/components/ui/MIcon';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { modalityColorSlug } from '@/lib/dashboard/v2/editor-axes';
import { MODALITY_LABELS } from '@/lib/dashboard/exercises/catalog-ui';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExerciseCategory | 'all'>('all');
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  // The exercise being edited (✎) — drives the edit sheet.
  const [editing, setEditing] = useState<CatalogRow | null>(null);

  // Recents (D2) — the exercise_ids the coach used most recently, kept in
  // sessionStorage. Derived free from picks; no schema. Most-recent-first.
  const recentIds = useRecentExerciseIds();

  // Pre-load the catalog (same endpoint ExercisePalette uses). Focus search.
  useEffect(() => {
    let alive = true;
    fetch('/api/exercises?limit=2000', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { exercises: ApiExercise[] } | null) => {
        if (alive && data?.exercises) setCatalog(data.exercises.map(toCatalogRow));
      })
      .catch(() => undefined)
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
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((ex) => {
      if (categoryFilter !== 'all' && ex.category !== categoryFilter) return false;
      if (!q) return true;
      return ex.name.toLowerCase().includes(q);
    });
  }, [catalog, query, categoryFilter]);

  const recents = useMemo(() => {
    if (recentIds.length === 0 || query.trim()) return [];
    const byId = new Map(catalog.map((ex) => [Number(ex.id), ex]));
    return recentIds
      .map((id) => byId.get(id))
      .filter((ex): ex is CatalogRow => ex != null)
      .slice(0, 5);
  }, [recentIds, catalog, query]);

  const select = useCallback(
    (ex: CatalogRow) => {
      rememberRecent(Number(ex.id));
      onPick({
        id: Number(ex.id),
        name: ex.name,
        category: ex.category,
        modality: ex.modality,
        // video_url arrives already MERGED (coalesce(override, base) server-side)
        // — read it directly, don't re-apply the precedence client-side.
        video_url: ex.video_url,
      });
    },
    [onPick],
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

  return (
    <ModalPortal onEscape={onClose}>
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-label="Elegir ejercicio"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="v2-focus flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="v2-display text-xl">
              {mode === 'create'
                ? 'Crear ejercicio'
                : mode === 'edit'
                  ? 'Editar ejercicio'
                  : 'Añadir ejercicio'}
              <span className="text-[color:var(--v2-muted)]"> · {destinationLabel}</span>
            </h2>
            {mode === 'search' ? <p className="v2-micro mt-0.5">Busca y elige del catálogo</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancelar"
            className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        {mode === 'create' ? (
          <CreateExerciseForm
            seedName={query.trim()}
            defaultCategory={defaultCategory ?? 'strength'}
            onCancel={() => setMode('search')}
            onCreated={onCreated}
          />
        ) : mode === 'edit' && editing ? (
          <EditExerciseForm exercise={editing} onCancel={() => { setMode('search'); setEditing(null); }} onEdited={onEdited} />
        ) : (
          <SearchBody
            searchRef={searchRef}
            query={query}
            onQuery={setQuery}
            categoryFilter={categoryFilter}
            onCategory={setCategoryFilter}
            loading={loading}
            recents={recents}
            filtered={filtered}
            onSelect={select}
            onEdit={(ex) => { setEditing(ex); setMode('edit'); }}
            onCreate={() => setMode('create')}
          />
        )}
      </div>
    </div>
    </ModalPortal>
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
  recents,
  filtered,
  onSelect,
  onEdit,
  onCreate,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (v: string) => void;
  categoryFilter: ExerciseCategory | 'all';
  onCategory: (v: ExerciseCategory | 'all') => void;
  loading: boolean;
  recents: CatalogRow[];
  filtered: CatalogRow[];
  onSelect: (ex: CatalogRow) => void;
  onEdit: (ex: CatalogRow) => void;
  onCreate: () => void;
}) {
  return (
    <>
      <div className="space-y-2.5 border-b border-[color:var(--v2-border)] px-4 py-3">
        <div className="relative">
          <MIcon
            name="search"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--v2-faint)]"
          />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar ejercicio…"
            aria-label="Buscar ejercicio"
            className="v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] py-2 pl-8 pr-3 text-sm text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)]"
          />
        </div>
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

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="px-2 py-3 text-sm text-[color:var(--v2-muted)]">Cargando catálogo…</p>
        ) : (
          <>
            {recents.length > 0 ? (
              <>
                <p className="v2-micro px-2 pb-1 pt-1">Recientes</p>
                {recents.map((ex) => (
                  <ExerciseRow key={`r-${ex.id}`} ex={ex} onSelect={onSelect} onEdit={onEdit} />
                ))}
                <p className="v2-micro px-2 pb-1 pt-2.5">Catálogo</p>
              </>
            ) : null}
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-sm text-[color:var(--v2-muted)]">
                Sin resultados{query.trim() ? ` para “${query.trim()}”` : ''}.
              </p>
            ) : (
              filtered.map((ex) => (
                <ExerciseRow key={ex.id} ex={ex} onSelect={onSelect} onEdit={onEdit} />
              ))
            )}
          </>
        )}
      </div>

      {/* Create-new row — last, with the typed text */}
      <button
        type="button"
        onClick={onCreate}
        className="v2-focus flex items-center gap-2 border-t border-[color:var(--v2-border)] px-4 py-3 text-left text-sm text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)]"
      >
        <MIcon name="add" size={16} className="text-[color:var(--v2-accent-text)]" />
        <span>
          Crear{' '}
          {query.trim() ? (
            <>
              “<b className="text-[color:var(--v2-fg)]">{query.trim()}</b>”
            </>
          ) : null}{' '}
          como ejercicio nuevo
        </span>
      </button>
    </>
  );
}

function ExerciseRow({
  ex,
  onSelect,
  onEdit,
}: {
  ex: CatalogRow;
  onSelect: (ex: CatalogRow) => void;
  onEdit: (ex: CatalogRow) => void;
}) {
  const slug = modalityColorSlug(ex.modality);
  const muscles = ex.primary_muscle_groups.slice(0, 2).join(', ');
  // Origin woven into the existing caption, restrained on purpose (task D4: this
  // is a dense in-editor picker, not the catalog screen) — no badge/icon for
  // 'base' (the unmarked majority), just a word for the other two.
  const originLabel = ORIGIN_LABEL[ex.origin];
  const sub = [originLabel, ex.equipment[0], muscles].filter(Boolean).join(' · ');
  // video_url arrives already MERGED — read it directly.
  const hasVideo = ex.video_url != null;
  return (
    <div className="group flex items-center gap-2 rounded-[var(--v2-r-s)] px-2 transition-colors hover:bg-[color:var(--v2-elevated)]">
      <button
        type="button"
        onClick={() => onSelect(ex)}
        className="v2-focus flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left"
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: `var(--v2-mod-${slug})` }}
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-[color:var(--v2-fg)]">
            {ex.name}
          </span>
          {sub ? (
            <span className="block truncate text-label text-[color:var(--v2-faint)]">{sub}</span>
          ) : null}
        </span>
      </button>
      {/* El COLOR sale del cubo (remo/ski/bici comparten el naranja de "ergo": un
          punto no distingue máquinas), pero el TEXTO dice la modalidad REAL — "Remo",
          no "Ergómetro". Es el dato que guarda la fila y ahora el que el coach declara
          al crearla, así que la etiqueta que lee tiene que ser exactamente ése.
          Antes vivía aquí un mapa local de cinco cubos que además ya había derivado
          de MODALITY_META ("Circuito" allí, "Funcional" aquí). */}
      <span
        className="shrink-0 rounded-[var(--v2-r-pill)] px-1.5 py-0.5 text-eyebrow font-bold uppercase tracking-wide"
        style={{
          background: `var(--v2-mod-${slug}-soft)`,
          color: `var(--v2-mod-${slug})`,
        }}
      >
        {MODALITY_LABELS[ex.modality]}
      </span>
      {/* SIEMPRE visible, nunca `opacity-0 group-hover:opacity-100`: en un móvil
          no existe el hover, así que este botón era invisible — y el dashboard
          se usa desde el móvil (§9.3 del contrato). Se apoya en el COLOR para no
          competir con el nombre del ejercicio, no en desaparecer. El que ya
          tiene vídeo va en tinta plena porque es un dato de la fila; el resto,
          apagado. Nada de naranja de marca: no es un color de dato (§9.1). */}
      <button
        type="button"
        onClick={() => onEdit(ex)}
        aria-label={hasVideo ? `Editar ${ex.name} (tiene vídeo)` : `Editar ${ex.name}`}
        className={`v2-focus shrink-0 rounded-[var(--v2-r-s)] p-1 transition-colors hover:text-[color:var(--v2-fg)] ${
          hasVideo ? 'text-[color:var(--v2-fg)]' : 'text-[color:var(--v2-faint)]'
        }`}
        title={hasVideo ? 'Editar (tiene vídeo)' : 'Editar indicaciones y vídeo'}
      >
        <MIcon name={hasVideo ? 'play_circle' : 'edit'} size={16} />
      </button>
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
