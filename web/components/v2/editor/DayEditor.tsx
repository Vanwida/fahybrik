'use client';

// DayEditor — el orquestador del día (rediseño de microciclos, fase 1). Layout:
// carril izquierdo de días (DayRail, 216px sticky; tira horizontal en <900px —
// visible cuando SEMANA pasa weekOutline + onSelectDay) + la hoja del día:
// cabecera (DayHeader: ‹ › de día, contador, Entreno/Descanso, Copiar, Guardar
// con punto ámbar), el quickline «escríbelo como siempre» (QuickAddLine) y las
// sesiones con sus bloques planos. El compositor abre en drawer lateral derecho
// (BlockEditorDrawer — shell aquí, contenido del compositor). El estado de las
// sesiones y sus mutaciones viven en use-day-sessions.ts; el guardado sigue
// siendo el PUT de siempre (day-editor-io.ts). Rediseño de piel e interacción:
// cero cambios de schema/API.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { dayCanvasHref } from '@/lib/dashboard/v2/planes-model';
import type { DayEditorModel, EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { RecoverySuggestion, WeekDayKind } from '@fahybrid/shared/schema/program-templates';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { RestDayPanel } from './RestDayPanel';
import { SessionPartCard } from './SessionPartCard';
import { CopyDayModal } from './CopyDayModal';
import { SuggestWorkoutModal } from './SuggestWorkoutModal';
import { LibraryBlockRail } from './LibraryBlockRail';
import { BlockEditorDrawer } from './BlockEditorDrawer';
import { DayHeader } from './DayHeader';
import { DayRail, type DayRailDay } from './DayRail';
import { QuickAddLine } from './QuickAddLine';
import { ExercisePicker } from './ExercisePicker';
import { countItems, saveGateFor } from '@/lib/dashboard/v2/item-validity';
import { defaultCategoryForModality } from '@/lib/dashboard/v2/pick-exercise';
import { NEXT_SLOT, useDaySessions } from './use-day-sessions';
import {
  putDay,
  putDayCopy,
  recoveryToWire,
  sessionsToWire,
  type SaveState,
} from './day-editor-io';

// El contrato del carril: SEMANA construye el resumen de los 7 días y lo pasa.
export type { DayRailDay } from './DayRail';

const SLOT_LABEL: Record<EditorSession['slot'], string> = { am: 'AM', pm: 'PM', extra: 'Extra' };

// `embedded` = pintado como zoom DÍA del canvas del microciclo (un editor, dos
// zooms: SEMANA ↔ DÍA). El nav de día llega en props planas: `onSelectDay(dia)`
// (el rail y las flechas — lo pasa SEMANA junto a `weekOutline`) o el par legacy
// href + `onNavigateDay` (soft-nav del canvas). Standalone conserva el enlace
// «Volver a la semana».
export function DayEditor({
  model,
  embedded = false,
  onBackToWeek,
  onNavigateDay,
  prevDayHref = null,
  nextDayHref = null,
  weekOutline,
  onSelectDay,
}: {
  model: DayEditorModel;
  embedded?: boolean;
  /** ← Semana — vuelve al zoom de la semana completa. */
  onBackToWeek?: () => void;
  /** Soft-nav del canvas (View Transition) — abre el href de día dado. */
  onNavigateDay?: (href: string) => void;
  /** ‹ — día anterior de la semana (null / omitido en el primer día). */
  prevDayHref?: string | null;
  /** › — día siguiente de la semana (null / omitido en el último día). */
  nextDayHref?: string | null;
  /** Los 7 días resumidos para el carril izquierdo (lo pasa SEMANA). */
  weekOutline?: DayRailDay[];
  /** Abre el día 1..7 — el clic del carril y las flechas ‹ ›. */
  onSelectDay?: (dia: number) => void;
}) {
  const router = useRouter();
  const day = useDaySessions(model.sessions);
  const { sessions } = day;
  // Día TIPADO (#47): workout | rest. El toggle lo cambia; sesiones/recovery se
  // conservan en estado al alternar (sin pérdida a mitad de edición) y solo el
  // payload del tipo ACTIVO viaja en el guardado.
  const [dayKind, setDayKind] = useState<WeekDayKind>(model.kind);
  const [recovery, setRecovery] = useState<RecoverySuggestion[]>(model.recovery_suggestions);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [copyOpen, setCopyOpen] = useState(false);
  const isRest = dayKind === 'rest';

  // Punto ámbar de cambios sin guardar — derivado del propio estado del editor:
  // cualquier mutación de sesiones/recovery/tipo tras el montaje lo enciende y
  // un guardado con éxito lo apaga. Sin temporizadores, sin falsos positivos.
  const [dirty, setDirty] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setDirty(true);
  }, [sessions, recovery, dayKind]);

  // Overlays: drawer del bloque, picker de ejercicio y las dos vías de «traer
  // bloques hechos» (IA / biblioteca), cada una apuntando a su sesión.
  const [aiFor, setAiFor] = useState<{ sessionUid: string } | null>(null);
  const [libraryFor, setLibraryFor] = useState<{ sessionUid: string } | null>(null);
  const [editing, setEditing] = useState<{ sessionUid: string; blockUid: string } | null>(null);
  const [pickingFor, setPickingFor] = useState<{ sessionUid: string; blockUid: string } | null>(
    null,
  );

  // La sesión ACTIVA (la última que tocó el coach) — destino del quickline.
  const [activeSessionUid, setActiveSessionUid] = useState<string | null>(null);

  // Gate honesto — una línea sin ejercicio real NO se puede guardar (mata A3).
  const gate = saveGateFor(sessions.flatMap((s) => s.blocks));
  const canSave = isRest || gate.ok;

  const blockCount = sessions.reduce((acc, s) => acc + s.blocks.length, 0);
  const exerciseCount = countItems(sessions.flatMap((s) => s.blocks));

  // «Sugerir título» — deriva un título corto del contenido de la sesión (LLM si
  // está configurado, fallback honesto derivado del contenido si no).
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
      if (data.title) day.setSessionFocus(session.uid, data.title);
    } catch {
      // Silencioso: una sugerencia fallida deja el input como está (sin títulos falsos).
    } finally {
      setSuggestingUid(null);
    }
  };

  // Pasar a Descanso oculta el editor de entreno — se cierra cualquier overlay
  // workout-only para que no quede colgando sobre el panel de descanso.
  const changeKind = (next: WeekDayKind) => {
    setDayKind(next);
    if (next === 'rest') {
      setAiFor(null);
      setLibraryFor(null);
      setEditing(null);
      setPickingFor(null);
      setCopyOpen(false);
    }
  };

  const handleSave = async () => {
    // Nunca un guardado que persista líneas incompletas (A3). Un día de descanso
    // no tiene líneas, así que canSave es true para él.
    if (!canSave) {
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    try {
      const ok = await putDay(model.week_id, {
        day_of_week: model.day_of_week,
        kind: dayKind,
        sessions: isRest ? [] : sessionsToWire(sessions),
        ...(isRest ? { recovery_suggestions: recoveryToWire(recovery) } : {}),
      });
      if (!ok) throw new Error('save failed');
      setDirty(false);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
    }
  };

  // «Copiar día a…» — copia el contenido vivo de ESTE día a uno o varios días,
  // de la misma semana o de otra (cross-week). 'conflict' cuando el destino
  // tiene contenido y el coach no confirmó sobrescribir (el modal 409 pregunta).
  const copyDayTo = async (
    toWeekId: string,
    toDays: number[],
    overwrite: boolean,
  ): Promise<'ok' | 'conflict' | 'error'> => {
    try {
      const result = await putDayCopy(model.week_id, {
        from_day_of_week: model.day_of_week,
        ...(toWeekId !== model.week_id ? { to_week_id: Number(toWeekId) } : {}),
        to_days: toDays,
        sessions: sessionsToWire(sessions),
        overwrite,
      });
      if (result !== 'ok') return result;
      setCopyOpen(false);
      // Aterriza en el primer día destino, en su semana (índice plano del mes).
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
  const libraryForSession = libraryFor
    ? sessions.find((s) => s.uid === libraryFor.sessionUid)
    : null;
  const pickingForBlock = pickingFor
    ? sessions
        .find((s) => s.uid === pickingFor.sessionUid)
        ?.blocks.find((b) => b.uid === pickingFor.blockUid) ?? null
    : null;

  // Nav de día: onSelectDay manda (rail + flechas); si no, el par href legacy.
  const goPrev = onSelectDay
    ? model.day_of_week > 1
      ? () => onSelectDay(model.day_of_week - 1)
      : null
    : onNavigateDay && prevDayHref
      ? () => onNavigateDay(prevDayHref)
      : null;
  const goNext = onSelectDay
    ? model.day_of_week < 7
      ? () => onSelectDay(model.day_of_week + 1)
      : null
    : onNavigateDay && nextDayHref
      ? () => onNavigateDay(nextDayHref)
      : null;
  const showNav = !!onSelectDay || !!onNavigateDay;

  // El carril solo con el contrato completo (SEMANA pasa outline + selección).
  const rail = weekOutline && onSelectDay ? weekOutline : null;
  const nextSlot = NEXT_SLOT[sessions.length] ?? 'extra';

  const sheet = (
    <div className="flex min-w-0 flex-col gap-4">
      <DayHeader
        dayLabel={model.day_label}
        embedded={embedded}
        onBackToWeek={onBackToWeek}
        backHref={!embedded && !onBackToWeek ? `/microciclos/${model.month_id}` : null}
        backBehindRail={!!rail}
        showNav={showNav}
        onPrev={goPrev}
        onNext={goNext}
        isRest={isRest}
        sessionCount={sessions.length}
        blockCount={blockCount}
        exerciseCount={exerciseCount}
        recoveryCount={recovery.length}
        kind={dayKind}
        onChangeKind={changeKind}
        showCopy={!isRest && sessions.length > 0}
        copyEnabled={gate.ok}
        copyTitle={
          gate.ok
            ? 'Copia este día a otro día de la semana'
            : 'Completa las líneas sin ejercicio antes de copiar'
        }
        onCopy={() => setCopyOpen(true)}
        saveState={saveState}
        canSave={canSave}
        saveBlockedReason={gate.reason}
        dirty={dirty}
        onSave={handleSave}
      />

      {/* Gate honesto — nunca un «Guardado» falso: dice exactamente el porqué. */}
      {!isRest && !gate.ok ? (
        <div className="flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:rgba(242,80,79,.3)] bg-[color:var(--v2-danger-soft)] px-3 py-2.5 text-body text-[color:var(--v2-danger)]">
          <MIcon name="error" size={16} className="shrink-0" />
          <span>{gate.reason}</span>
        </div>
      ) : null}

      {/* La línea: escribir el entreno como siempre (solo en día de entreno). */}
      {!isRest ? (
        <QuickAddLine onAdd={(lines) => day.addQuickBlock(lines, activeSessionUid)} />
      ) : null}

      {/* Cuerpo: panel de descanso, o las sesiones de entreno. */}
      <div className={embedded && !rail ? 'mx-auto w-full max-w-[880px] space-y-4' : 'space-y-4'}>
        {isRest ? (
          <RestDayPanel recovery={recovery} onChange={setRecovery} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon="event_available"
            title="Sin sesiones aún"
            description="Este día es de entreno pero no tiene sesiones. Escríbelo arriba como siempre, añade una sesión o márcalo como Descanso."
            action={
              <button
                type="button"
                onClick={day.addSession}
                className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 py-2 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
              >
                <MIcon name="add" size={16} />
                Añadir sesión
              </button>
            }
          />
        ) : (
          <>
            {sessions.map((session) => (
              <div
                key={session.uid}
                onFocusCapture={() => setActiveSessionUid(session.uid)}
                onPointerDownCapture={() => setActiveSessionUid(session.uid)}
              >
                <SessionPartCard
                  session={session}
                  onChangeFocus={(focus) => day.setSessionFocus(session.uid, focus)}
                  onChangeNote={(notes) => day.setSessionNote(session.uid, notes)}
                  onSuggestTitle={() => suggestTitle(session)}
                  suggesting={suggestingUid === session.uid}
                  onSuggestWorkout={() => setAiFor({ sessionUid: session.uid })}
                  onInsertFromLibrary={() => setLibraryFor({ sessionUid: session.uid })}
                  onAddBlock={(archetype) => day.addBlockOfType(session.uid, archetype)}
                  onRenameBlock={(blockUid, title) =>
                    day.renameBlock(session.uid, blockUid, title)
                  }
                  onReorderBlocks={(orderedUids) => day.reorderBlocks(session.uid, orderedUids)}
                  onEditItem={(blockUid) => setEditing({ sessionUid: session.uid, blockUid })}
                  onAddItem={(blockUid) => setPickingFor({ sessionUid: session.uid, blockUid })}
                  onRemoveBlock={(blockUid) => day.removeBlock(session.uid, blockUid)}
                  onMoveItem={(blockUid, itemUid, dir) =>
                    day.moveItem(session.uid, blockUid, itemUid, dir)
                  }
                  onToggleOptional={(blockUid) => day.toggleOptional(session.uid, blockUid)}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={day.addSession}
              className="v2-focus w-full rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] px-3 py-2 text-xs font-semibold text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
            >
              ＋ Añadir sesión ({SLOT_LABEL[nextSlot]})
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={
        rail
          ? 'grid w-full gap-4 min-[900px]:grid-cols-[216px_minmax(0,1fr)] min-[900px]:items-start'
          : embedded
            ? 'flex w-full flex-col gap-4'
            : 'mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-5'
      }
    >
      {rail ? (
        <DayRail
          days={rail}
          currentDia={model.day_of_week}
          onSelectDay={onSelectDay!}
          onBackToWeek={onBackToWeek}
          weekLabel={`Semana ${model.week_index + 1}`}
        />
      ) : null}
      {sheet}

      {/* Copiar día a… — con confirmación de sobrescritura (modal 409). */}
      {copyOpen ? (
        <CopyDayModal
          currentWeekId={model.week_id}
          currentDayOfWeek={model.day_of_week}
          weeks={model.weeks}
          onCopy={copyDayTo}
          onClose={() => setCopyOpen(false)}
        />
      ) : null}

      {/* Redactar con IA (#33) — borradores de bloques para esta sesión. */}
      {aiFor && aiForSession ? (
        <SuggestWorkoutModal
          destinationLabel={`Sesión ${SLOT_LABEL[aiForSession.slot]} · ${model.day_label}`}
          onClose={() => setAiFor(null)}
          onInsert={(newBlocks) => {
            day.addBlocksToSession(aiFor.sessionUid, newBlocks);
            setAiFor(null);
          }}
        />
      ) : null}

      {/* Biblioteca de bloques — copia un bloque ya hecho en esta sesión. */}
      {libraryFor && libraryForSession ? (
        <LibraryBlockRail
          destinationLabel={`Sesión ${SLOT_LABEL[libraryForSession.slot]} · ${model.day_label}`}
          onClose={() => setLibraryFor(null)}
          onInsert={(newBlocks) => {
            day.addBlocksToSession(libraryFor.sessionUid, newBlocks);
            setLibraryFor(null);
          }}
        />
      ) : null}

      {/* Añadir ejercicio — el picker del catálogo; la línea nace ya enlazada. */}
      {pickingFor && pickingForBlock ? (
        <ExercisePicker
          destinationLabel={pickingForBlock.title || 'Ejercicio'}
          defaultCategory={defaultCategoryForModality(
            pickingForBlock.items[0]?.prescription.modality,
          )}
          onPick={(ex) => {
            day.addPickedItemToBlock(pickingFor.sessionUid, pickingFor.blockUid, ex);
            setPickingFor(null);
          }}
          onClose={() => setPickingFor(null)}
        />
      ) : null}

      {/* El compositor — drawer lateral derecho (shell DÍA, contenido COMPOSITOR). */}
      {editing && editingBlock && editingSession ? (
        <BlockEditorDrawer
          block={editingBlock}
          onClose={() => setEditing(null)}
          onChange={(next) => day.updateBlock(editingSession.uid, next)}
          onAddItem={() =>
            setPickingFor({ sessionUid: editingSession.uid, blockUid: editingBlock.uid })
          }
        />
      ) : null}
    </div>
  );
}
