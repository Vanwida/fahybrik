'use client';

// SessionDrawer — THE editing surface of the coach dashboard redesign (§2b).
// A right drawer (~40% width on desktop, full-screen on mobile via the caller's
// drawer shell) showing ONE session end to end: editable title, day/state,
// vertical list of blocks, "+ Añadir bloque" (Biblioteca · Pablo IA · En
// blanco) and "+ Añadir ejercicio", with autosave status + "Guardar bloque en
// biblioteca" in the footer. Golden rule: any exercise editable in ≤2 clicks,
// ZERO nested modals — the prescription editor expands inline in the row.
//
// It is surface-agnostic: the week-template studio mounts it today; the
// athlete calendar and the session library reuse it in later phases.

import { useEffect, useRef, useState } from 'react';
import type { WeekDayPart, WeekSession } from '@fahybrid/shared/schema/program-templates';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import { blockOrigin } from '@/lib/dashboard/programming/block-origin';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/dashboard/MIcon';
import { AddBlockMenu } from '@/components/dashboard/programming/studio/AddBlockMenu';
import { DrawerBlockCard } from './DrawerBlockCard';
import { saveBlockToLibrary } from './save-block-template';

const SESSION_TITLE_MAX = 120;
const SAVED_TO_LIBRARY_FLASH_MS = 2500;

export interface SessionDrawerSaveState {
  dirty: boolean;
  saving: boolean;
  savedFlash: boolean;
  saveError: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export interface SessionDrawerProps {
  /** Kicker line above the title, e.g. "Jueves · Entreno · Acumulación". */
  kicker: string;
  /** Small state pill next to the kicker ("Plantilla" / "Pendiente"…). */
  statePill: string;
  session: WeekSession | undefined;
  exercises: CatalogExercise[];
  /** Exercise row to open expanded (deep link from a canvas click). */
  initialExpandedItemUid?: string | null;
  saveState: SessionDrawerSaveState;
  onClose: () => void;
  /** Session title (stored as session.focus). */
  onChangeTitle: (title: string) => void;
  onChangePart: (part: WeekDayPart) => void;
  onRemovePart: (partUid: string) => void;
  onDuplicatePart: (partUid: string) => void;
  /** Biblioteca Pablo → reemplaza el uso por una copia propia editable. */
  onDuplicateAsOwn: (partUid: string) => void;
  onAddExercise: (partUid: string, exercise: CatalogExercise) => void;
  /** "+ Añadir bloque" — the three sources of the unified verb. */
  onAddBlockLibrary: () => void;
  onAddBlockPabloIA: () => void;
  onAddBlockCustom: (presetId: string) => void;
  /**
   * Modo solo-lectura (biblioteca de Pablo en /programar): título estático,
   * sin "+ Añadir bloque" ni footer de guardado. Los bloques de biblioteca ya
   * son read-only por origen; este flag cubre la sesión entera.
   */
  read_only?: boolean;
  /**
   * Solo los BLOQUES en lectura, título editable (calendario del atleta: la
   * asignación referencia una plantilla COMPARTIDA — editar sus bloques
   * mutaría el plan de otros atletas; lo que persiste por-asignación es el
   * título + notas del coach). Oculta "+ Añadir bloque" y "Guardar bloque en
   * biblioteca"; mantiene el footer de autosave.
   */
  blocks_read_only?: boolean;
  /** Nodo extra bajo el header (p.ej. la barra de tags del entreno propio). */
  header_extra?: React.ReactNode;
  /** Nodo extra al inicio del scroll, antes de los bloques (p.ej. datos reales del atleta). */
  before_blocks?: React.ReactNode;
  className?: string;
}

export function SessionDrawer({
  kicker,
  statePill,
  session,
  exercises,
  initialExpandedItemUid = null,
  saveState,
  onClose,
  onChangeTitle,
  onChangePart,
  onRemovePart,
  onDuplicatePart,
  onDuplicateAsOwn,
  onAddExercise,
  onAddBlockLibrary,
  onAddBlockPabloIA,
  onAddBlockCustom,
  read_only = false,
  blocks_read_only = false,
  header_extra,
  before_blocks,
  className,
}: SessionDrawerProps) {
  const blocks = session?.blocks ?? [];
  const [expandedItemUid, setExpandedItemUid] = useState<string | null>(
    initialExpandedItemUid,
  );

  // Follow deep-link changes (the coach clicks another exercise in the canvas
  // while the drawer is already open). State-from-prop sync is intentional.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (initialExpandedItemUid) setExpandedItemUid(initialExpandedItemUid);
  }, [initialExpandedItemUid]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <aside
      role="complementary"
      aria-label={`Sesión — ${session?.focus || kicker}`}
      className={cn(
        'flex h-full min-w-0 flex-col border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)]',
        className,
      )}
    >
      {/* Header */}
      <header className="flex items-start gap-3 border-b border-[color:var(--border-subtle)] px-5 pb-4 pt-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="micro-label truncate tracking-[0.12em]">{kicker}</span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--r-pill)] bg-[color:var(--surface-container-high)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-[color:var(--tertiary)]"
              />
              {statePill}
            </span>
          </div>
          {read_only ? (
            <h2 className="font-display text-[22px] font-extrabold uppercase italic leading-tight text-[color:var(--fg)]">
              {session?.focus || 'Sesión'}
            </h2>
          ) : (
            <input
              type="text"
              value={session?.focus ?? ''}
              maxLength={SESSION_TITLE_MAX}
              placeholder="Título de la sesión"
              aria-label="Título de la sesión"
              onChange={(e) => onChangeTitle(e.target.value)}
              className="focus-ring -mx-1 rounded-[var(--r-s)] border border-transparent bg-transparent px-1 py-0.5 font-display text-[22px] font-extrabold uppercase italic leading-tight text-[color:var(--fg)] outline-none transition-colors placeholder:normal-case placeholder:text-[color:var(--text-muted)] hover:border-[color:var(--border-subtle)] focus:border-[color:var(--accent)]"
            />
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel de sesión"
          title="Cerrar"
          className="focus-ring shrink-0 rounded-[var(--r-s)] p-2 text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]"
        >
          <MIcon name="close" size={18} aria-hidden />
        </button>
      </header>

      {header_extra}

      {/* Bloques */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {before_blocks}

        {blocks.length === 0 ? (
          <p className="rounded-[var(--r-l)] border border-dashed border-[color:var(--border-subtle)] p-4 text-center text-xs text-[color:var(--text-muted)]">
            {blocks_read_only || read_only
              ? 'Sesión sin bloques.'
              : 'Sesión vacía. Añade el primer bloque.'}
          </p>
        ) : (
          blocks.map((part) => (
            <DrawerBlockCard
              key={part.uid}
              part={part}
              exercises={exercises}
              readOnly={blocks_read_only}
              expandedItemUid={expandedItemUid}
              onExpandItem={setExpandedItemUid}
              onChangePart={onChangePart}
              onRemovePart={() => onRemovePart(part.uid)}
              onDuplicatePart={() => onDuplicatePart(part.uid)}
              onDuplicateAsOwn={() => onDuplicateAsOwn(part.uid)}
              onAddExercise={(exercise) => onAddExercise(part.uid, exercise)}
            />
          ))
        )}

        {!read_only && !blocks_read_only ? (
          <AddBlockMenu
            onLibrary={onAddBlockLibrary}
            onPabloIA={onAddBlockPabloIA}
            onCustom={onAddBlockCustom}
          />
        ) : null}
      </div>

      {/* Footer: autosave + historial + guardar en biblioteca */}
      {!read_only ? (
        <footer className="flex items-center justify-between gap-3 border-t border-[color:var(--border-subtle)] px-5 py-2.5">
          <SaveStatus saveState={saveState} />
          {!blocks_read_only ? <SaveToLibraryButton blocks={blocks} /> : null}
        </footer>
      ) : null}
    </aside>
  );
}

// ── Autosave status + undo/redo (reuses the studio's save machinery) ────────
function SaveStatus({ saveState }: { saveState: SessionDrawerSaveState }) {
  const { dirty, saving, savedFlash, saveError, canUndo, canRedo, onUndo, onRedo } = saveState;

  let icon = 'cloud_done';
  let label = 'Guardado';
  let tone = 'text-[color:var(--ok)]';
  if (saveError) {
    icon = 'cloud_off';
    label = 'No se pudo guardar — se reintenta solo';
    tone = 'text-[color:var(--danger)]';
  } else if (saving) {
    icon = 'cloud_upload';
    label = 'Guardando…';
    tone = 'text-[color:var(--text-muted)]';
  } else if (dirty) {
    icon = 'cloud_upload';
    label = 'Cambios sin guardar';
    tone = 'text-[color:var(--text-muted)]';
  } else if (savedFlash) {
    label = 'Guardado ahora';
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        role="status"
        className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold', tone)}
      >
        <MIcon name={icon} size={15} aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <div role="group" aria-label="Historial de cambios" className="flex items-center">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Deshacer"
          title="Deshacer (Cmd+Z)"
          className="focus-ring rounded-[var(--r-s)] p-1 text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)] disabled:opacity-35"
        >
          <MIcon name="undo" size={17} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Rehacer"
          title="Rehacer (Cmd+Shift+Z)"
          className="focus-ring rounded-[var(--r-s)] p-1 text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)] disabled:opacity-35"
        >
          <MIcon name="redo" size={17} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ── Guardar bloque en biblioteca (solo bloques propios con ejercicios) ──────
type SaveLibState =
  | { phase: 'idle' }
  | { phase: 'picking' }
  | { phase: 'saving' }
  | { phase: 'saved' }
  | { phase: 'error'; message: string };

function SaveToLibraryButton({ blocks }: { blocks: WeekDayPart[] }) {
  const [state, setState] = useState<SaveLibState>({ phase: 'idle' });
  const rootRef = useRef<HTMLDivElement>(null);
  const ownBlocks = blocks.filter((p) => blockOrigin(p) === 'custom' && p.items.length > 0);

  useEffect(() => {
    if (state.phase !== 'picking') return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setState({ phase: 'idle' });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState({ phase: 'idle' });
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [state.phase]);

  if (ownBlocks.length === 0) return null;

  const save = async (part: WeekDayPart) => {
    setState({ phase: 'saving' });
    const result = await saveBlockToLibrary(part);
    if (result.ok) {
      setState({ phase: 'saved' });
      window.setTimeout(() => setState({ phase: 'idle' }), SAVED_TO_LIBRARY_FLASH_MS);
    } else {
      setState({ phase: 'error', message: result.message ?? 'No se pudo guardar' });
    }
  };

  const onClick = () => {
    if (state.phase === 'saving') return;
    if (ownBlocks.length === 1) void save(ownBlocks[0]!);
    else setState({ phase: 'picking' });
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={onClick}
        disabled={state.phase === 'saving'}
        aria-haspopup={ownBlocks.length > 1 ? 'menu' : undefined}
        aria-expanded={ownBlocks.length > 1 ? state.phase === 'picking' : undefined}
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-3 text-xs font-semibold text-[color:var(--fg)] transition-colors hover:border-[color:var(--accent)]/40 disabled:opacity-60"
      >
        <MIcon
          name={state.phase === 'saved' ? 'check' : 'bookmark_add'}
          size={15}
          aria-hidden
          className={state.phase === 'saved' ? 'text-[color:var(--ok)]' : undefined}
        />
        {state.phase === 'saving'
          ? 'Guardando…'
          : state.phase === 'saved'
            ? 'Guardado en biblioteca'
            : 'Guardar bloque en biblioteca'}
      </button>
      {state.phase === 'error' ? (
        <p role="alert" className="absolute bottom-full right-0 mb-1 w-56 rounded-[var(--r-s)] border border-[color:var(--danger)]/40 bg-[color:var(--surface-container-highest)] px-2 py-1.5 text-[11px] text-[color:var(--danger)] shadow-lg">
          {state.message} —{' '}
          <button
            type="button"
            onClick={onClick}
            className="focus-ring font-semibold underline"
          >
            reintentar
          </button>
        </p>
      ) : null}
      {state.phase === 'picking' ? (
        <div
          role="menu"
          aria-label="Elegir bloque para guardar"
          className="absolute bottom-full right-0 z-20 mb-1 w-60 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-highest)] p-1 shadow-lg"
        >
          <p className="micro-label px-2 pb-1 pt-1.5">¿Qué bloque guardar?</p>
          {ownBlocks.map((p) => (
            <button
              key={p.uid}
              type="button"
              role="menuitem"
              onClick={() => void save(p)}
              className="focus-ring flex w-full items-center gap-2 rounded-[var(--r-s)] px-2 py-1.5 text-left text-xs font-semibold text-[color:var(--fg)] hover:bg-[color:var(--surface-elevated)]"
            >
              <MIcon name="bookmark_add" size={14} aria-hidden />
              <span className="min-w-0 truncate">{p.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
