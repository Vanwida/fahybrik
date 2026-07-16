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
//   • create  — inline "crear ejercicio" (name + category + optional YouTube),
//               POST /api/exercises, then selects the new exercise (D3 scope =
//               global single-coach; modality derived server-side).
//   • edit     — light "✎ editar ejercicio": set/update video_url (+ name/category)
//               on an existing exercise via the existing PATCH (D7: in the picker).
//
// AGNOSTIC: modality is the exercise's intrinsic data; the coach picks a category
// (the real enum), never a methodology/level/phase. Reuses GET /api/exercises and
// the shared youtubeUrlSchema (no new schema).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModalPortal, useEscapeToClose } from './ModalPortal';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { isValidYouTubeUrl } from '@fahybrid/shared/youtube';
import { modalityColorSlug } from '@/lib/dashboard/v2/editor-axes';
import type { V2Modality } from '@/components/v2/constants';

// ── The exercise shape the picker consumes (subset of CatalogExercise) ────────
export interface PickedExercise {
  id: number;
  name: string;
  category: ExerciseCategory;
  modality: Modality;
  video_url: string | null;
}

interface CatalogRow {
  id: string;
  name: string;
  category: ExerciseCategory;
  modality: Modality;
  primary_muscle_groups: string[];
  equipment: string[];
  // GLOBAL pedagogical content (the shared catalog default) — shown as the
  // placeholder when the coach hasn't overridden a field.
  video_url: string | null;
  cues: string | null;
  description: string | null;
  // THIS coach's RAW override per field (null = inheriting the global). Edited by
  // EditExerciseForm; the athlete sees coalesce(override, global) in their plan.
  override_cues: string | null;
  override_description: string | null;
  override_video_url: string | null;
}

// The exercise shape the API returns (GET list / POST create / PATCH edit).
// POST create has no override_* fields (a brand-new exercise) — coerced to null.
type ApiExercise = {
  id: string;
  name: string;
  category: ExerciseCategory;
  modality: Modality;
  primary_muscle_groups?: string[];
  equipment?: string[];
  video_url: string | null;
  cues: string | null;
  description: string | null;
  override_cues?: string | null;
  override_description?: string | null;
  override_video_url?: string | null;
};

function toCatalogRow(ex: ApiExercise): CatalogRow {
  return {
    id: ex.id,
    name: ex.name,
    category: ex.category,
    modality: ex.modality,
    primary_muscle_groups: ex.primary_muscle_groups ?? [],
    equipment: ex.equipment ?? [],
    video_url: ex.video_url,
    cues: ex.cues,
    description: ex.description,
    override_cues: ex.override_cues ?? null,
    override_description: ex.override_description ?? null,
    override_video_url: ex.override_video_url ?? null,
  };
}

// Effective field = the coach's override when set, else the global default. This
// is the same precedence the athlete-read SQL applies (coalesce); kept here only
// for the coach's own picker display.
const effectiveVideo = (ex: CatalogRow): string | null => ex.override_video_url ?? ex.video_url;

// Coach-facing category chips → real enum. Mirrors EXERCISE_CATEGORY_LABELS but
// kept here as the ordered create/filter set (the create form needs the same).
const CATEGORY_OPTIONS: { value: ExerciseCategory; label: string }[] = [
  { value: 'strength', label: 'Fuerza' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'hyrox_station', label: 'HYROX' },
  { value: 'core', label: 'Core' },
  { value: 'plyometric', label: 'Pliometría' },
  { value: 'skill', label: 'Skill' },
  { value: 'mobility', label: 'Movilidad' },
];

const CATEGORY_LABEL: Record<ExerciseCategory, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((c) => [c.value, c.label]),
) as Record<ExerciseCategory, string>;

const MODALITY_LABEL: Record<V2Modality, string> = {
  carrera: 'Carrera',
  ergo: 'Ergómetro',
  fuerza: 'Fuerza',
  circuito: 'Funcional',
  calentamiento: 'Movilidad',
};

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

  // Escape via la pila compartida: este picker se abre ENCIMA del drawer de dosis,
  // y con un listener propio en `window` una sola pulsación cerraría los dos.
  useEscapeToClose(onClose);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

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
          searchRef.current?.focus();
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
        // Editor preview uses the coach's effective video (override, else global).
        video_url: effectiveVideo(ex),
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
    <ModalPortal>
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
            className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
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
        <MIcon name="add" size={16} className="text-[color:var(--v2-accent)]" />
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
  const sub = [ex.equipment[0], muscles].filter(Boolean).join(' · ');
  const hasVideo = effectiveVideo(ex) != null;
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
            <span className="block truncate text-[11px] text-[color:var(--v2-faint)]">{sub}</span>
          ) : null}
        </span>
      </button>
      <span
        className="shrink-0 rounded-[var(--v2-r-pill)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
        style={{
          background: `var(--v2-mod-${slug}-soft)`,
          color: `var(--v2-mod-${slug})`,
        }}
      >
        {MODALITY_LABEL[slug]}
      </span>
      <button
        type="button"
        onClick={() => onEdit(ex)}
        aria-label={`Editar ${ex.name}`}
        className="v2-focus shrink-0 rounded-[var(--v2-r-s)] p-1 text-[color:var(--v2-faint)] opacity-0 transition-opacity hover:text-[color:var(--v2-fg)] focus:opacity-100 group-hover:opacity-100"
        title={hasVideo ? 'Editar tu versión (tiene vídeo)' : 'Editar tu versión — indicaciones y vídeo'}
      >
        <MIcon name={hasVideo ? 'play_circle' : 'edit'} size={16} />
      </button>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'v2-focus rounded-[var(--v2-r-pill)] px-2.5 py-1 text-[11px] font-bold transition-colors',
        active
          ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
          : 'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
      )}
    >
      {label}
    </button>
  );
}

// ── Create mode ─────────────────────────────────────────────────────────────--
function CreateExerciseForm({
  seedName,
  defaultCategory,
  onCancel,
  onCreated,
}: {
  seedName: string;
  defaultCategory: ExerciseCategory;
  onCancel: () => void;
  onCreated: (ex: CatalogRow) => void;
}) {
  const [name, setName] = useState(seedName);
  const [category, setCategory] = useState<ExerciseCategory>(defaultCategory);
  const [video, setVideo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoState = videoFieldState(video);
  const canSave = name.trim().length > 0 && videoState !== 'invalid' && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/exercises', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
          ...(video.trim() ? { video_url: video.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error(`create failed (${res.status})`);
      const data = (await res.json()) as { exercise: ApiExercise };
      onCreated(toCatalogRow(data.exercise));
    } catch {
      setError('No se pudo crear el ejercicio. Reintenta.');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 overflow-y-auto p-5">
      <label className="block space-y-1.5">
        <span className="v2-micro">Nombre</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={120}
          placeholder="p. ej. Zancada búlgara con mancuerna"
          aria-label="Nombre del ejercicio"
          className="v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)]"
        />
      </label>

      <div className="space-y-1.5">
        <span className="v2-micro">
          Tipo <span className="text-[color:var(--v2-faint)]">(de qué movimiento es)</span>
        </span>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_OPTIONS.map((c) => (
            <FilterChip
              key={c.value}
              label={c.label}
              active={category === c.value}
              onClick={() => setCategory(c.value)}
            />
          ))}
        </div>
      </div>

      <YouTubeField value={video} onChange={setVideo} state={videoState} />

      <div className="flex items-start gap-2 rounded-[var(--v2-r-s)] border border-[color:rgba(242,165,46,.3)] bg-[color:var(--v2-warn-soft)] px-3 py-2.5">
        <MIcon name="info" size={15} className="mt-px shrink-0 text-[color:var(--v2-warn)]" />
        <p className="text-[12px] leading-snug text-[color:var(--v2-fg)]">
          Se añade a tu catálogo y queda disponible para cualquier sesión.
        </p>
      </div>

      {error ? <p className="text-xs text-[color:var(--v2-danger)]">{error}</p> : null}

      <div className="flex items-center justify-between gap-3 border-t border-[color:var(--v2-border)] pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="v2-focus rounded-[var(--v2-r-s)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 py-2 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
        >
          <MIcon name={saving ? 'progress_activity' : 'add'} size={16} />
          {saving ? 'Creando…' : 'Crear y usar'}
        </button>
      </div>
    </div>
  );
}

// ── Edit mode (the coach's OWN version of an existing exercise) ───────────────
// Edits THIS coach's override (cues / description / video). The exercise stays a
// single global row; only the coach's pedagogical content is per-coach. Each field
// prefills with the coach's override and shows the GLOBAL value as placeholder —
// left empty, the athlete inherits the global default (PATCH → coach_exercise_overrides).
function EditExerciseForm({
  exercise,
  onCancel,
  onEdited,
}: {
  exercise: CatalogRow;
  onCancel: () => void;
  onEdited: (ex: CatalogRow) => void;
}) {
  const [cues, setCues] = useState(exercise.override_cues ?? '');
  const [description, setDescription] = useState(exercise.override_description ?? '');
  const [video, setVideo] = useState(exercise.override_video_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoState = videoFieldState(video);
  const canSave = videoState !== 'invalid' && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/exercises/${exercise.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        // Send each field trimmed; '' → null server-side = clear the override for
        // that field (athlete falls back to the global). The route writes these to
        // THIS coach's override, never the global exercise row.
        body: JSON.stringify({
          cues: cues.trim(),
          description: description.trim(),
          video_url: video.trim(),
        }),
      });
      if (!res.ok) throw new Error(`update failed (${res.status})`);
      const data = (await res.json()) as { exercise: ApiExercise };
      onEdited(toCatalogRow(data.exercise));
    } catch {
      setError('No se pudo guardar. Reintenta.');
      setSaving(false);
    }
  };

  const slug = modalityColorSlug(exercise.modality);

  return (
    <div className="space-y-4 overflow-y-auto p-5">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: `var(--v2-mod-${slug})` }}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[color:var(--v2-fg)]">{exercise.name}</p>
          <p className="text-[11px] text-[color:var(--v2-faint)]">{CATEGORY_LABEL[exercise.category]}</p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5">
        <MIcon name="person" size={15} className="mt-px shrink-0 text-[color:var(--v2-accent)]" />
        <p className="text-[12px] leading-snug text-[color:var(--v2-fg)]">
          <b>Tu versión.</b> Es lo que verán <b>tus</b> atletas en este ejercicio. Lo que dejes
          vacío se hereda del contenido base.
        </p>
      </div>

      <OverrideTextField
        label="Indicaciones (cues)"
        value={cues}
        onChange={setCues}
        globalValue={exercise.cues}
        rows={3}
      />

      <OverrideTextField
        label="Descripción"
        value={description}
        onChange={setDescription}
        globalValue={exercise.description}
        rows={3}
      />

      <YouTubeField value={video} onChange={setVideo} state={videoState} forEdit />

      {error ? <p className="text-xs text-[color:var(--v2-danger)]">{error}</p> : null}

      <div className="flex items-center justify-between gap-3 border-t border-[color:var(--v2-border)] pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="v2-focus rounded-[var(--v2-r-s)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 py-2 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
        >
          <MIcon name={saving ? 'progress_activity' : 'save'} size={16} />
          {saving ? 'Guardando…' : 'Guardar mi versión'}
        </button>
      </div>
    </div>
  );
}

// A multi-line override field: prefilled with the coach's override, the GLOBAL
// value shown as placeholder, with an honest "empty = inherits the base" hint.
function OverrideTextField({
  label,
  value,
  onChange,
  globalValue,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  globalValue: string | null;
  rows: number;
}) {
  const base = globalValue?.trim() || null;
  return (
    <label className="block space-y-1.5">
      <span className="v2-micro">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={2000}
        placeholder={base ?? 'Sin contenido base — escribe el tuyo…'}
        className="v2-focus w-full resize-y rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm leading-snug text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)]"
      />
      <p className="text-[11px] text-[color:var(--v2-faint)]">
        {base
          ? 'Vacío = tus atletas verán el contenido base (el del placeholder).'
          : 'No hay contenido base; si lo dejas vacío, no se mostrará nada.'}
      </p>
    </label>
  );
}

// ── Shared YouTube input (alta + edición — one source, one validator) ─────────
type VideoState = 'empty' | 'valid' | 'invalid';

function videoFieldState(value: string): VideoState {
  const v = value.trim();
  if (!v) return 'empty';
  return isValidYouTubeUrl(v) ? 'valid' : 'invalid';
}

function YouTubeField({
  value,
  onChange,
  state,
  forEdit,
}: {
  value: string;
  onChange: (v: string) => void;
  state: VideoState;
  forEdit?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <span className="v2-micro">
        Vídeo de YouTube <span className="text-[color:var(--v2-faint)]">(opcional)</span>
      </span>
      <input
        type="url"
        inputMode="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pega el link de YouTube…"
        aria-label="Vídeo de YouTube"
        className={cn(
          'v2-focus w-full rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)]',
          state === 'invalid'
            ? 'border-[color:var(--v2-danger)]'
            : 'border-[color:var(--v2-border-strong)] focus:border-[color:var(--v2-accent)]',
        )}
      />
      {state === 'valid' ? (
        <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--v2-ok)]">
          <MIcon name="play_circle" size={13} />
          Link válido. El atleta verá el vídeo en el detalle del ejercicio en iOS.
        </p>
      ) : state === 'invalid' ? (
        <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--v2-danger)]">
          <MIcon name="error" size={13} />
          No es una URL de YouTube válida.
        </p>
      ) : forEdit ? (
        <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--v2-faint)]">
          <MIcon name="info" size={13} />
          Sin vídeo todavía. Pega un link y el atleta lo verá al abrir este ejercicio.
        </p>
      ) : null}
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
