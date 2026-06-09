'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { SegmentParams } from '@/lib/templates/schema';
import { ExercisePalette } from './exercise-palette';
import { SegmentRow } from './segment-row';
import { MetadataPanel, type MetadataState } from './metadata-panel';
import { AthletePreview } from './athlete-preview';
import { validateSegments } from './validation';
import { HYROX_STATION_DEFAULTS } from '@/lib/templates/station-defaults';
import type {
  BuilderSegment,
  CatalogExercise,
  ExerciseCategoryToken,
  TemplateBuilderInitialState,
} from './template-types';
import { cn } from '@/lib/utils';

type Mode = 'new' | 'edit';

interface State {
  meta: MetadataState;
  segments: BuilderSegment[];
  expandedUid: string | null;
  serverId: string | null;
  version: number;
  assignmentCount: number;
  dirty: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  saveError: string | null;
  flash: 'idle' | 'saved';
}

type Action =
  | { type: 'patchMeta'; patch: Partial<MetadataState> }
  | { type: 'addSegment'; segment: BuilderSegment }
  | { type: 'updateSegment'; uid: string; next: BuilderSegment }
  | { type: 'deleteSegment'; uid: string }
  | { type: 'reorder'; from: number; to: number }
  | { type: 'expand'; uid: string | null }
  | { type: 'markSaving'; saving: boolean }
  | {
      type: 'savedNew';
      serverId: string;
      version: number;
    }
  | { type: 'savedExisting'; version: number; rotated: boolean; newServerId?: string }
  | { type: 'markDirty' }
  | { type: 'saveError'; message: string | null }
  | { type: 'flash'; v: 'idle' | 'saved' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'patchMeta':
      return { ...state, meta: { ...state.meta, ...action.patch }, dirty: true };
    case 'addSegment':
      return {
        ...state,
        segments: [...state.segments, action.segment],
        expandedUid: action.segment.uid,
        dirty: true,
      };
    case 'updateSegment':
      return {
        ...state,
        segments: state.segments.map((s) => (s.uid === action.uid ? action.next : s)),
        dirty: true,
      };
    case 'deleteSegment':
      return {
        ...state,
        segments: state.segments.filter((s) => s.uid !== action.uid),
        expandedUid: state.expandedUid === action.uid ? null : state.expandedUid,
        dirty: true,
      };
    case 'reorder':
      return {
        ...state,
        segments: arrayMove(state.segments, action.from, action.to),
        dirty: true,
      };
    case 'expand':
      return { ...state, expandedUid: action.uid };
    case 'markSaving':
      return { ...state, saving: action.saving };
    case 'savedNew':
      return {
        ...state,
        serverId: action.serverId,
        version: action.version,
        dirty: false,
        saving: false,
        lastSavedAt: Date.now(),
        saveError: null,
      };
    case 'savedExisting':
      return {
        ...state,
        serverId: action.newServerId ?? state.serverId,
        version: action.version,
        dirty: false,
        saving: false,
        lastSavedAt: Date.now(),
        saveError: null,
      };
    case 'markDirty':
      return { ...state, dirty: true };
    case 'saveError':
      return { ...state, saving: false, saveError: action.message };
    case 'flash':
      return { ...state, flash: action.v };
    default:
      return state;
  }
}

function emptyMeta(): MetadataState {
  return {
    name: '',
    format: 'strength_block',
    target_block: 'any',
    target_level: null,
    day_position: null,
    is_partner_workout: false,
    warmup: null,
    cooldown: null,
    coach_notes: null,
    demo_video_url: null,
  };
}

function buildInitialState(
  mode: Mode,
  initial?: TemplateBuilderInitialState,
): State {
  if (mode === 'new' || !initial) {
    return {
      meta: emptyMeta(),
      segments: [],
      expandedUid: null,
      serverId: null,
      version: 1,
      assignmentCount: 0,
      dirty: false,
      saving: false,
      lastSavedAt: null,
      saveError: null,
      flash: 'idle',
    };
  }

  return {
    meta: {
      name: initial.name,
      format: initial.format,
      target_block: initial.target_block,
      target_level: initial.target_level,
      day_position: initial.day_position,
      is_partner_workout: initial.is_partner_workout,
      warmup: initial.warmup,
      cooldown: initial.cooldown,
      coach_notes: initial.coach_notes,
      demo_video_url: initial.demo_video_url,
    },
    segments: initial.segments.map((s) => ({
      uid: `srv-${s.id}`,
      serverId: s.id,
      exercise_id: s.exercise_id,
      exercise_slug: s.exercise_slug,
      exercise_name: s.exercise_name,
      exercise_category: s.exercise_category as ExerciseCategoryToken,
      params_json: (s.params_json ?? {}) as SegmentParams,
      notes: s.notes,
    })),
    expandedUid: null,
    serverId: initial.id,
    version: initial.version,
    assignmentCount: initial.assignment_count,
    dirty: false,
    saving: false,
    lastSavedAt: null,
    saveError: null,
    flash: 'idle',
  };
}

interface BuilderProps {
  mode: Mode;
  initial?: TemplateBuilderInitialState;
}

let localUidCounter = 0;
function nextLocalUid() {
  localUidCounter += 1;
  return `local-${localUidCounter}-${Date.now()}`;
}

function defaultParamsForExercise(ex: CatalogExercise): SegmentParams {
  if (ex.category === 'hyrox_station') {
    const def = HYROX_STATION_DEFAULTS[ex.slug];
    if (def) {
      return {
        ...(def.distance_meters && { distance_meters: def.distance_meters }),
        ...(def.reps && { reps: def.reps }),
        ...(def.weight_kg && { weight_kg: def.weight_kg }),
        ...(def.alt_classes && { station_alt_classes: def.alt_classes }),
      };
    }
  }
  if (ex.category === 'cardio') {
    return { cardio_mode: 'distance' };
  }
  if (ex.category === 'strength') {
    return { sets: 5, reps: 5 };
  }
  return {};
}

export function TemplateBuilder({ mode, initial }: BuilderProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    buildInitialState(mode, initial),
  );

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLevel, setPreviewLevel] = useState<1 | 2 | 3>(2);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const warnings = useMemo(() => validateSegments(state.segments), [state.segments]);
  const warningByUid = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of warnings) {
      if (!map.has(w.uid)) map.set(w.uid, w.message);
    }
    return map;
  }, [warnings]);

  const buildSavePayload = useCallback(
    (asDraft: boolean) => ({
      name: state.meta.name || 'Plantilla sin título',
      format: state.meta.format,
      target_block: state.meta.target_block,
      target_level: state.meta.target_level,
      day_position: state.meta.day_position,
      is_partner_workout: state.meta.is_partner_workout,
      warmup: state.meta.warmup,
      cooldown: state.meta.cooldown,
      coach_notes: state.meta.coach_notes,
      demo_video_url: state.meta.demo_video_url,
      is_draft: asDraft,
      segments: state.segments.map((s, i) => ({
        exercise_id: s.exercise_id,
        position: i,
        params_json: s.params_json,
        notes: s.notes,
      })),
    }),
    [state.meta, state.segments],
  );

  const persist = useCallback(
    async (asDraft: boolean) => {
      dispatch({ type: 'markSaving', saving: true });
      try {
        const body = buildSavePayload(asDraft);
        if (!state.serverId) {
          const res = await fetch('/api/templates', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error(await readErrorMessage(res));
          const data = (await res.json()) as { id: string; version: number };
          dispatch({ type: 'savedNew', serverId: data.id, version: data.version });
          // Update URL silently to /templates/[id]
          router.replace(`/templates/${data.id}`, { scroll: false });
        } else {
          const res = await fetch(`/api/templates/${state.serverId}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error(await readErrorMessage(res));
          const data = (await res.json()) as {
            id: string;
            version: number;
            versioned: boolean;
          };
          dispatch({
            type: 'savedExisting',
            version: data.version,
            rotated: data.versioned,
            newServerId: data.versioned ? data.id : undefined,
          });
          if (data.versioned) {
            router.replace(`/templates/${data.id}`, { scroll: false });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al guardar';
        dispatch({ type: 'saveError', message });
      }
    },
    [buildSavePayload, router, state.serverId],
  );

  // Auto-save: 1s debounce after any dirty change.
  useEffect(() => {
    if (!state.dirty) return;
    if (state.saving) return;
    const t = setTimeout(() => {
      void persist(true);
    }, 1000);
    return () => clearTimeout(t);
  }, [state.dirty, state.saving, persist]);

  // Force-save = mark not draft + save.
  const onForceSave = useCallback(async () => {
    await persist(false);
    dispatch({ type: 'flash', v: 'saved' });
    setTimeout(() => dispatch({ type: 'flash', v: 'idle' }), 700);
  }, [persist]);

  const onAddSegmentBlank = useCallback(() => {
    // Add an empty placeholder segment — Pablo can pick exercise from palette by drag,
    // but most adds will come via DnD. This stub appends a placeholder so `n` shortcut works.
    // Without an exercise selected, the row shows "Selecciona ejercicio" and is unsaveable.
    // For simplicity here, focus search instead.
    searchInputRef.current?.focus();
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // cmd/ctrl + s — force save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void onForceSave();
        return;
      }
      // cmd/ctrl + enter — add new segment placeholder (focus search)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onAddSegmentBlank();
        return;
      }
      if (inEditable) return;
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'n') {
        e.preventDefault();
        onAddSegmentBlank();
      } else if (e.key === 's') {
        e.preventDefault();
        void onForceSave();
      } else if (e.key === 'Escape') {
        if (previewOpen) {
          setPreviewOpen(false);
        } else {
          dispatch({ type: 'expand', uid: null });
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onForceSave, onAddSegmentBlank, previewOpen]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as
      | { source?: 'palette'; exercise?: CatalogExercise }
      | undefined;

    if (activeData?.source === 'palette' && activeData.exercise) {
      // Drop from palette → append to canvas (or insert at over position).
      const ex = activeData.exercise;
      const baseParams = defaultParamsForExercise(ex);
      const newSeg: BuilderSegment = {
        uid: nextLocalUid(),
        serverId: null,
        exercise_id: ex.id,
        exercise_slug: ex.slug,
        exercise_name: ex.name,
        exercise_category: ex.category,
        params_json: ex.video_url
          ? { ...baseParams, video_url: ex.video_url }
          : baseParams,
        notes: null,
      };
      dispatch({ type: 'addSegment', segment: newSeg });
      return;
    }

    // Reorder within canvas
    if (active.id !== over.id) {
      const fromIdx = state.segments.findIndex((s) => s.uid === active.id);
      const toIdx = state.segments.findIndex((s) => s.uid === over.id);
      if (fromIdx !== -1 && toIdx !== -1) {
        dispatch({ type: 'reorder', from: fromIdx, to: toIdx });
      }
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row lg:min-h-screen">
        <div
          className={cn(
            'shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--hairline)]',
            paletteOpen ? 'flex' : 'hidden lg:flex',
          )}
        >
          <ExercisePalette searchInputRef={searchInputRef} />
        </div>

        <main className="flex-1 min-w-0 flex flex-col bg-[var(--bg)]">
          <div className="lg:hidden px-4 pt-2">
            <button
              type="button"
              onClick={() => setPaletteOpen((o) => !o)}
              className="w-full h-9 rounded-md border border-[var(--outline)] text-xs uppercase tracking-[0.14em] text-[var(--muted)] hover:text-foreground"
            >
              {paletteOpen ? 'Ocultar ejercicios' : 'Añadir ejercicio'}
            </button>
          </div>

          <BuilderHeader
            name={state.meta.name}
            version={state.version}
            assignmentCount={state.assignmentCount}
            saving={state.saving}
            dirty={state.dirty}
            lastSavedAt={state.lastSavedAt}
            saveError={state.saveError}
            warnings={warnings.length}
            flash={state.flash}
            onSave={() => void onForceSave()}
            onPreview={() => setPreviewOpen(true)}
          />

          {state.assignmentCount > 0 && !initial?.is_draft && (
            <div className="mx-6 mt-4 px-4 py-3 rounded-md text-xs bg-[var(--surface)] border border-[var(--warning)]/30">
              Esta plantilla está asignada a {state.assignmentCount} atletas. Al guardar
              se creará la versión v{state.version + 1}; v{state.version} mantiene las
              asignaciones existentes.
            </div>
          )}

          <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 lg:gap-6 px-3 sm:px-6 py-4">
            <Canvas
              segments={state.segments}
              expandedUid={state.expandedUid}
              warningByUid={warningByUid}
              warningsTotal={warnings.length}
              onExpand={(uid) => dispatch({ type: 'expand', uid })}
              onChange={(uid, next) => dispatch({ type: 'updateSegment', uid, next })}
              onDelete={(uid) => dispatch({ type: 'deleteSegment', uid })}
              onJumpToFirstWarning={() => {
                if (warnings[0]) dispatch({ type: 'expand', uid: warnings[0].uid });
              }}
            />

            <aside className="bg-[var(--surface)] rounded-[var(--r-l)] p-4 xl:self-start xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] overflow-y-auto order-first xl:order-none">
              <MetadataPanel
                meta={state.meta}
                onChange={(next) => dispatch({ type: 'patchMeta', patch: next })}
                versionChain={[]}
              />
            </aside>
          </div>
        </main>
      </div>

      <AthletePreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        name={state.meta.name}
        format={state.meta.format}
        warmup={state.meta.warmup}
        cooldown={state.meta.cooldown}
        demoVideoUrl={state.meta.demo_video_url}
        segments={state.segments}
        level={previewLevel}
        onLevelChange={setPreviewLevel}
      />
    </DndContext>
  );
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

function BuilderHeader({
  name,
  version,
  assignmentCount,
  saving,
  dirty,
  lastSavedAt,
  saveError,
  warnings,
  flash,
  onSave,
  onPreview,
}: {
  name: string;
  version: number;
  assignmentCount: number;
  saving: boolean;
  dirty: boolean;
  lastSavedAt: number | null;
  saveError: string | null;
  warnings: number;
  flash: 'idle' | 'saved';
  onSave: () => void;
  onPreview: () => void;
}) {
  return (
    <header className="px-6 py-4 flex items-center justify-between border-b border-[var(--hairline)]">
      <div className="min-w-0">
        <Link
          href="/templates"
          className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] hover:text-foreground inline-flex items-center gap-1"
        >
          ← Plantillas
        </Link>
        <h1 className="font-display italic font-black text-2xl tracking-tight truncate">
          {name || 'Nueva plantilla'}
          <span className="ml-3 font-mono not-italic text-sm text-[var(--accent)]">
            v{version}
          </span>
          {assignmentCount > 0 && (
            <span className="ml-2 font-sans not-italic text-xs text-[var(--muted)]">
              · asignada {assignmentCount}×
            </span>
          )}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <SaveStatus
          saving={saving}
          dirty={dirty}
          lastSavedAt={lastSavedAt}
          error={saveError}
        />
        {warnings > 0 && (
          <span
            className="text-xs uppercase tracking-[0.16em] text-[var(--warning)]"
            title={`${warnings} segmento(s) incompleto(s)`}
          >
            ⚠ {warnings}
          </span>
        )}
        <button
          type="button"
          onClick={onPreview}
          className="h-9 px-3 inline-flex items-center text-sm rounded-md border border-[var(--outline)] hover:bg-[var(--surface-elevated)]"
        >
          Ver como atleta
        </button>
        <button
          type="button"
          onClick={onSave}
          className={cn(
            'h-9 px-4 inline-flex items-center text-sm font-medium rounded-md transition-colors',
            'bg-[var(--accent)] text-[var(--accent-on)] hover:bg-[var(--accent-press)]',
            flash === 'saved' && 'bg-[var(--ok)]',
          )}
        >
          {flash === 'saved' ? '✓ Guardado' : 'Guardar'}
        </button>
      </div>
    </header>
  );
}

function SaveStatus({
  saving,
  dirty,
  lastSavedAt,
  error,
}: {
  saving: boolean;
  dirty: boolean;
  lastSavedAt: number | null;
  error: string | null;
}) {
  if (error) {
    return (
      <span className="text-xs uppercase tracking-[0.16em] text-[var(--danger)]">
        ✗ {error}
      </span>
    );
  }
  if (saving) {
    return (
      <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
        Guardando…
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
        Cambios sin guardar
      </span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
        ✓ Auto-guardado
      </span>
    );
  }
  return null;
}

function Canvas({
  segments,
  expandedUid,
  warningByUid,
  warningsTotal,
  onExpand,
  onChange,
  onDelete,
  onJumpToFirstWarning,
}: {
  segments: BuilderSegment[];
  expandedUid: string | null;
  warningByUid: Map<string, string>;
  warningsTotal: number;
  onExpand: (uid: string | null) => void;
  onChange: (uid: string, next: BuilderSegment) => void;
  onDelete: (uid: string) => void;
  onJumpToFirstWarning: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-drop-zone' });

  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Segmentos ({segments.length})
        </h2>
        {warningsTotal > 0 && (
          <button
            type="button"
            onClick={onJumpToFirstWarning}
            className="text-[10px] uppercase tracking-[0.16em] text-[var(--warning)] hover:text-foreground"
          >
            ⚠ {warningsTotal} incompleto{warningsTotal === 1 ? '' : 's'} — saltar
          </button>
        )}
      </div>

      <SortableContext
        items={segments.map((s) => s.uid)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
          className={cn(
            'rounded-[var(--r-l)] overflow-hidden bg-[var(--surface)] min-h-32',
            isOver && 'outline outline-2 outline-[var(--accent)]/40',
          )}
        >
          {segments.length === 0 && (
            <li className="px-6 py-12 text-center text-sm text-[var(--muted)]">
              Arrastra ejercicios desde el panel izquierdo o pulsa{' '}
              <kbd className="font-mono text-xs px-1 py-0.5 rounded-sm bg-[var(--surface-elevated)] text-foreground">
                /
              </kbd>{' '}
              para buscar.
            </li>
          )}
          {segments.map((s, i) => (
            <SegmentRow
              key={s.uid}
              segment={s}
              index={i}
              expanded={expandedUid === s.uid}
              onExpand={onExpand}
              onChange={(next) => onChange(s.uid, next)}
              onDelete={() => onDelete(s.uid)}
              warning={warningByUid.get(s.uid) ?? null}
            />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}
