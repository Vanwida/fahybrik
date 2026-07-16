'use client';

// DayEditor — SCREEN 8 client orchestrator. AGNOSTIC: día › sesión (AM/PM) › a
// FLAT list of coach-named blocks › ítems — no imposed sections. Day header: «←
// Semana» + ‹ › day nav (embedded canvas) + display title "Lunes 12 · ene" + pills
// (N sesiones · vol ~Xmin) + "＋ añadir sesión" + "Guardar día". Inside a session,
// "＋ Añadir bloque" opens an INLINE type picker (no modal); each block has an
// editable name, a type chip, a drag handle (reorder) and its inline item table;
// "＋ Añadir ejercicio" opens the ExercisePicker; clicking a line opens the dosis
// drawer. All state is local + structured Prescription; the save persists the day
// via PUT /api/coach/program-weeks/{week_id}/day (block order + names included).

import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { dayCanvasHref } from '@/lib/dashboard/v2/planes-model';
import type {
  DayEditorModel,
  EditorBlock,
  EditorItem,
  EditorSession,
} from '@/lib/dashboard/v2/editor-types';
import type { RecoverySuggestion, WeekDayKind } from '@fahybrid/shared/schema/program-templates';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { RestDayPanel } from './RestDayPanel';
import { SessionPartCard } from './SessionPartCard';
import { CopyDayModal } from './CopyDayModal';
import { SuggestWorkoutModal } from './SuggestWorkoutModal';
import { BlockEditor } from './BlockEditor';
import { ModalPortal, useEscapeToClose } from './ModalPortal';
import { ExercisePicker, type PickedExercise } from './ExercisePicker';
import { blockMinutes } from './block-helpers';
import { createBlockFromArchetype, type ArchetypeId } from '@/lib/dashboard/v2/archetypes';
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

// Wire shape for a rest day's recovery suggestions — drops empty duration/note so
// the payload carries only meaningful data (server re-validates via Zod).
function recoveryToWire(recovery: RecoverySuggestion[]) {
  return recovery.map((r) => ({
    activity: r.activity,
    ...(r.duration_min ? { duration_min: r.duration_min } : {}),
    ...(r.note && r.note.trim() ? { note: r.note.trim() } : {}),
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

// `embedded` = rendered as the DÍA zoom of the microciclo canvas (one editor, two
// zooms: SEMANA ↔ DÍA). In that mode the day header carries «← Semana» + ‹ › day
// navigation (wired to the canvas's view-transition soft-nav) and the body reads as
// a centered document. Standalone (`embedded` false) keeps the plain "Volver a la
// semana" link. The day-nav is passed as FLAT props (href-based) so the stable
// soft-nav callback is handed through as-is (never re-wrapped in a render closure).
export function DayEditor({
  model,
  embedded = false,
  onBackToWeek,
  onNavigateDay,
  prevDayHref = null,
  nextDayHref = null,
}: {
  model: DayEditorModel;
  embedded?: boolean;
  /** ← Semana — zoom back out to the full week. Presence enables the day header nav. */
  onBackToWeek?: () => void;
  /** The canvas soft-nav (View-Transition wrapped) — opens the given day href. */
  onNavigateDay?: (href: string) => void;
  /** ‹ — previous day of the week (null / omitted at the week's first day). */
  prevDayHref?: string | null;
  /** › — next day of the week (null / omitted at the week's last day). */
  nextDayHref?: string | null;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<EditorSession[]>(model.sessions);
  // Día TIPADO (#47): workout | rest. The toggle switches it; sessions/recovery are
  // kept in state across a toggle (no data loss mid-edit) and only the ACTIVE kind's
  // payload is sent on save (a rest day persists sessions:[] + its recovery).
  const [dayKind, setDayKind] = useState<WeekDayKind>(model.kind);
  const [recovery, setRecovery] = useState<RecoverySuggestion[]>(model.recovery_suggestions);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [copyOpen, setCopyOpen] = useState(false);
  const isRest = dayKind === 'rest';

  // Item-edit drawer target + the "añadir ejercicio" picker target (which block
  // gets the picked exercise) + the "Redactar con IA" target session.
  const [aiFor, setAiFor] = useState<{ sessionUid: string } | null>(null);
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
  // A rest day has no exercise lines to gate — it's always saveable. Only a workout
  // day must pass the incomplete-line gate.
  const canSave = isRest || gate.ok;

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

  // "＋ Añadir bloque" (inline picker) — the coach picks a TYPE; we build a ready,
  // pre-seeded block WITHOUT a section (agnostic) and append it. The coach then
  // names it inline. No modal, no imposed Calentamiento/Principal/Vuelta.
  const addBlockOfType = (sessionUid: string, archetype: ArchetypeId) => {
    const block = createBlockFromArchetype(archetype);
    setSessions((prev) =>
      prev.map((s) => (s.uid === sessionUid ? { ...s, blocks: [...s.blocks, block] } : s)),
    );
  };

  // "Redactar con IA" (#33) — append the coach-approved AI drafts to the session.
  // Append, never replace: the existing blocks stay; the coach edits from here.
  const addBlocksToSession = (sessionUid: string, newBlocks: EditorBlock[]) => {
    setSessions((prev) =>
      prev.map((s) => (s.uid === sessionUid ? { ...s, blocks: [...s.blocks, ...newBlocks] } : s)),
    );
    setAiFor(null);
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

  // Reorder blocks within a session (drag handle — dnd-kit hands us the new order).
  const reorderBlocks = (sessionUid: string, orderedUids: string[]) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.uid !== sessionUid) return s;
        const byUid = new Map(s.blocks.map((b) => [b.uid, b]));
        const blocks = orderedUids
          .map((uid) => byUid.get(uid))
          .filter((b): b is EditorBlock => b !== undefined);
        // Only accept a true permutation (never silently drop/add a block here).
        return blocks.length === s.blocks.length ? { ...s, blocks } : s;
      }),
    );
  };

  // Rename a block inline (the coach's label — the athlete reads it on the Plan).
  const renameBlock = (sessionUid: string, blockUid: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.uid === sessionUid
          ? { ...s, blocks: s.blocks.map((b) => (b.uid === blockUid ? { ...b, title } : b)) }
          : s,
      ),
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

  // Switching to Descanso hides the workout editor — close any open workout-only
  // overlay so a hidden session's drawer/modal can't linger over the rest panel.
  const changeKind = (next: WeekDayKind) => {
    setDayKind(next);
    if (next === 'rest') {
      // Cierra los overlays workout-only al pasar a descanso. El editor nuevo no
      // tiene AddBlockModal (bloques inline por arquetipo), así que no hay `addTo`.
      setAiFor(null);
      setEditing(null);
      setPickingFor(null);
      setCopyOpen(false);
    }
  };

  const handleSave = async () => {
    // Never attempt a save that would persist incomplete lines (A3). A rest day has
    // no lines, so canSave is true for it regardless of the (hidden) workout draft.
    if (!canSave) {
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    try {
      // Serialize-on-the-server: send the edited day; the route loads the full
      // week, merges this day (preserving the others + block-level config) and
      // upserts. `slot` is omitted intentionally — it is positional. A rest day
      // sends sessions:[] + its recovery suggestions; a workout day sends its
      // sessions (serializeDay drops any stale recovery on the workout side).
      const res = await fetch(`/api/coach/program-weeks/${model.week_id}/day`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          day_of_week: model.day_of_week,
          kind: dayKind,
          sessions: isRest ? [] : sessionsToWire(sessions),
          ...(isRest ? { recovery_suggestions: recoveryToWire(recovery) } : {}),
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
  const aiForSession = aiFor ? sessions.find((s) => s.uid === aiFor.sessionUid) : null;
  const pickingForBlock = pickingFor
    ? sessions
        .find((s) => s.uid === pickingFor.sessionUid)
        ?.blocks.find((b) => b.uid === pickingFor.blockUid) ?? null
    : null;

  return (
    <div className={embedded ? 'flex w-full flex-col gap-4' : 'mx-auto flex w-full max-w-[1480px] flex-col gap-5'}>
      {/* Day header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          {onBackToWeek ? (
            <button
              type="button"
              onClick={onBackToWeek}
              className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="arrow_back" size={15} />
              Semana
            </button>
          ) : !embedded ? (
            <Link
              href={`/microciclos/${model.month_id}`}
              scroll={false}
              className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="arrow_back" size={15} />
              Volver a la semana
            </Link>
          ) : null}
          {/* Day title with ‹ › day navigation (embedded canvas). The arrows step
              across the week's days (Lun→Dom); disabled at the week boundaries. */}
          <div className="flex min-w-0 items-center gap-1.5">
            {onNavigateDay ? (
              <button
                type="button"
                onClick={() => {
                  if (prevDayHref) onNavigateDay(prevDayHref);
                }}
                disabled={!prevDayHref}
                aria-label="Día anterior"
                className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MIcon name="chevron_left" size={18} />
              </button>
            ) : null}
            <h1
              className={
                embedded
                  ? 'v2-display min-w-0 truncate text-2xl sm:text-3xl'
                  : 'v2-display min-w-0 truncate text-3xl sm:text-4xl'
              }
            >
              {model.day_label}
            </h1>
            {onNavigateDay ? (
              <button
                type="button"
                onClick={() => {
                  if (nextDayHref) onNavigateDay(nextDayHref);
                }}
                disabled={!nextDayHref}
                aria-label="Día siguiente"
                className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MIcon name="chevron_right" size={18} />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isRest ? (
              <>
                <Pill tone="neutral" variant="soft">Descanso</Pill>
                {recovery.length > 0 ? (
                  <Pill tone="neutral" variant="soft">
                    <span className="v2-num">{recovery.length}</span>&nbsp;
                    {recovery.length === 1 ? 'sugerencia' : 'sugerencias'}
                  </Pill>
                ) : null}
              </>
            ) : (
              <>
                <Pill tone="neutral" variant="soft">
                  <span className="v2-num">{sessions.length}</span>&nbsp;
                  {sessions.length === 1 ? 'sesión' : 'sesiones'}
                </Pill>
                {totalMin > 0 ? (
                  <Pill tone="info" variant="soft">
                    vol&nbsp;~<span className="v2-num">{totalMin}</span>&nbsp;min
                  </Pill>
                ) : null}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Entreno / Descanso — el día tipado (#47). */}
          <DayKindToggle kind={dayKind} onChange={changeKind} />
          {!isRest ? (
            <>
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
            </>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={saveState === 'saving' || !canSave}
            aria-live="polite"
            title={canSave ? undefined : gate.reason ?? undefined}
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

      {/* Honest gate — never a fake "Guardado". Tells the coach exactly why. Only a
          workout day has lines to gate; a rest day is always saveable. */}
      {!isRest && !gate.ok ? (
        <div className="flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:rgba(242,80,79,.3)] bg-[color:var(--v2-danger-soft)] px-3 py-2.5 text-[13px] text-[color:var(--v2-danger)]">
          <MIcon name="error" size={16} className="shrink-0" />
          <span>{gate.reason}</span>
        </div>
      ) : null}

      {/* Day body: the DESCANSO recovery panel, or the workout sessions — stacked,
          centered document in the embedded canvas (DÍA zoom), full-width standalone. */}
      <div className={embedded ? 'mx-auto w-full max-w-[880px] space-y-4' : 'space-y-4'}>
        {isRest ? (
          <RestDayPanel recovery={recovery} onChange={setRecovery} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon="event_available"
            title="Sin sesiones aún"
            description="Este día es de entreno pero no tiene sesiones. Añade una, o márcalo como Descanso arriba."
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
              onSuggestWorkout={() => setAiFor({ sessionUid: session.uid })}
              onAddBlock={(archetype) => addBlockOfType(session.uid, archetype)}
              onRenameBlock={(blockUid, title) => renameBlock(session.uid, blockUid, title)}
              onReorderBlocks={(orderedUids) => reorderBlocks(session.uid, orderedUids)}
              onEditItem={(blockUid) => setEditing({ sessionUid: session.uid, blockUid })}
              onAddItem={(blockUid) => setPickingFor({ sessionUid: session.uid, blockUid })}
              onRemoveBlock={(blockUid) => removeBlock(session.uid, blockUid)}
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

      {/* Redactar con IA (#33) — draft this session's blocks from a focus. */}
      {aiFor && aiForSession ? (
        <SuggestWorkoutModal
          destinationLabel={`Sesión ${SLOT_LABEL[aiForSession.slot]} · ${model.day_label}`}
          onClose={() => setAiFor(null)}
          onInsert={(newBlocks) => addBlocksToSession(aiFor.sessionUid, newBlocks)}
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

// Entreno / Descanso segment toggle (#47) — the day's kind. 'workout' active =
// accent (the primary state); 'rest' active = a neutral elevated fill + moon, so it
// never reads like the orange primary action. Both are always visible to flip.
function DayKindToggle({
  kind,
  onChange,
}: {
  kind: WeekDayKind;
  onChange: (kind: WeekDayKind) => void;
}) {
  const base =
    'v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors';
  return (
    <div
      role="group"
      aria-label="Tipo del día"
      className="inline-flex items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-0.5"
    >
      <button
        type="button"
        onClick={() => onChange('workout')}
        aria-pressed={kind === 'workout'}
        className={
          kind === 'workout'
            ? `${base} bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]`
            : `${base} text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]`
        }
      >
        Entreno
      </button>
      <button
        type="button"
        onClick={() => onChange('rest')}
        aria-pressed={kind === 'rest'}
        className={
          kind === 'rest'
            ? `${base} text-[color:var(--v2-fg)]`
            : `${base} text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]`
        }
        style={
          kind === 'rest'
            ? { background: 'color-mix(in srgb, var(--v2-fg) 12%, transparent)' }
            : undefined
        }
      >
        <MIcon name="bedtime" size={14} />
        Descanso
      </button>
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
  // El ExercisePicker se abre ENCIMA de este drawer (desde "añadir componente" y
  // desde el ExercisePickerField de dentro): Escape es suyo mientras esté abierto.
  // La pila lo resuelve sola — aquí no hace falta saber quién hay arriba.
  useEscapeToClose(onClose);

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[color:var(--v2-scrim)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={`Editar bloque ${block.title}`}
        onClick={(e) => e.stopPropagation()}
        // Width is an ARBITRARY value on purpose: globals.css redefines the spacing
        // scale with shirt-size names (--spacing-xl: 24px), and Tailwind resolves
        // --spacing-* before --container-* for max-w-*, so `max-w-xl` would collapse
        // this drawer to 24px behind the scrim. Never use max-w-{xs,xl} here.
        className="flex h-full w-full max-w-[576px] flex-col overflow-hidden border-l border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
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
    </ModalPortal>
  );
}
