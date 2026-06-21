'use client';

// SessionStructureRail — the left rail of SCREEN 5 (session editor). Lists the
// session's blocks grouped CALENTAMIENTO / PRINCIPAL / VUELTA. The selected block
// gets an accent left-border + ring; a dashed "+ añadir bloque" sits under each
// group. Block rows carry their modality color left-border so the coach scans the
// session shape at a glance.

import type { EditorBlock, StructureGroup } from '@/lib/dashboard/v2/editor-types';
import { STRUCTURE_GROUP_LABEL, STRUCTURE_GROUP_ORDER } from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';
import { blockModalitySlug, blockSummaryLine } from './block-helpers';

export function SessionStructureRail({
  blocks,
  selectedUid,
  onSelect,
  onAddBlock,
}: {
  blocks: EditorBlock[];
  selectedUid: string | null;
  onSelect: (uid: string) => void;
  onAddBlock: (group: StructureGroup) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {STRUCTURE_GROUP_ORDER.map((group) => {
        const groupBlocks = blocks.filter((b) => b.group === group);
        return (
          <section key={group} className="space-y-2">
            <h3 className="v2-micro px-0.5">{STRUCTURE_GROUP_LABEL[group]}</h3>
            <div className="space-y-1.5">
              {groupBlocks.map((b) => (
                <BlockRow
                  key={b.uid}
                  block={b}
                  selected={b.uid === selectedUid}
                  onSelect={() => onSelect(b.uid)}
                />
              ))}
              <button
                type="button"
                onClick={() => onAddBlock(group)}
                className="v2-focus flex w-full items-center justify-center gap-1.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] px-3 py-2 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
              >
                <MIcon name="add" size={15} />
                añadir bloque
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BlockRow({
  block,
  selected,
  onSelect,
}: {
  block: EditorBlock;
  selected: boolean;
  onSelect: () => void;
}) {
  const slug = blockModalitySlug(block);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={cn(
        'v2-focus relative block w-full overflow-hidden rounded-[var(--v2-r-m)] border bg-[color:var(--v2-surface)] py-2 pl-3 pr-2.5 text-left transition-colors',
        selected
          ? 'border-[color:var(--v2-accent)] ring-1 ring-[color:var(--v2-accent)]'
          : 'border-[color:var(--v2-border)] hover:border-[color:var(--v2-border-strong)]',
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: `var(--v2-mod-${slug})` }}
      />
      <p className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">{block.title}</p>
      <p className="v2-num mt-0.5 truncate text-xs text-[color:var(--v2-muted)]">
        {blockSummaryLine(block)}
      </p>
    </button>
  );
}
