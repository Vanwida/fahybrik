'use client';

// SessionPartCard — SCREEN 8 session card (AM / PM). Header chip ("AM · 08:00")
// + "N bloques · ~min". Each block renders with its modality left-border, ↑/↓
// reorder, a type tag, "min", remove, and the TYPE-SPECIFIC item table
// (BlockItemTable). Each block has a dashed "＋ añadir ejercicio/movimiento/tramo";
// the block-level "＋ Añadir bloque" opens the type chooser.

import type { EditorBlock, EditorSession } from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { BlockItemTable } from './BlockItemTable';
import { blockMinutes, blockModalitySlug } from './block-helpers';

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
  onAddBlock,
  onEditItem,
  onAddItem,
  onRemoveBlock,
  onMoveBlock,
  onMoveItem,
}: {
  session: EditorSession;
  onChangeFocus: (focus: string) => void;
  onSuggestTitle: () => void;
  suggesting: boolean;
  /** Open "Redactar con IA" for this session (#33) — drafts blocks the coach inserts. */
  onSuggestWorkout: () => void;
  onAddBlock: () => void;
  onEditItem: (blockUid: string, itemUid: string) => void;
  onAddItem: (blockUid: string) => void;
  onRemoveBlock: (blockUid: string) => void;
  onMoveBlock: (blockUid: string, dir: -1 | 1) => void;
  onMoveItem: (blockUid: string, itemUid: string, dir: -1 | 1) => void;
}) {
  const totalMin = session.blocks.reduce((acc, b) => acc + (blockMinutes(b) ?? 0), 0);
  const hasBlocks = session.blocks.length > 0;

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
            {session.blocks.length} bloques{totalMin > 0 ? ` · ~${totalMin} min` : ''}
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
              most useful on an empty session. */}
          <button
            type="button"
            onClick={onSuggestWorkout}
            title="Pablo IA redacta los bloques de esta sesión a partir de un foco"
            className="v2-focus inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-accent)]/45 bg-[color:var(--v2-accent-soft)] px-2.5 text-[13px] font-semibold text-[color:var(--v2-accent)] transition-colors hover:bg-[color:var(--v2-accent)]/15"
          >
            <MIcon name="draw" size={16} />
            <span className="hidden sm:inline">Redactar con IA</span>
          </button>
        </div>
      </header>

      {/* Blocks */}
      <div className="space-y-3 p-4">
        {session.blocks.map((block, i) => (
          <BlockCard
            key={block.uid}
            block={block}
            index={i}
            count={session.blocks.length}
            onEditItem={(itemUid) => onEditItem(block.uid, itemUid)}
            onAddItem={() => onAddItem(block.uid)}
            onRemove={() => onRemoveBlock(block.uid)}
            onMove={(dir) => onMoveBlock(block.uid, dir)}
            onMoveItem={(itemUid, dir) => onMoveItem(block.uid, itemUid, dir)}
          />
        ))}

        {/* Add-block picker (dashed) → opens SCREEN 9 modal */}
        <button
          type="button"
          onClick={onAddBlock}
          className="v2-focus flex w-full items-center justify-center gap-1.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] px-3 py-2.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="add" size={16} />
          Añadir bloque
        </button>
      </div>
    </section>
  );
}

function BlockCard({
  block,
  index,
  count,
  onEditItem,
  onAddItem,
  onRemove,
  onMove,
  onMoveItem,
}: {
  block: EditorBlock;
  index: number;
  count: number;
  onEditItem: (itemUid: string) => void;
  onAddItem: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onMoveItem: (itemUid: string, dir: -1 | 1) => void;
}) {
  const slug = blockModalitySlug(block);
  const min = blockMinutes(block);

  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] pl-3',
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1.5"
        style={{ background: `var(--v2-mod-${slug})` }}
      />
      {/* Block header band */}
      <div className="flex items-center gap-2 border-b border-[color:var(--v2-border)] px-2 py-2">
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            aria-label={`Subir bloque ${block.title}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="v2-focus -my-0.5 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-30"
          >
            <MIcon name="keyboard_arrow_up" size={16} />
          </button>
          <button
            type="button"
            aria-label={`Bajar bloque ${block.title}`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            className="v2-focus -my-0.5 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-30"
          >
            <MIcon name="keyboard_arrow_down" size={16} />
          </button>
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-[color:var(--v2-fg)]">
          {block.title}
        </p>
        {min ? (
          <span className="v2-num shrink-0 text-[11px] text-[color:var(--v2-muted)]">{min}min</span>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar bloque ${block.title}`}
          className="v2-focus shrink-0 rounded-[var(--v2-r-s)] p-1 text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-danger)]"
        >
          <MIcon name="close" size={15} />
        </button>
      </div>

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
