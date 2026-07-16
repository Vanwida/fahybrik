'use client';

// SessionPartCard — SCREEN 8 session card (AM / PM) of the AGNOSTIC day editor.
// A session is a FLAT list of blocks the coach NAMES and ORDERS — no imposed
// Calentamiento/Principal/Vuelta sections. Each block: a drag handle (reorder,
// dnd-kit — pointer + keyboard), an INLINE editable NAME, a TYPE chip (the sport
// archetype: Fuerza/WOD/Series…), a delete, and the type-specific item table
// (BlockItemTable, reused). "＋ Añadir bloque" expands an INLINE type picker at the
// end of the session (no modal, no dimmed scrim). Session header: AM/PM slot +
// the athlete-facing TÍTULO + "Sugerir título" + "Redactar con IA".

import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EditorBlock, EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { ArchetypeId } from '@/lib/dashboard/v2/archetypes';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { BlockItemTable } from './BlockItemTable';
import { ArchetypeGrid } from './ArchetypePicker';
import { blockMinutes, blockModalitySlug, blockTypeLabel } from './block-helpers';

const SLOT_LABEL: Record<EditorSession['slot'], string> = {
  am: 'AM',
  pm: 'PM',
  extra: 'Extra',
};

export function SessionPartCard({
  session,
  onChangeFocus,
  onSuggestTitle,
  suggesting,
  onSuggestWorkout,
  onInsertFromLibrary,
  onAddBlock,
  onRenameBlock,
  onReorderBlocks,
  onEditItem,
  onAddItem,
  onRemoveBlock,
  onMoveItem,
}: {
  session: EditorSession;
  onChangeFocus: (focus: string) => void;
  onSuggestTitle: () => void;
  suggesting: boolean;
  /** Open "Redactar con IA" for this session (#33) — drafts blocks the coach inserts. */
  onSuggestWorkout: () => void;
  /** Abre la Biblioteca de bloques para esta sesión — copia un bloque ya hecho. */
  onInsertFromLibrary: () => void;
  /** Add a fresh block of the chosen TYPE (agnostic — no section). */
  onAddBlock: (archetype: ArchetypeId) => void;
  /** Rename a block inline (the coach's label — the athlete reads it). */
  onRenameBlock: (blockUid: string, title: string) => void;
  /** Persist a new block order after a drag (or keyboard reorder). */
  onReorderBlocks: (orderedUids: string[]) => void;
  onEditItem: (blockUid: string, itemUid: string) => void;
  onAddItem: (blockUid: string) => void;
  onRemoveBlock: (blockUid: string) => void;
  onMoveItem: (blockUid: string, itemUid: string, dir: -1 | 1) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const totalMin = session.blocks.reduce((acc, b) => acc + (blockMinutes(b) ?? 0), 0);
  const hasBlocks = session.blocks.length > 0;

  // dnd-kit: pointer drag (with a small activation distance so a click on the
  // handle doesn't start a phantom drag) + keyboard drag (accessible reorder).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const blockIds = session.blocks.map((b) => b.uid);
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = blockIds.indexOf(String(active.id));
    const to = blockIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorderBlocks(arrayMove(blockIds, from, to));
  };

  return (
    <section className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-card)]">
      {/* Session header */}
      <header className="flex flex-col gap-2.5 border-b border-[color:var(--v2-border)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--v2-accent)]">
            {SLOT_LABEL[session.slot]}
            {session.time_hint ? ` · ${session.time_hint}` : ''}
          </span>
          <span className="v2-num text-xs text-[color:var(--v2-muted)]">
            {session.blocks.length} {session.blocks.length === 1 ? 'bloque' : 'bloques'}
            {totalMin > 0 ? ` · ~${totalMin} min` : ''}
          </span>
        </div>

        {/* Título del entreno — one input the coach AND athlete read at a glance
            (persists to session.focus). "Sugerir título" derives it from the
            session's content (LLM when configured, honest fallback otherwise). */}
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`focus-${session.uid}`}>
            Título del entreno
          </label>
          <input
            id={`focus-${session.uid}`}
            type="text"
            value={session.focus ?? ''}
            maxLength={120}
            onChange={(e) => onChangeFocus(e.target.value)}
            placeholder="Título del entreno · ej: Entreno de pierna"
            className="v2-focus min-w-0 flex-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-1.5 text-sm font-semibold text-[color:var(--v2-fg)] placeholder:font-normal placeholder:text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-border-strong)]"
          />
          {hasBlocks ? (
            <button
              type="button"
              onClick={onSuggestTitle}
              disabled={suggesting}
              title="Sugerir un título a partir del contenido del entreno"
              className="v2-focus inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 text-[13px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:opacity-60"
            >
              <MIcon name={suggesting ? 'progress_activity' : 'lightbulb'} size={16} />
              <span className="hidden sm:inline">{suggesting ? 'Sugiriendo…' : 'Sugerir título'}</span>
            </button>
          ) : null}
          {/* Redactar con IA (#33) — drafts this session's blocks; always available,
              most useful on an empty session. Per-session (the AI targets THIS
              session's blocks, correct for AM+PM days). */}
          <button
            type="button"
            onClick={onSuggestWorkout}
            title="Coach IA redacta los bloques de esta sesión a partir de un foco"
            className="v2-focus inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-accent)]/45 bg-[color:var(--v2-accent-soft)] px-2.5 text-[13px] font-semibold text-[color:var(--v2-accent)] transition-colors hover:bg-[color:var(--v2-accent)]/15"
          >
            <MIcon name="draw" size={16} />
            <span className="hidden sm:inline">Redactar con IA</span>
          </button>
        </div>
      </header>

      {/* Blocks — a flat, reorderable list. No section headings. */}
      <div className="space-y-3 p-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {session.blocks.map((block) => (
                <SortableBlockCard
                  key={block.uid}
                  block={block}
                  onRename={(title) => onRenameBlock(block.uid, title)}
                  onEditItem={(itemUid) => onEditItem(block.uid, itemUid)}
                  onAddItem={() => onAddItem(block.uid)}
                  onRemove={() => onRemoveBlock(block.uid)}
                  onMoveItem={(itemUid, dir) => onMoveItem(block.uid, itemUid, dir)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Las dos formas de añadir un bloque, juntas porque son la misma decisión:
            desde CERO (picker de tipo inline — sin modal, sin scrim) o COPIANDO uno
            ya hecho de la biblioteca del coach. */}
        {pickerOpen ? (
          <InlineBlockPicker
            onPick={(id) => {
              onAddBlock(id);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="v2-focus flex flex-1 items-center justify-center gap-1.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] px-3 py-2.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="add" size={16} />
              Añadir bloque
            </button>
            <button
              type="button"
              onClick={onInsertFromLibrary}
              title="Copia un bloque de tu biblioteca en esta sesión"
              className="v2-focus flex shrink-0 items-center justify-center gap-1.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] px-3 py-2.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="inventory_2" size={16} />
              De la biblioteca
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// One block in the flat list — a sortable card with a drag handle, an inline
// editable NAME, its TYPE chip, a delete, and the reused BlockItemTable.
function SortableBlockCard({
  block,
  onRename,
  onEditItem,
  onAddItem,
  onRemove,
  onMoveItem,
}: {
  block: EditorBlock;
  onRename: (title: string) => void;
  onEditItem: (itemUid: string) => void;
  onAddItem: () => void;
  onRemove: () => void;
  onMoveItem: (itemUid: string, dir: -1 | 1) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.uid });
  const slug = blockModalitySlug(block);
  const typeLabel = blockTypeLabel(block);
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] pl-3',
        isDragging && 'z-10 shadow-[var(--v2-shadow-pop)]',
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1.5"
        style={{ background: `var(--v2-mod-${slug})` }}
      />
      {/* Block header band: handle · editable name · type chip · delete */}
      <div className="flex items-center gap-1.5 border-b border-[color:var(--v2-border)] px-2 py-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reordenar bloque${block.title ? ` ${block.title}` : ''}`}
          className="v2-focus shrink-0 cursor-grab touch-none rounded-[var(--v2-r-s)] p-0.5 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-muted)] active:cursor-grabbing"
        >
          <MIcon name="drag_indicator" size={18} />
        </button>
        <input
          type="text"
          value={block.title}
          maxLength={80}
          onChange={(e) => onRename(e.target.value)}
          aria-label="Nombre del bloque"
          placeholder="Nombre del bloque · ej: Calentamiento"
          className="v2-focus min-w-0 flex-1 rounded-[var(--v2-r-s)] border border-transparent bg-transparent px-1.5 py-1 text-sm font-bold text-[color:var(--v2-fg)] placeholder:font-medium placeholder:text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-border)] focus:border-[color:var(--v2-accent)] focus:bg-[color:var(--v2-surface)]"
        />
        {typeLabel ? (
          <span className="shrink-0 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--v2-accent)]">
            {typeLabel}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar bloque${block.title ? ` ${block.title}` : ''}`}
          className="v2-focus shrink-0 rounded-[var(--v2-r-s)] p-1 text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-danger)]"
        >
          <MIcon name="close" size={16} />
        </button>
      </div>

      {/* PROCEDENCIA. Insertar desde la Biblioteca COPIA la estructura: esto dice de
          dónde salió, no promete que se actualice sola. Si el bloque de origen ya no
          existe, el loader deja el título en null y aquí no se pinta nada. */}
      {block.source_block_title ? (
        <p className="flex items-center gap-1 px-2 pt-1.5 text-[11px] text-[color:var(--v2-faint)]">
          <MIcon name="library_books" size={13} aria-hidden />
          Desde tu bloque «{block.source_block_title}»
        </p>
      ) : null}

      <div className="px-2 py-2">
        <BlockItemTable
          block={block}
          onEditItem={onEditItem}
          onAddItem={onAddItem}
          onMoveItem={onMoveItem}
        />
      </div>
    </article>
  );
}

// The inline "Añadir bloque" panel — the 9 sport TYPE cards (reused ArchetypeGrid),
// no modal. Picking a type creates a ready, pre-seeded block; the coach names it.
function InlineBlockPicker({
  onPick,
  onClose,
}: {
  onPick: (id: ArchetypeId) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] p-3.5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-bold text-[color:var(--v2-fg)]">Añadir bloque</span>
          <span className="text-[11px] text-[color:var(--v2-muted)]">
            elige el tipo de trabajo · el nombre lo pones tú
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el selector de tipo"
          className="v2-focus shrink-0 rounded-[var(--v2-r-s)] p-1 text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="close" size={16} />
        </button>
      </div>
      <ArchetypeGrid onPick={onPick} />
    </div>
  );
}
