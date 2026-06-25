'use client';

// DayEditor — SCREEN 8 client orchestrator. Hierarchy día › sesión (AM/PM) ›
// bloque › ítems. Main day column (SessionPartCards) + a toggleable LibraryRail
// (236px). Day header: display "Lunes 12 · ene" + pills (N sesiones · vol ~Xmin)
// + "＋ añadir sesión" + "Guardar día". The block-level add-block picker opens the
// SCREEN 9 AddBlockModal; editing an item opens a drawer with the full BlockEditor
// (the 3-axis adaptive fields). All state is local + structured Prescription;
// persistence is a follow-up (TODO(endpoint)).

import { useState } from 'react';
import Link from 'next/link';
import type {
  DayEditorModel,
  EditorBlock,
  EditorSession,
  LibraryBlockRow,
  LibrarySessionRow,
} from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { SessionPartCard } from './SessionPartCard';
import { LibraryRail } from './LibraryRail';
import { AddBlockModal } from './AddBlockModal';
import { BlockEditor } from './BlockEditor';
import { blockMinutes } from './block-helpers';
import { saveGateFor } from '@/lib/dashboard/v2/item-validity';

const SLOT_LABEL: Record<EditorSession['slot'], string> = { am: 'AM', pm: 'PM', extra: 'Extra' };
const NEXT_SLOT: Record<number, EditorSession['slot']> = { 0: 'am', 1: 'pm' };

// Honest save state — no fake timer. The button reflects the real request status.
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const SAVE_LABEL: Record<SaveState, string> = {
  idle: 'Guardar día',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'Reintentar',
};
const SAVE_ICON: Record<SaveState, string> = {
  idle: 'save',
  saving: 'progress_activity',
  saved: 'check_circle',
  error: 'error',
};

export function DayEditor({
  model,
  libraryBlocks,
  librarySessions,
}: {
  model: DayEditorModel;
  libraryBlocks: LibraryBlockRow[];
  librarySessions: LibrarySessionRow[];
}) {
  const [sessions, setSessions] = useState<EditorSession[]>(model.sessions);
  const [railOpen, setRailOpen] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Add-block modal target (which session) + item-edit drawer target.
  const [addTo, setAddTo] = useState<{ sessionUid: string } | null>(null);
  const [editing, setEditing] = useState<{ sessionUid: string; blockUid: string } | null>(null);

  const totalMin = sessions.reduce(
    (acc, s) => acc + s.blocks.reduce((a, b) => a + (blockMinutes(b) ?? 0), 0),
    0,
  );

  // Honest save gate — a line with no real exercise can NOT be saved (kills A3).
  const gate = saveGateFor(sessions.flatMap((s) => s.blocks));

  const updateSession = (uid: string, next: EditorSession) =>
    setSessions((prev) => prev.map((s) => (s.uid === uid ? next : s)));

  const addSession = () => {
    const slot = NEXT_SLOT[sessions.length] ?? 'extra';
    setSessions((prev) => [
      ...prev,
      { uid: `session-${prev.length}-${Date.now()}`, slot, blocks: [] },
    ]);
  };

  const addBlockToSession = (sessionUid: string, block: EditorBlock) => {
    setSessions((prev) =>
      prev.map((s) => (s.uid === sessionUid ? { ...s, blocks: [...s.blocks, block] } : s)),
    );
    setAddTo(null);
  };

  const removeBlock = (sessionUid: string, blockUid: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.uid === sessionUid ? { ...s, blocks: s.blocks.filter((b) => b.uid !== blockUid) } : s,
      ),
    );
  };

  const updateBlock = (sessionUid: string, next: EditorBlock) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.uid === sessionUid
          ? { ...s, blocks: s.blocks.map((b) => (b.uid === next.uid ? next : b)) }
          : s,
      ),
    );
  };

  const addItemToBlock = (sessionUid: string, blockUid: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.uid !== sessionUid
          ? s
          : {
              ...s,
              blocks: s.blocks.map((b) =>
                b.uid !== blockUid
                  ? b
                  : {
                      ...b,
                      items: [
                        ...b.items,
                        {
                          uid: `item-${Date.now()}`,
                          exercise_id: null,
                          exercise_name: '',
                          prescription: {
                            scheme: 'sets',
                            modality: 'strength',
                            sets: [{ measure: { kind: 'reps', value: 8 } }],
                          },
                        },
                      ],
                    },
              ),
            },
      ),
    );
    setEditing({ sessionUid, blockUid });
  };

  const handleSave = async () => {
    // Never attempt a save that would persist incomplete lines (A3).
    if (!gate.ok) {
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    try {
      // Serialize-on-the-server: send the edited day; the route loads the full
      // week, merges this day (preserving the others + block-level config) and
      // upserts. `slot` is omitted intentionally — it is positional.
      const res = await fetch(`/api/coach/program-weeks/${model.week_id}/day`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          day_of_week: model.day_of_week,
          sessions: sessions.map((s) => ({
            uid: s.uid,
            slot: s.slot,
            blocks: s.blocks.map((b) => ({
              uid: b.uid,
              title: b.title,
              format: b.format,
              methodology_group_id: b.methodology_group_id ?? null,
              source_block_id: b.source_block_id ?? null,
              items: b.items.map((it) => ({
                uid: it.uid,
                exercise_id: it.exercise_id,
                exercise_name: it.exercise_name,
                prescription: it.prescription,
                ...(it.notes ? { notes: it.notes } : {}),
              })),
            })),
          })),
        }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
    }
  };

  const editingSession = editing ? sessions.find((s) => s.uid === editing.sessionUid) : null;
  const editingBlock = editingSession?.blocks.find((b) => b.uid === editing?.blockUid) ?? null;
  const addToSession = addTo ? sessions.find((s) => s.uid === addTo.sessionUid) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
      {/* Day header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <Link
            href={`/microciclos/${model.month_id}`}
            className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="arrow_back" size={15} />
            {model.month_name} · {model.week_name}
          </Link>
          <h1 className="v2-display text-3xl sm:text-4xl">{model.day_label}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="neutral" variant="soft">
              <span className="v2-num">{sessions.length}</span>&nbsp;sesiones
            </Pill>
            {totalMin > 0 ? (
              <Pill tone="info" variant="soft">
                vol&nbsp;~<span className="v2-num">{totalMin}</span>&nbsp;min
              </Pill>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={addSession}
            className="v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3.5 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
          >
            <MIcon name="add" size={16} />
            Añadir sesión
          </button>
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            aria-pressed={railOpen}
            className="v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3.5 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
          >
            <MIcon name="menu_book" size={16} />
            Biblioteca
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveState === 'saving' || !gate.ok}
            aria-live="polite"
            title={gate.ok ? undefined : gate.reason ?? undefined}
            className={
              saveState === 'error'
                ? 'v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-danger,#c0362c)] px-4 text-sm font-bold text-white transition-colors'
                : 'v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-60'
            }
          >
            <MIcon name={SAVE_ICON[saveState]} size={17} />
            {SAVE_LABEL[saveState]}
          </button>
        </div>
      </div>

      {/* Honest gate — never a fake "Guardado". Tells the coach exactly why. */}
      {!gate.ok ? (
        <div className="flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:rgba(242,80,79,.3)] bg-[color:var(--v2-danger-soft)] px-3 py-2.5 text-[13px] text-[color:var(--v2-danger)]">
          <MIcon name="error" size={16} className="shrink-0" />
          <span>{gate.reason}</span>
        </div>
      ) : null}

      {/* Day body: sessions column + library rail */}
      <div
        className={
          railOpen
            ? 'grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_236px]'
            : 'grid grid-cols-1 items-start gap-5'
        }
      >
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <EmptyState
              icon="event_available"
              title="Día de descanso"
              description="No hay sesiones planificadas. Añade una sesión AM o PM para empezar."
              action={
                <button
                  type="button"
                  onClick={addSession}
                  className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 py-2 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
                >
                  <MIcon name="add" size={16} />
                  Añadir sesión
                </button>
              }
            />
          ) : (
            sessions.map((session) => (
              <SessionPartCard
                key={session.uid}
                session={session}
                onAddBlock={() => setAddTo({ sessionUid: session.uid })}
                onEditItem={(blockUid) => setEditing({ sessionUid: session.uid, blockUid })}
                onAddItem={(blockUid) => addItemToBlock(session.uid, blockUid)}
                onRemoveBlock={(blockUid) => removeBlock(session.uid, blockUid)}
              />
            ))
          )}
        </div>

        {railOpen ? (
          <LibraryRail
            sessions={librarySessions}
            blocks={libraryBlocks}
            onAddBlock={(block) => {
              const target = sessions[0];
              if (target) addBlockToSession(target.uid, block);
            }}
            onClose={() => setRailOpen(false)}
          />
        ) : null}
      </div>

      {/* SCREEN 9 — Añadir bloque modal */}
      {addTo && addToSession ? (
        <AddBlockModal
          destinationLabel={`Sesión ${SLOT_LABEL[addToSession.slot]} · ${model.day_label}`}
          libraryBlocks={libraryBlocks}
          onClose={() => setAddTo(null)}
          onAdd={(block) => addBlockToSession(addTo.sessionUid, block)}
        />
      ) : null}

      {/* Item-edit drawer — full BlockEditor (3-axis adaptive fields) */}
      {editing && editingBlock && editingSession ? (
        <BlockEditorDrawer
          block={editingBlock}
          onClose={() => setEditing(null)}
          onChange={(next) => updateBlock(editingSession.uid, next)}
          onAddItem={() => addItemToBlock(editingSession.uid, editingBlock.uid)}
        />
      ) : null}
    </div>
  );
}

// A right-side drawer hosting the full BlockEditor for axis-level edits.
function BlockEditorDrawer({
  block,
  onClose,
  onChange,
  onAddItem,
}: {
  block: EditorBlock;
  onClose: () => void;
  onChange: (next: EditorBlock) => void;
  onAddItem: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={`Editar bloque ${block.title}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        <header className="flex items-center justify-between border-b border-[color:var(--v2-border)] px-5 py-4">
          <h2 className="v2-display text-xl">{block.title || 'Editar bloque'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <BlockEditor block={block} onChange={onChange} onAddItem={onAddItem} />
        </div>
      </div>
    </div>
  );
}
