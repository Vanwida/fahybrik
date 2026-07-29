'use client';

// ImportDayReviewDrawer — the #28 review drill-in (Fork C). A right-side drawer
// that opens the #33 BLOCK editor on ONE imported day's session so the coach fixes
// the review lines and PICKS the out-of-catalog exercises inline. Pure reuse:
// BlockEditor self-manages the ExercisePicker (via ExercisePickerField), so
// resolving an exercise here is the exact same affordance as authoring by hand —
// the resolved exercise_id lands on the line and the day turns green in the grid.

import type { EditorBlock, EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { ReviewDay } from '@/lib/dashboard/v2/import-review';
import { dayIncompleteLines, dayTone } from '@/lib/dashboard/v2/import-review';
import { MIcon } from '@/components/ui/MIcon';
import { BlockEditor } from '@/components/v2/editor/BlockEditor';

/**
 * Etiqueta de la sesión dentro del día. Solo se enseña cuando hay más de una:
 * en un día normal, poner «Mañana» encima de la única sesión es ruido.
 */
const SESSION_LABEL = ['Mañana', 'Tarde', 'Extra'];

const TONE_COPY: Record<ReturnType<typeof dayTone>, { label: string; className: string }> = {
  rest: { label: 'Descanso', className: 'text-[color:var(--v2-faint)]' },
  skipped: { label: 'No se importa', className: 'text-[color:var(--v2-faint)] line-through' },
  ok: { label: 'Tipado', className: 'text-[color:var(--v2-ok)]' },
  review: { label: 'Revisar', className: 'text-[color:var(--v2-warn)]' },
  incomplete: { label: 'Falta prescripción', className: 'text-[color:var(--v2-danger)]' },
  unresolved: { label: 'Falta ejercicio', className: 'text-[color:var(--v2-danger)]' },
};

export function ImportDayReviewDrawer({
  day,
  dayLabel,
  onChangeSession,
  onChangeIncluded,
  onClose,
}: {
  day: ReviewDay;
  /** e.g. "Semana 1 · Martes". */
  dayLabel: string;
  /** El día tiene N sesiones: se edita la de este índice ([0]=am, [1]=pm). */
  onChangeSession: (sessionIndex: number, session: EditorSession) => void;
  /** Toggle whether this day gets imported at all. */
  onChangeIncluded: (included: boolean) => void;
  onClose: () => void;
}) {
  const sessions = day.sessions;
  const hasSessions = sessions.length > 0;
  const tone = TONE_COPY[dayTone(day)];
  // Named-but-not-prescribed lines de TODAS las sesiones del día. Listed up front
  // with WHAT is missing, because the block editor below shows empty fields
  // without saying which ones matter.
  const incompleteLines = dayIncompleteLines(day);

  const updateBlock = (sessionIndex: number, next: EditorBlock) => {
    const session = sessions[sessionIndex];
    if (!session) return;
    onChangeSession(sessionIndex, {
      ...session,
      blocks: session.blocks.map((b) => (b.uid === next.uid ? next : b)),
    });
  };

  const setFocus = (sessionIndex: number, focus: string) => {
    const session = sessions[sessionIndex];
    if (!session) return;
    onChangeSession(sessionIndex, { ...session, focus });
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-[color:var(--v2-scrim)] backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={`Revisar ${dayLabel}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="v2-display text-xl">{dayLabel}</h2>
              <span className={`text-label font-bold uppercase tracking-wide ${tone.className}`}>
                {tone.label}
              </span>
            </div>
            {day.stimulus ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--v2-muted)]">
                <span className="text-[color:var(--v2-faint)]">Estímulo · </span>
                {day.stimulus}
              </p>
            ) : null}
            {hasSessions ? (
              <button
                type="button"
                onClick={() => onChangeIncluded(!day.included)}
                className={`v2-focus mt-2 inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border px-2.5 py-1 text-label font-semibold transition-colors ${
                  day.included
                    ? 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]'
                    : 'border-[color:var(--v2-accent)]/50 text-[color:var(--v2-accent)] hover:border-[color:var(--v2-accent)]'
                }`}
              >
                <MIcon name={day.included ? 'do_not_disturb_on' : 'add_circle'} size={13} />
                {day.included ? 'No importar este día' : 'Importar este día'}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar revisión del día"
            className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {!hasSessions ? (
            <p className="text-sm text-[color:var(--v2-muted)]">Día de descanso — nada que revisar.</p>
          ) : (
            <>
              {incompleteLines.length > 0 ? (
                <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-danger)]/40 bg-[color:var(--v2-danger)]/8 p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-[color:var(--v2-danger)]">
                    <MIcon name="error" size={14} />
                    {incompleteLines.length === 1
                      ? 'Falta prescribir 1 línea'
                      : `Faltan prescribir ${incompleteLines.length} líneas`}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {incompleteLines.map((line) => (
                      <li key={line.uid} className="text-label leading-snug">
                        <span className="font-semibold text-[color:var(--v2-fg)]">
                          {line.exercise_name || 'Línea sin nombre'}
                        </span>
                        <span className="text-[color:var(--v2-muted)]">
                          {' — '}
                          {line.reasons.join(' · ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {sessions.map((session, sessionIndex) => (
                <section key={session.uid} className="space-y-3">
                  {sessions.length > 1 ? (
                    <h3 className="flex items-center gap-1.5 text-label font-bold uppercase tracking-wide text-[color:var(--v2-accent)]">
                      <MIcon name={sessionIndex === 0 ? 'wb_sunny' : 'bedtime'} size={13} />
                      {SESSION_LABEL[sessionIndex] ?? `Sesión ${sessionIndex + 1}`}
                    </h3>
                  ) : null}

                  <label className="block space-y-1.5">
                    <span className="v2-micro">Título de la sesión</span>
                    <input
                      type="text"
                      value={session.focus ?? ''}
                      maxLength={120}
                      onChange={(e) => setFocus(sessionIndex, e.target.value)}
                      placeholder="p. ej. Fuerza · Tren inferior"
                      className="v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)]"
                    />
                  </label>

                  {session.blocks.length === 0 ? (
                    <p className="text-sm text-[color:var(--v2-muted)]">
                      Esta sesión no tiene bloques tipados.
                    </p>
                  ) : (
                    session.blocks.map((block) => (
                      <div
                        key={block.uid}
                        className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-4"
                      >
                        <BlockEditor
                          block={block}
                          onChange={(next) => updateBlock(sessionIndex, next)}
                        />
                      </div>
                    ))
                  )}
                </section>
              ))}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end border-t border-[color:var(--v2-border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="check" size={16} />
            Hecho
          </button>
        </footer>
      </div>
    </div>
  );
}
