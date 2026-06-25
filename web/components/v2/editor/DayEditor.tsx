'use client';

// DayEditor — SCREEN 8 client orchestrator. Hierarchy día › sesión (AM/PM) ›
// bloque › ítems. A single day column of SessionPartCards. Day header: display
// "Lunes 12 · ene" + pills (N sesiones · vol ~Xmin) + "＋ añadir sesión" +
// "Guardar día". "＋ Añadir bloque" opens the AddBlockModal type chooser; the
// block's exercises are visible inline; "＋ Añadir ejercicio" opens the
// ExercisePicker directly; clicking a line opens a drawer with the dosis form.
// Blocks and exercises reorder with ↑/↓. All state is local + structured
// Prescription; the save persists the structured day.

import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { dayCanvasHref } from '@/lib/dashboard/v2/planes-model';
import type {
  DayEditorModel,
  EditorBlock,
  EditorItem,
  EditorSession,
} from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { SessionPartCard } from './SessionPartCard';
import { WeekContextStrip } from './WeekContextStrip';
import { CopyDayModal } from './CopyDayModal';
import { AddBlockModal } from './AddBlockModal';
import { BlockEditor } from './BlockEditor';
import { ExercisePicker, type PickedExercise } from './ExercisePicker';
import { blockMinutes } from './block-helpers';
import { saveGateFor } from '@/lib/dashboard/v2/item-validity';
import { defaultCategoryForModality, withPickedExercise } from '@/lib/dashboard/v2/pick-exercise';

// Wire shape for one edited day's sessions — shared by "Guardar día" and
// "Copiar día a…" so both send the IDENTICAL structured payload (`slot` omitted:
// it is positional). Single source of truth, no drift between the two calls.
function sessionsToWire(sessions: EditorSession[]) {
  return sessions.map((s) => ({
    uid: s.uid,
    slot: s.slot,
    ...(s.focus && s.focus.trim() ? { focus: s.focus.trim() } : {}),
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
  }));
}

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

export function DayEditor({ model }: { model: DayEditorModel }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<EditorSession[]>(model.sessions);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [copyOpen, setCopyOpen] = useState(false);

  // Add-block modal target (which session) + item-edit drawer target + the
  // "añadir ejercicio" picker target (which block gets the picked exercise).
  const [addTo, setAddTo] = useState<{ sessionUid: string } | null>(null);
  const [editing, setEditing] = useState<{ sessionUid: string; blockUid: string } | null>(null);
  const [pickingFor, setPickingFor] = useState<{ sessionUid: string; blockUid: string } | null>(
    null,
  );

  const totalMin = sessions.reduce(
    (acc, s) => acc + s.blocks.reduce((a, b) => a + (blockMinutes(b) ?? 0), 0),
    0,
  );

  // Honest save gate — a line with no real exercise can NOT be saved (kills A3).
  const gate = saveGateFor(sessions.flatMap((s) => s.blocks));

  const updateSession = (uid: string, next: EditorSession) =>
    setSessions((prev) => prev.map((s) => (s.uid === uid ? next : s)));

  // Workout TITLE (session.focus) — one input near the session header.
  const setSessionFocus = (uid: string, focus: string) =>
    setSessions((prev) => prev.map((s) => (s.uid === uid ? { ...s, focus } : s)));

  // "Sugerir título" — derive a short title from the session's blocks/exercises.
  // Calls the coach AI endpoint (LLM when configured, honest content-derived
  // fallback otherwise); the returned title fills the input so the coach can edit
  // it before saving. Per-session in-flight flag avoids double requests.
  const [suggestingUid, setSuggestingUid] = useState<string | null>(null);
  const suggestTitle = async (session: EditorSession) => {
    if (suggestingUid) return;
    setSuggestingUid(session.uid);
    try {
      const res = await fetch('/api/coach/ai/suggest-session-title', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          blocks: session.blocks.map((b) => ({
            title: b.title,
            format: b.format,
            items: b.items.map((it) => ({
              exercise_name: it.exercise_name,
              modality: it.prescription.modality,
            })),
          })),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { title?: string };
      if (data.title) setSessionFocus(session.uid, data.title);
    } catch {
      // Silent: a failed suggestion just leaves the input as-is (no fake title).
    } finally {
      setSuggestingUid(null);
    }
  };

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

  // Reorder a block within its session (↑/↓). Pure index swap, no fake drag.
  const moveBlock = (sessionUid: string, blockUid: string, dir: -1 | 1) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.uid !== sessionUid) return s;
        const i = s.blocks.findIndex((b) => b.uid === blockUid);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= s.blocks.length) return s;
        const blocks = s.blocks.slice();
        [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
        return { ...s, blocks };
      }),
    );
  };

  // Reorder an exercise within its block (↑/↓).
  const moveItem = (sessionUid: string, blockUid: string, itemUid: string, dir: -1 | 1) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.uid !== sessionUid
          ? s
          : {
              ...s,
              blocks: s.blocks.map((b) => {
                if (b.uid !== blockUid) return b;
                const i = b.items.findIndex((it) => it.uid === itemUid);
                const j = i + dir;
                if (i < 0 || j < 0 || j >= b.items.length) return b;
                const items = b.items.slice();
                [items[i], items[j]] = [items[j]!, items[i]!];
                return { ...b, items };
              }),
            },
      ),
    );
  };

  // "＋ Añadir ejercicio" → pick from the catalog first, then create the line with
  // the exercise already linked (no orphan A3 line). The new item inherits the
  // block's seed prescription (its dosis shape) so the dosis form opens correct.
  const addPickedItemToBlock = (sessionUid: string, blockUid: string, ex: PickedExercise) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.uid !== sessionUid
          ? s
          : {
              ...s,
              blocks: s.blocks.map((b) => {
                if (b.uid !== blockUid) return b;
                const seed = b.items[0]?.prescription ?? {
                  scheme: 'sets',
                  modality: 'strength',
                  sets: [{ measure: { kind: 'reps', value: 8 } }],
                };
                const fresh: EditorItem = {
                  uid: `item-${Date.now()}`,
                  exercise_id: null,
                  exercise_name: '',
                  prescription: seed,
                };
                const patch = withPickedExercise(fresh, ex);
                return { ...b, items: [...b.items, { ...fresh, ...patch }] };
              }),
            },
      ),
    );
    setPickingFor(null);
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
          sessions: sessionsToWire(sessions),
        }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
    }
  };

  // "Copiar día a…" — copies THIS day's live content into one or more target days,
  // in the SAME week or in ANOTHER week of the microciclo (cross-week). Returns
  // 'conflict' when a target already has content and the coach has not confirmed
  // overwrite (the modal then asks). On success navigates to the first target day
  // (in its week) so the coach lands on the copy. Pure clone — no progression bump.
  const copyDayTo = async (
    toWeekId: string,
    toDays: number[],
    overwrite: boolean,
  ): Promise<'ok' | 'conflict' | 'error'> => {
    try {
      const res = await fetch(`/api/coach/program-weeks/${model.week_id}/day/copy`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from_day_of_week: model.day_of_week,
          ...(toWeekId !== model.week_id ? { to_week_id: Number(toWeekId) } : {}),
          to_days: toDays,
          sessions: sessionsToWire(sessions),
          overwrite,
        }),
      });
      if (res.status === 409) return 'conflict';
      if (!res.ok) return 'error';
      setCopyOpen(false);
      // Land on the first target day in its own week (flat day index across month).
      const targetWeek = model.weeks.find((w) => w.id === toWeekId);
      const base = (targetWeek?.week_index ?? model.week_index) * 7;
      const firstDay = [...toDays].sort((a, b) => a - b)[0] ?? model.day_of_week;
      router.push(dayCanvasHref(model.month_id, base + (firstDay - 1)), { scroll: false });
      return 'ok';
    } catch {
      return 'error';
    }
  };

  const editingSession = editing ? sessions.find((s) => s.uid === editing.sessionUid) : null;
  const editingBlock = editingSession?.blocks.find((b) => b.uid === editing?.blockUid) ?? null;
  const addToSession = addTo ? sessions.find((s) => s.uid === addTo.sessionUid) : null;
  const pickingForBlock = pickingFor
    ? sessions
        .find((s) => s.uid === pickingFor.sessionUid)
        ?.blocks.find((b) => b.uid === pickingFor.blockUid) ?? null
    : null;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
      {/* WEEK CONTEXT — the permanent week frame: the coach composes this day
          while seeing the other six. Clicking a cell navigates to that day. */}
      <WeekContextStrip
        microcycleId={model.month_id}
        weekName={model.week_name}
        weekDays={model.week_days}
        weekDayBase={model.week_day_base}
        currentDayOfWeek={model.day_of_week}
      />

      {/* Day header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <Link
            href={`/microciclos/${model.month_id}`}
            scroll={false}
            className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="arrow_back" size={15} />
            Volver a la semana
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
          {sessions.length > 0 ? (
            <button
              type="button"
              onClick={() => setCopyOpen(true)}
              disabled={!gate.ok}
              title={
                gate.ok
                  ? 'Copia este día a otro día de la semana'
                  : 'Completa las líneas sin ejercicio antes de copiar'
              }
              className="v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3.5 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:opacity-50"
            >
              <MIcon name="content_copy" size={16} />
              Copiar día a…
            </button>
          ) : null}
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

      {/* Day body: one sessions column */}
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
              onChangeFocus={(focus) => setSessionFocus(session.uid, focus)}
              onSuggestTitle={() => suggestTitle(session)}
              suggesting={suggestingUid === session.uid}
              onAddBlock={() => setAddTo({ sessionUid: session.uid })}
              onEditItem={(blockUid) => setEditing({ sessionUid: session.uid, blockUid })}
              onAddItem={(blockUid) => setPickingFor({ sessionUid: session.uid, blockUid })}
              onRemoveBlock={(blockUid) => removeBlock(session.uid, blockUid)}
              onMoveBlock={(blockUid, dir) => moveBlock(session.uid, blockUid, dir)}
              onMoveItem={(blockUid, itemUid, dir) =>
                moveItem(session.uid, blockUid, itemUid, dir)
              }
            />
          ))
        )}
      </div>

      {/* Copiar día a… — pick a target day of the SAME week. A target with
          content asks for overwrite confirmation before replacing it. */}
      {copyOpen ? (
        <CopyDayModal
          currentWeekId={model.week_id}
          currentDayOfWeek={model.day_of_week}
          weeks={model.weeks}
          onCopy={copyDayTo}
          onClose={() => setCopyOpen(false)}
        />
      ) : null}

      {/* Añadir bloque — the type chooser. Picking a type creates the block. */}
      {addTo && addToSession ? (
        <AddBlockModal
          destinationLabel={`Sesión ${SLOT_LABEL[addToSession.slot]} · ${model.day_label}`}
          onClose={() => setAddTo(null)}
          onAdd={(block) => addBlockToSession(addTo.sessionUid, block)}
        />
      ) : null}

      {/* Añadir ejercicio — the catalog picker, opened inline from a block. On
          pick the line is created with the exercise already linked (no A3 orphan). */}
      {pickingFor && pickingForBlock ? (
        <ExercisePicker
          destinationLabel={pickingForBlock.title || 'Ejercicio'}
          defaultCategory={defaultCategoryForModality(
            pickingForBlock.items[0]?.prescription.modality,
          )}
          onPick={(ex) => addPickedItemToBlock(pickingFor.sessionUid, pickingFor.blockUid, ex)}
          onClose={() => setPickingFor(null)}
        />
      ) : null}

      {/* Item-edit drawer — the dosis form for the block's lines */}
      {editing && editingBlock && editingSession ? (
        <BlockEditorDrawer
          block={editingBlock}
          onClose={() => setEditing(null)}
          onChange={(next) => updateBlock(editingSession.uid, next)}
          onAddItem={() =>
            setPickingFor({ sessionUid: editingSession.uid, blockUid: editingBlock.uid })
          }
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
