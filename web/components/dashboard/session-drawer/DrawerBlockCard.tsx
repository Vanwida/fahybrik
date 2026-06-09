'use client';

// DrawerBlockCard — one block of the session inside the SessionDrawer (UX
// redesign §2b). Origin drives the editing contract:
//   - "Biblioteca Pablo" (source_block_id): the prescription is a READ-ONLY
//     reference + "Duplicar como propio" to edit.
//   - "Propio": title editable, exercise rows expand into the inline editor,
//     "+ Añadir ejercicio" at the bottom.

import { useEffect, useRef, useState } from 'react';
import type { WeekDayPart, WeekDayPartItem } from '@fahybrid/shared/schema/program-templates';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import { blockOrigin } from '@/lib/dashboard/programming/block-origin';
import { blockPrescription } from '@/lib/dashboard/programming/block-panel';
import { groupColorFor } from '@/lib/dashboard/programming/group-colors';
import { MIcon } from '@/components/dashboard/MIcon';
import { ExercisePicker } from '@/components/dashboard/programming/studio/ExercisePicker';
import { DrawerExerciseRow } from './DrawerExerciseRow';

const BLOCK_TITLE_MAX = 120;

export function DrawerBlockCard({
  part,
  exercises,
  readOnly = false,
  expandedItemUid,
  onExpandItem,
  onChangePart,
  onRemovePart,
  onDuplicatePart,
  onDuplicateAsOwn,
  onAddExercise,
}: {
  part: WeekDayPart;
  exercises: CatalogExercise[];
  /**
   * Whole block read-only regardless of origin (athlete calendar: the block
   * belongs to a SHARED template). Static title, no options menu, no
   * add-exercise, rows render as natural-language lines.
   */
  readOnly?: boolean;
  /** uid of the exercise row currently expanded in the drawer (one at a time). */
  expandedItemUid: string | null;
  onExpandItem: (itemUid: string | null) => void;
  onChangePart: (part: WeekDayPart) => void;
  onRemovePart: () => void;
  onDuplicatePart: () => void;
  /** Biblioteca Pablo → reemplaza este uso por una copia propia editable. */
  onDuplicateAsOwn: () => void;
  onAddExercise: (exercise: CatalogExercise) => void;
}) {
  const isLibrary = blockOrigin(part) === 'library';
  const group = groupColorFor(part.methodology_group_id);
  const verbatim = isLibrary ? blockPrescription(part) : '';

  const updateItem = (next: WeekDayPartItem) =>
    onChangePart({
      ...part,
      items: part.items.map((i) => (i.uid === next.uid ? next : i)),
    });

  const removeItem = (uid: string) => {
    onChangePart({ ...part, items: part.items.filter((i) => i.uid !== uid) });
    if (expandedItemUid === uid) onExpandItem(null);
  };

  return (
    <section
      aria-label={`Bloque ${part.title}${isLibrary ? ' — biblioteca de Pablo' : ' — propio'}`}
      className="overflow-hidden rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_1px_2px_rgba(0,0,0,0.4)]"
    >
      {/* Cabecera: barra de grupo + título + origen + opciones */}
      <div className="relative flex items-center gap-3 border-b border-[color:var(--border-subtle)] py-2.5 pl-4 pr-3">
        <span
          aria-hidden
          className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-[2px]"
          style={{ backgroundColor: group.color }}
        />
        {isLibrary || readOnly ? (
          <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-[color:var(--fg)]">
            {part.title}
          </h3>
        ) : (
          <input
            type="text"
            value={part.title}
            maxLength={BLOCK_TITLE_MAX}
            aria-label="Título del bloque"
            onChange={(e) => onChangePart({ ...part, title: e.target.value })}
            className="focus-ring min-w-0 flex-1 rounded-[var(--r-s)] border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-[color:var(--fg)] outline-none transition-colors hover:border-[color:var(--border-subtle)] focus:border-[color:var(--accent)]"
          />
        )}
        <div className="flex shrink-0 items-center gap-2">
          {isLibrary ? (
            <span className="inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-[color:var(--accent)]/45 bg-[color:var(--accent)]/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
              <MIcon name="verified" size={11} aria-hidden />
              Biblioteca Pablo
            </span>
          ) : !readOnly ? (
            <span className="inline-flex items-center rounded-[var(--r-pill)] bg-[color:var(--surface-container-high)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--fg)]">
              Propio
            </span>
          ) : null}
          {!readOnly ? (
            <BlockOptionsMenu
              blockTitle={part.title}
              onDuplicate={onDuplicatePart}
              onRemove={onRemovePart}
            />
          ) : null}
        </div>
      </div>

      {/* Biblioteca: referencia read-only + duplicar como propio */}
      {isLibrary && !readOnly ? (
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-4 py-1.5">
          <p className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]">
            <MIcon name="lock" size={13} aria-hidden className="shrink-0" />
            <span className="truncate">Prescripción original de Pablo — solo lectura</span>
          </p>
          <button
            type="button"
            onClick={onDuplicateAsOwn}
            className="focus-ring shrink-0 rounded-[var(--r-s)] text-[11px] font-semibold text-[color:var(--accent)] transition-colors hover:text-[color:var(--accent-press)] hover:underline"
          >
            Duplicar como propio
          </button>
        </div>
      ) : null}

      {/* Ejercicios */}
      {part.items.length > 0 ? (
        part.items.map((item) => (
          <DrawerExerciseRow
            key={item.uid}
            item={item}
            readOnly={isLibrary || readOnly}
            expanded={expandedItemUid === item.uid}
            onToggle={(open) => onExpandItem(open ? item.uid : null)}
            onChange={updateItem}
            onRemove={() => removeItem(item.uid)}
          />
        ))
      ) : isLibrary && verbatim ? (
        <p className="whitespace-pre-wrap px-4 py-3 text-xs leading-relaxed text-[color:var(--text-muted)]">
          {verbatim}
        </p>
      ) : !isLibrary ? (
        <p className="px-4 py-3 text-xs text-[color:var(--text-muted)]">
          {readOnly ? 'Sin ejercicios en este bloque.' : 'Aún no hay ejercicios en este bloque.'}
        </p>
      ) : null}

      {/* Añadir ejercicio (solo bloques propios) */}
      {!isLibrary && !readOnly ? (
        <div className="border-t border-[color:var(--border-subtle)] p-2">
          <ExercisePicker
            exercises={exercises}
            onSelect={onAddExercise}
            triggerLabel="Añadir ejercicio"
          />
        </div>
      ) : null}
    </section>
  );
}

// ── Opciones del bloque (⋯): duplicar · quitar ───────────────────────────────
function BlockOptionsMenu({
  blockTitle,
  onDuplicate,
  onRemove,
}: {
  blockTitle: string;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Opciones del bloque ${blockTitle}`}
        title="Opciones del bloque"
        className="focus-ring rounded-[var(--r-s)] p-1 text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]"
      >
        <MIcon name="more_horiz" size={17} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={`Opciones del bloque ${blockTitle}`}
          className="absolute right-0 top-full z-20 mt-1 w-44 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-highest)] p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onDuplicate();
              setOpen(false);
            }}
            className="focus-ring flex w-full items-center gap-2 rounded-[var(--r-s)] px-2 py-1.5 text-left text-xs font-semibold text-[color:var(--fg)] hover:bg-[color:var(--surface-elevated)]"
          >
            <MIcon name="content_copy" size={14} aria-hidden />
            Duplicar bloque
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onRemove();
              setOpen(false);
            }}
            className="focus-ring flex w-full items-center gap-2 rounded-[var(--r-s)] px-2 py-1.5 text-left text-xs font-semibold text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
          >
            <MIcon name="delete" size={14} aria-hidden />
            Quitar bloque
          </button>
        </div>
      ) : null}
    </div>
  );
}
