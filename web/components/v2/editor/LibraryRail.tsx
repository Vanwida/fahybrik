'use client';

// LibraryRail — SCREEN 8 right rail (236px, toggleable). Search + a Sesiones /
// Bloques toggle + cards the coach drags onto the day (drag is a follow-up; the
// "Añadir" button inserts immediately so the rail is functional now). Each card
// carries the modality color left-border. Real rows come from props (loaded by
// loadLibraryRail server-side); empty → EmptyState.

import { useMemo, useState } from 'react';
import type {
  EditorBlock,
  LibraryBlockRow,
  LibrarySessionRow,
} from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { SegmentedControl } from '@/components/v2/SegmentedControl';

export function LibraryRail({
  sessions,
  blocks,
  onAddBlock,
  onClose,
}: {
  sessions: LibrarySessionRow[];
  blocks: LibraryBlockRow[];
  onAddBlock: (block: EditorBlock) => void;
  onClose?: () => void;
}) {
  const [mode, setMode] = useState<'bloques' | 'sesiones'>('bloques');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const filteredBlocks = useMemo(
    () => (q ? blocks.filter((b) => b.title.toLowerCase().includes(q)) : blocks),
    [blocks, q],
  );
  const filteredSessions = useMemo(
    () => (q ? sessions.filter((s) => s.name.toLowerCase().includes(q)) : sessions),
    [sessions, q],
  );

  return (
    <aside className="flex w-full flex-col gap-3 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3 shadow-[var(--v2-shadow-card)]">
      <div className="flex items-center justify-between">
        <h3 className="v2-micro">Biblioteca · arrastra →</h3>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Ocultar biblioteca"
            className="v2-focus rounded-[var(--v2-r-s)] p-1 text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={16} />
          </button>
        ) : null}
      </div>

      <SegmentedControl
        size="sm"
        options={[
          { value: 'bloques', label: 'Bloques' },
          { value: 'sesiones', label: 'Sesiones' },
        ]}
        value={mode}
        onChange={setMode}
        ariaLabel="Tipo de biblioteca"
      />

      <label className="relative flex items-center">
        <span className="pointer-events-none absolute left-2.5 text-[color:var(--v2-faint)]">
          <MIcon name="search" size={15} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="buscar…"
          aria-label="Buscar en la biblioteca"
          className="v2-focus h-8 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] pl-7 pr-2 text-xs text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]"
        />
      </label>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {mode === 'bloques' ? (
          filteredBlocks.length === 0 ? (
            <EmptyState icon="inventory_2" title="Sin bloques" />
          ) : (
            filteredBlocks.map((b) => (
              <RailBlockCard key={b.id} block={b} onAdd={onAddBlock} />
            ))
          )
        ) : filteredSessions.length === 0 ? (
          <EmptyState icon="fitness_center" title="Sin sesiones" />
        ) : (
          filteredSessions.map((s) => <RailSessionCard key={s.id} session={s} />)
        )}
      </div>

      <p className="v2-micro leading-relaxed">
        Arrastra un bloque al día o pulsa para añadirlo a la sesión activa.
      </p>
    </aside>
  );
}

function RailBlockCard({
  block,
  onAdd,
}: {
  block: LibraryBlockRow;
  onAdd: (block: EditorBlock) => void;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onAdd({
          uid: `lib-${block.id}-${Date.now()}`,
          title: block.title,
          format: block.format,
          methodology_group_id: block.methodology_group_id,
          group: 'principal',
          source_block_id: block.id,
          items: [],
        })
      }
      className="v2-focus relative block w-full overflow-hidden rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] py-2 pl-3 pr-2 text-left transition-colors hover:border-[color:var(--v2-border-strong)]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: `var(--v2-mod-${block.modality_slug})` }}
      />
      <p className="truncate text-xs font-semibold text-[color:var(--v2-fg)]">{block.title}</p>
      <p className="v2-num mt-0.5 truncate text-[11px] text-[color:var(--v2-muted)]">
        {block.format ?? 'bloque'}
      </p>
    </button>
  );
}

function RailSessionCard({ session }: { session: LibrarySessionRow }) {
  return (
    <div className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
      <p className="truncate text-xs font-semibold text-[color:var(--v2-fg)]">{session.name}</p>
      <p className="v2-num mt-0.5 text-[11px] text-[color:var(--v2-muted)]">
        {session.block_count} bloques · {session.segment_count} ítems
      </p>
    </div>
  );
}
