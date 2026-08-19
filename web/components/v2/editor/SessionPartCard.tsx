'use client';

// SessionPartCard — la sesión (AM/PM) del editor de día, rediseñada (microciclos
// fase 1): adiós a las cajas dentro de cajas. Cada bloque es una SECCIÓN plana
// con lomo de color de modalidad, título editable en v2-display MAYÚSCULAS, tag
// de formato en el color de la modalidad y herramientas al hover (quitar). Las
// filas y la dosis común viven en BlockItemTable. El reorden de bloques sigue
// siendo dnd-kit (puntero + teclado); «＋ Bloque» y «Desde la biblioteca» bajan
// al pie de la sesión. La cabecera: chip de slot + título del entreno (display)
// + Sugerir título + Redactar con IA, y debajo la NOTA del entreno — lo que el
// coach le dice al atleta sobre él y que este lee en el brief previo del móvil.

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
import { SESSION_NOTES_MAX } from '@fahybrid/shared/schema/program-templates';
import { MODALITY_META } from '@/components/v2/constants';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { NoteField } from './fields';
import { BlockItemTable } from './BlockItemTable';
import { ArchetypeGrid } from './ArchetypePicker';
import { OptionalBadge } from './compositor-chrome';
import { blockMinutes, blockModalitySlug, blockTypeLabel } from './block-helpers';

const SLOT_LABEL: Record<EditorSession['slot'], string> = {
  am: 'AM',
  pm: 'PM',
  extra: 'Extra',
};

export function SessionPartCard({
  session,
  onChangeFocus,
  onChangeNote,
  onSuggestNote,
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
  onToggleOptional,
  onRemoveSession,
}: {
  session: EditorSession;
  onChangeFocus: (focus: string) => void;
  /** Escribe la NOTA del entreno — lo que el atleta lee antes de empezarlo. */
  onChangeNote: (notes: string) => void;
  /** Pide borradores de esa nota a partir del contenido de la sesión (opcional). */
  onSuggestNote?: () => Promise<string[]>;
  onSuggestTitle: () => void;
  suggesting: boolean;
  /** Abre «Redactar con IA» para esta sesión (#33) — borradores que el coach inserta. */
  onSuggestWorkout: () => void;
  /** Abre la Biblioteca de bloques para esta sesión — copia un bloque ya hecho. */
  onInsertFromLibrary: () => void;
  /** Añade un bloque nuevo del TIPO elegido (agnóstico — sin sección impuesta). */
  onAddBlock: (archetype: ArchetypeId) => void;
  /** Renombra un bloque en línea (la etiqueta del coach — la lee el atleta). */
  onRenameBlock: (blockUid: string, title: string) => void;
  /** Persiste el nuevo orden tras un arrastre (o reorden por teclado). */
  onReorderBlocks: (orderedUids: string[]) => void;
  onEditItem: (blockUid: string, itemUid: string) => void;
  onAddItem: (blockUid: string) => void;
  onRemoveBlock: (blockUid: string) => void;
  onMoveItem: (blockUid: string, itemUid: string, dir: -1 | 1) => void;
  /** Alterna «el bloque es un extra que el atleta puede saltarse» (fase 2). */
  onToggleOptional: (blockUid: string) => void;
  /** Quita ESTA sesión del día. El guardado + resync la quitan del atleta. */
  onRemoveSession: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const totalMin = session.blocks.reduce((acc, b) => acc + (blockMinutes(b) ?? 0), 0);
  const hasBlocks = session.blocks.length > 0;

  // dnd-kit: arrastre de puntero (con distancia de activación para que un click
  // en el asa no dispare un arrastre fantasma) + arrastre por teclado (accesible).
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
    <section className="overflow-hidden rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-card)]">
      {/* Cabecera de la sesión: el TÍTULO del entreno y, debajo, lo que el coach
          le dice al atleta sobre él. La nota va subordinada al título (el título
          es el sujeto) pero SIEMPRE visible — el coach edita desde el móvil. */}
      <header className="space-y-2 border-b border-[color:var(--v2-border)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent-soft)] px-2.5 py-1 text-label font-bold uppercase tracking-wide text-[color:var(--v2-accent-text)]">
            {SLOT_LABEL[session.slot]}
            {session.time_hint ? ` · ${session.time_hint}` : ''}
          </span>
          <label className="sr-only" htmlFor={`focus-${session.uid}`}>
            Título del entreno
          </label>
          <input
            id={`focus-${session.uid}`}
            type="text"
            value={session.focus ?? ''}
            maxLength={120}
            onChange={(e) => onChangeFocus(e.target.value)}
            placeholder="Título del entreno"
            className="v2-display v2-focus min-w-0 flex-1 rounded-[var(--v2-r-s)] border border-transparent bg-transparent px-2 py-1 text-lg text-[color:var(--v2-fg)] transition-colors placeholder:text-[color:var(--v2-faint)] hover:border-[color:var(--v2-border)] focus:border-[color:var(--v2-accent)]"
          />
          <div className="flex shrink-0 items-center gap-1.5">
            {hasBlocks ? (
              <button
                type="button"
                onClick={onSuggestTitle}
                disabled={suggesting}
                title="Sugerir un título a partir del contenido del entreno"
                className="v2-focus inline-flex h-[30px] items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-2.5 text-xs font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-fg)] hover:text-[color:var(--v2-fg)] disabled:opacity-60"
              >
                <MIcon name={suggesting ? 'progress_activity' : 'lightbulb'} size={15} />
                <span className="hidden sm:inline">
                  {suggesting ? 'Sugiriendo…' : 'Título'}
                </span>
              </button>
            ) : null}
            {/* Redactar con IA (#33) — borradores para ESTA sesión (correcto en AM+PM). */}
            <button
              type="button"
              onClick={onSuggestWorkout}
              title="Coach IA redacta los bloques de esta sesión a partir de un foco"
              className="v2-focus inline-flex h-[30px] items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-accent)]/45 bg-[color:var(--v2-accent-soft)] px-2.5 text-xs font-bold text-[color:var(--v2-accent-text)] transition-colors hover:bg-[color:var(--v2-accent)]/15"
            >
              <MIcon name="draw" size={15} />
              <span className="hidden sm:inline">Redactar</span>
            </button>
            <button
              type="button"
              onClick={onRemoveSession}
              aria-label="Borrar este entreno del día"
              title="Borrar este entreno del día"
              className="v2-focus inline-flex h-[30px] items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-2.5 text-xs font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)]"
            >
              <MIcon name="delete" size={15} />
              <span className="hidden sm:inline">Borrar</span>
            </button>
            <span className="v2-num text-label text-[color:var(--v2-faint)]">
              {session.blocks.length} {session.blocks.length === 1 ? 'bloque' : 'bloques'}
              {totalMin > 0 ? ` · ~${totalMin} min` : ''}
            </span>
          </div>
        </div>

        <NoteField
          id={`session-note-${session.uid}`}
          label="Nota para el atleta"
          hint="La lee en el móvil justo antes de empezar este entreno."
          value={session.notes ?? ''}
          placeholder="Hoy vamos a por el ritmo. No te pases en la primera serie."
          maxLength={SESSION_NOTES_MAX}
          onChange={onChangeNote}
          onSuggest={onSuggestNote}
        />
      </header>

      {/* Bloques — secciones planas reordenables, separadas por hairlines. */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
          <div>
            {session.blocks.map((block) => (
              <SortableBlockCard
                key={block.uid}
                block={block}
                onRename={(title) => onRenameBlock(block.uid, title)}
                onEditItem={(itemUid) => onEditItem(block.uid, itemUid)}
                onAddItem={() => onAddItem(block.uid)}
                onRemove={() => onRemoveBlock(block.uid)}
                onMoveItem={(itemUid, dir) => onMoveItem(block.uid, itemUid, dir)}
                onToggleOptional={() => onToggleOptional(block.uid)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Pie de sesión: las dos formas de añadir un bloque (desde cero o copiando
          uno de la biblioteca) + el recordatorio del reorden. */}
      <div className="border-t border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-4 py-2.5">
        {pickerOpen ? (
          <InlineBlockPicker
            onPick={(id) => {
              onAddBlock(id);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
            >
              <MIcon name="add" size={15} />
              Bloque
            </button>
            <button
              type="button"
              onClick={onInsertFromLibrary}
              title="Copia un bloque de tu biblioteca en esta sesión"
              className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface)] hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="inventory_2" size={15} />
              Desde la biblioteca
            </button>
            {hasBlocks ? (
              <span className="v2-micro ml-auto hidden sm:inline">
                arrastra ⠿ para reordenar
              </span>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

// Un bloque de la lista plana — sección arrastrable con lomo de modalidad, asa,
// NOMBRE editable en display, tag de formato y quitar al hover.
function SortableBlockCard({
  block,
  onRename,
  onEditItem,
  onAddItem,
  onRemove,
  onMoveItem,
  onToggleOptional,
}: {
  block: EditorBlock;
  onRename: (title: string) => void;
  onEditItem: (itemUid: string) => void;
  onAddItem: () => void;
  onRemove: () => void;
  onMoveItem: (itemUid: string, dir: -1 | 1) => void;
  onToggleOptional: () => void;
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
  const meta = MODALITY_META[slug];
  const typeLabel = blockTypeLabel(block);
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative border-b border-[color:var(--v2-border)] py-3 pl-6 pr-3 last:border-b-0',
        isDragging &&
          'z-10 rounded-[var(--v2-r-m)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]',
      )}
    >
      {/* El lomo: la modalidad del bloque, siempre acompañada del tag en texto. */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-4 left-2.5 top-4 w-[3px] rounded-[var(--v2-r-pill)]"
        style={{ background: `var(${meta.colorVar})` }}
      />
      <div className="mb-1.5 flex items-center gap-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reordenar bloque${block.title ? ` ${block.title}` : ''}`}
          className="v2-focus shrink-0 cursor-grab touch-none rounded-full p-0.5 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-muted)] active:cursor-grabbing"
        >
          <MIcon name="drag_indicator" size={18} />
        </button>
        {/* «Opcional» (fase 2): siempre visible cuando ya lo es (es un estado,
            no una herramienta); si no lo es, se comporta como «Quitar» — solo
            al hover/foco, para no meter ruido en cada bloque de la lista. */}
        <span
          className={cn(
            !block.optional &&
              'opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100',
          )}
        >
          <OptionalBadge optional={block.optional ?? false} onToggle={onToggleOptional} />
        </span>
        <input
          type="text"
          value={block.title}
          maxLength={80}
          onChange={(e) => onRename(e.target.value)}
          aria-label="Nombre del bloque"
          placeholder="Nombre del bloque"
          className="v2-display v2-focus min-w-0 flex-1 rounded-[var(--v2-r-s)] border border-transparent bg-transparent px-1.5 py-0.5 text-base uppercase text-[color:var(--v2-fg)] transition-colors placeholder:normal-case placeholder:text-[color:var(--v2-faint)] hover:border-[color:var(--v2-border)] focus:border-[color:var(--v2-accent)] focus:bg-[color:var(--v2-surface)]"
        />
        {typeLabel ? (
          <span
            className="shrink-0 rounded-[var(--v2-r-2xs)] px-2 py-0.5 text-eyebrow font-bold uppercase tracking-wide"
            style={{ background: `var(${meta.softVar})`, color: `var(${meta.colorVar})` }}
          >
            {typeLabel}
          </span>
        ) : null}
        {/* Herramientas del bloque — al hover (y siempre con el teclado). */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar bloque${block.title ? ` ${block.title}` : ''}`}
          className="v2-focus shrink-0 rounded-full p-1 text-[color:var(--v2-muted)] opacity-0 transition-all focus-visible:opacity-100 group-hover:opacity-100 hover:text-[color:var(--v2-danger)]"
        >
          <MIcon name="close" size={16} />
        </button>
      </div>

      {/* PROCEDENCIA. Insertar desde la Biblioteca COPIA la estructura: esto dice
          de dónde salió, no promete que se actualice sola. Si el bloque de origen
          ya no existe, el loader deja el título en null y aquí no se pinta nada. */}
      {block.source_block_title ? (
        <p className="flex items-center gap-1 pb-1.5 pl-1 text-label text-[color:var(--v2-faint)]">
          <MIcon name="library_books" size={13} aria-hidden />
          Desde tu bloque «{block.source_block_title}»
        </p>
      ) : null}

      <BlockItemTable
        block={block}
        onEditItem={onEditItem}
        onAddItem={onAddItem}
        onMoveItem={onMoveItem}
      />
    </article>
  );
}

// El panel inline «Añadir bloque» — las 9 tarjetas de TIPO (ArchetypeGrid
// reutilizada), sin modal. Elegir un tipo crea un bloque listo; el coach lo nombra.
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
          <span className="text-body font-bold text-[color:var(--v2-fg)]">Añadir bloque</span>
          <span className="text-label text-[color:var(--v2-muted)]">
            elige el tipo de trabajo · el nombre lo pones tú
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el selector de tipo"
          className="v2-focus shrink-0 rounded-full p-1 text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="close" size={16} />
        </button>
      </div>
      <ArchetypeGrid onPick={onPick} />
    </div>
  );
}
