'use client';

// SessionPartCard — SCREEN 8 session card (AM / PM). Header chip ("AM · 08:00")
// + name + "N bloques · ~min". Each block renders with its modality left-border,
// a drag handle, a type tag, "min · ⋮", and the TYPE-SPECIFIC item table
// (BlockItemTable). Each block has a dashed "＋ añadir ejercicio/movimiento/tramo";
// the block-level add-block picker (dashed) opens the SCREEN 9 modal.

import type { EditorBlock, EditorSession } from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/dashboard/MIcon';
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
  onAddBlock,
  onEditItem,
  onAddItem,
  onRemoveBlock,
}: {
  session: EditorSession;
  onAddBlock: () => void;
  onEditItem: (blockUid: string, itemUid: string) => void;
  onAddItem: (blockUid: string) => void;
  onRemoveBlock: (blockUid: string) => void;
}) {
  const totalMin = session.blocks.reduce((acc, b) => acc + (blockMinutes(b) ?? 0), 0);

  return (
    <section className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-card)]">
      {/* Session header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-[color:var(--v2-border)] px-4 py-3">
        <span className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--v2-accent)]">
          {SLOT_LABEL[session.slot]}
          {session.time_hint ? ` · ${session.time_hint}` : ''}
        </span>
        <span className="v2-num text-xs text-[color:var(--v2-muted)]">
          {session.blocks.length} bloques{totalMin > 0 ? ` · ~${totalMin} min` : ''}
        </span>
      </header>

      {/* Blocks */}
      <div className="space-y-3 p-4">
        {session.blocks.map((block) => (
          <BlockCard
            key={block.uid}
            block={block}
            onEditItem={(itemUid) => onEditItem(block.uid, itemUid)}
            onAddItem={() => onAddItem(block.uid)}
            onRemove={() => onRemoveBlock(block.uid)}
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
  onEditItem,
  onAddItem,
  onRemove,
}: {
  block: EditorBlock;
  onEditItem: (itemUid: string) => void;
  onAddItem: () => void;
  onRemove: () => void;
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
        <span className="shrink-0 cursor-grab text-[color:var(--v2-faint)]" aria-hidden>
          <MIcon name="drag_indicator" size={16} />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-[color:var(--v2-fg)]">
          {block.title}
        </p>
        {block.format ? (
          <span className="shrink-0 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--v2-muted)]">
            {block.format}
          </span>
        ) : null}
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
        <BlockItemTable block={block} onEditItem={onEditItem} onAddItem={onAddItem} />
      </div>
    </article>
  );
}
