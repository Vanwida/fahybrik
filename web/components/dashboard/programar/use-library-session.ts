'use client';

// useLibrarySession — máquina de estado del drawer de sesión de la biblioteca
// única (/programar, spec §3a). Carga el item (entreno propio o bloque de
// Pablo), mantiene la sesión editable con autosave + undo/redo y expone los
// handlers que el SessionDrawer necesita. La vista vive en
// LibrarySessionDrawer.tsx; aquí solo lógica.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Block } from '@fahybrid/shared/schema/blocks';
import type {
  BlockUseModifiers,
  WeekDayPart,
  WeekDayPartItem,
  WeekSession,
} from '@fahybrid/shared/schema/program-templates';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import { createPartFromLibraryBlock } from '@/lib/dashboard/programming/block-to-part';
import {
  useEditHistory,
  useUndoRedoShortcuts,
} from '@/lib/dashboard/programming/use-slots-history';
import {
  sessionToTemplateUpdatePayload,
  templateDetailToSession,
  type TemplateDetailWire,
  type TemplateMeta,
} from '@/lib/dashboard/programming/template-session';
import { useDebouncedAutosave, useUnloadGuard } from '@/lib/dashboard/hooks/use-autosave';
import { blockToTemplatePayload } from '@/components/dashboard/session-drawer/save-block-template';

export type LibraryDrawerItem =
  | { kind: 'own'; template_id: string }
  | { kind: 'pablo'; block_id: number };

const AUTOSAVE_DELAY_MS = 800;
const SAVED_FLASH_MS = 2000;

function itemKey(item: LibraryDrawerItem | null): string {
  if (!item) return '';
  return item.kind === 'own' ? `own-${item.template_id}` : `pablo-${item.block_id}`;
}

interface UseLibrarySessionArgs {
  item: LibraryDrawerItem | null;
  onClose: () => void;
  /** Tras crear/guardar — el caller refresca el grid (router.refresh). */
  onMutated: () => void;
}

export function useLibrarySession({ item, onClose, onMutated }: UseLibrarySessionArgs) {
  // `mode` puede divergir del prop tras "Duplicar como propia" (pablo → own).
  const [mode, setMode] = useState<LibraryDrawerItem | null>(item);
  const [session, setSession] = useState<WeekSession | null>(null);
  const [meta, setMeta] = useState<TemplateMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  // Fase ATR del bloque de Pablo abierto — viaja al entreno al duplicarlo.
  const [pabloAtr, setPabloAtr] = useState<'ACC' | 'TRANS' | 'REAL' | null>(null);
  const [exercises, setExercises] = useState<CatalogExercise[]>([]);
  const [libraryBlocks, setLibraryBlocks] = useState<Block[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [blockPickerOpen, setBlockPickerOpen] = useState(false);
  const [pabloIAOpen, setPabloIAOpen] = useState(false);

  const sessionRef = useRef<WeekSession | null>(null);
  const metaRef = useRef<TemplateMeta | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  // Cola de guardado (mismo patrón que el studio): un PUT en vuelo encola el
  // siguiente en vez de solaparse.
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const history = useEditHistory<WeekSession | null>(null);

  // Sincroniza el modo cuando el caller abre otro item (ajuste en render, no
  // setState-en-effect — patrón del repo).
  const [prevKey, setPrevKey] = useState(itemKey(item));
  const currentKey = itemKey(item);
  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    setMode(item);
    setSession(null);
    setMeta(null);
    setLoadError(null);
    setDirty(false);
    setSaveError(null);
    setSavedFlash(false);
  }

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  // Carga del item activo (entreno propio o bloque de Pablo).
  useEffect(() => {
    if (!mode) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        if (mode.kind === 'own') {
          const res = await fetch(`/api/coach/templates/${mode.template_id}`, {
            credentials: 'include',
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as { template: TemplateDetailWire };
          if (cancelled) return;
          const detail = json.template;
          const base = templateDetailToSession(detail);
          setSession(base);
          history.reset(base);
          setMeta({
            format: detail.format as TemplateMeta['format'],
            target_block: detail.target_block,
            target_level: detail.target_level,
            methodology_group_id: detail.methodology_group_id,
            coach_notes: detail.coach_notes,
            is_draft: detail.is_draft,
          });
        } else {
          const res = await fetch(`/api/coach/blocks/${mode.block_id}`, {
            credentials: 'include',
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as { block: Block; items: WeekDayPartItem[] };
          if (cancelled) return;
          const part = createPartFromLibraryBlock(json.block);
          part.items = json.items;
          const base: WeekSession = {
            kind: 'workout',
            focus: json.block.title.slice(0, 120),
            blocks: [part],
          };
          setSession(base);
          history.reset(base);
          setMeta(null);
          setPabloAtr(json.block.atr_block_hint);
        }
        setDirty(false);
        setSaveError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la sesión');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // history es estable (callbacks memoizados); el trigger real es el item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Catálogos compartidos (ejercicios + bloques de Pablo para "Añadir bloque"),
  // una sola vez al primer montaje con item abierto.
  const open = item != null;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (exercises.length === 0) {
      fetch('/api/exercises?limit=2000', { credentials: 'include' })
        .then((r) => r.json())
        .then((json) => {
          if (!cancelled) {
            setExercises((json as { exercises?: CatalogExercise[] }).exercises ?? []);
          }
        })
        .catch(() => undefined);
    }
    if (libraryBlocks.length === 0) {
      // Flags dentro de la IIFE async (no síncronos en el cuerpo del effect).
      void (async () => {
        setLoadingBlocks(true);
        try {
          const res = await fetch('/api/coach/blocks?group=all', { credentials: 'include' });
          const json = (await res.json()) as { blocks?: Block[] };
          if (!cancelled) setLibraryBlocks(json.blocks ?? []);
        } catch {
          // Sin bloques: el picker degrada a lista vacía; reintenta al reabrir.
        } finally {
          if (!cancelled) setLoadingBlocks(false);
        }
      })();
    }
    return () => {
      cancelled = true;
    };
    // Solo al abrir; los length-guards evitan re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc cierra (cuando no hay sub-modales abiertos).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !blockPickerOpen && !pabloIAOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, blockPickerOpen, pabloIAOpen, onClose]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  const readOnly = mode?.kind === 'pablo';

  // ── Mutaciones de la sesión (solo modo propio) ────────────────────────────
  const commitSession = useCallback(
    (producer: (prev: WeekSession) => WeekSession, opts?: { history?: boolean }) => {
      const prev = sessionRef.current;
      if (!prev) return;
      const next = producer(prev);
      if (next === prev) return;
      if (opts?.history !== false) history.push(prev);
      sessionRef.current = next;
      setSession(next);
      setSaveError(null);
      setDirty(true);
    },
    [history],
  );

  const patchBlocks = useCallback(
    (updater: (blocks: WeekDayPart[]) => WeekDayPart[], opts?: { history?: boolean }) => {
      commitSession((prev) => ({ ...prev, blocks: updater(prev.blocks ?? []) }), opts);
    },
    [commitSession],
  );

  const handleChangeMeta = useCallback((patch: Partial<TemplateMeta>) => {
    setMeta((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaveError(null);
    setDirty(true);
  }, []);

  // ── Guardado (PUT del entreno propio) ─────────────────────────────────────
  // "Latest ref" para re-disparar el guardado encolado sin que el callback se
  // referencie a sí mismo (React Compiler no puede preservar esa memoización).
  const saveFnRef = useRef<() => Promise<void>>(async () => {});
  const save = useCallback(async () => {
    if (!mode || mode.kind !== 'own') return;
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    const currentSession = sessionRef.current;
    const currentMeta = metaRef.current;
    if (!currentSession || !currentMeta) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/coach/templates/${mode.template_id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionToTemplateUpdatePayload(currentSession, currentMeta)),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(json?.error?.message ?? `Error al guardar (HTTP ${res.status})`);
      }
      // Solo marca limpio si NO hubo ediciones durante el PUT en vuelo.
      if (sessionRef.current === currentSession && metaRef.current === currentMeta) {
        setDirty(false);
      }
      setSavedFlash(true);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
      onMutated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void saveFnRef.current();
      }
    }
  }, [mode, onMutated]);

  useEffect(() => {
    saveFnRef.current = save;
  }, [save]);

  // La revisión cubre sesión Y metadatos: cualquier edición reinicia el debounce.
  const revision = useMemo(() => ({ session, meta }), [session, meta]);
  useDebouncedAutosave({
    dirty: dirty && !readOnly,
    revision,
    delayMs: AUTOSAVE_DELAY_MS,
    onSave: save,
  });
  useUnloadGuard({ when: dirty || saving });

  // ── Undo / redo ───────────────────────────────────────────────────────────
  const applyRestored = useCallback((restored: WeekSession | null) => {
    if (!restored) return;
    sessionRef.current = restored;
    setSession(restored);
    setSaveError(null);
    setDirty(true);
  }, []);

  const handleUndo = useCallback(() => applyRestored(history.undo()), [history, applyRestored]);
  const handleRedo = useCallback(() => applyRestored(history.redo()), [history, applyRestored]);
  useUndoRedoShortcuts({ onUndo: handleUndo, onRedo: handleRedo, enabled: open && !readOnly });

  // ── Añadir bloque desde la Biblioteca de Pablo ────────────────────────────
  const handleAddBlockFromLibrary = useCallback(
    (block: Block, modifiers: BlockUseModifiers) => {
      const part = createPartFromLibraryBlock(block, modifiers);
      patchBlocks((blocks) => [...blocks, part]);
      // Hidrata los ejercicios estructurados en diferido (mismo patrón que el
      // studio); si falla, el part queda verbatim (degradación segura).
      void fetch(`/api/coach/blocks/${block.id}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const items = (data?.items ?? []) as WeekDayPartItem[];
          if (items.length === 0) return;
          patchBlocks(
            (blocks) => blocks.map((p) => (p.uid === part.uid ? { ...p, items } : p)),
            { history: false },
          );
        })
        .catch(() => undefined);
    },
    [patchBlocks],
  );

  // ── "Duplicar como propia" (bloque de Pablo → entreno del coach) ──────────
  const handleDuplicateAsOwnTemplate = useCallback(async () => {
    if (mode?.kind !== 'pablo' || duplicating) return;
    const part = sessionRef.current?.blocks?.[0];
    if (!part) return;
    setDuplicating(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/coach/templates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...blockToTemplatePayload(part),
          // Conserva la fase ATR del bloque original como tag del entreno.
          target_block: pabloAtr ?? 'any',
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(json?.error?.message ?? 'No se pudo duplicar la sesión');
      }
      const json = (await res.json()) as { id: string };
      onMutated();
      setMode({ kind: 'own', template_id: json.id });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'No se pudo duplicar la sesión');
    } finally {
      setDuplicating(false);
    }
  }, [mode, duplicating, pabloAtr, onMutated]);

  // Flush al cerrar: un cambio aún en debounce (<800ms) se persiste igualmente.
  const handleClose = useCallback(() => {
    if (dirty && !readOnly) void save();
    onClose();
  }, [dirty, readOnly, save, onClose]);

  return {
    session,
    meta,
    loading,
    loadError,
    readOnly,
    dirty,
    saving,
    savedFlash,
    saveError,
    duplicating,
    exercises,
    libraryBlocks,
    loadingBlocks,
    blockPickerOpen,
    setBlockPickerOpen,
    pabloIAOpen,
    setPabloIAOpen,
    history,
    handleUndo,
    handleRedo,
    commitSession,
    patchBlocks,
    handleChangeMeta,
    handleAddBlockFromLibrary,
    handleDuplicateAsOwnTemplate,
    handleClose,
  };
}
