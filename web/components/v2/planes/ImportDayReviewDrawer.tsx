'use client';

// ImportDayReviewDrawer — the #28 review drill-in (Fork C). A right-side drawer
// that opens the #33 BLOCK editor on ONE imported day's session so the coach fixes
// the review lines and PICKS the out-of-catalog exercises inline. Pure reuse:
// BlockEditor self-manages the ExercisePicker (via ExercisePickerField), so
// resolving an exercise here is the exact same affordance as authoring by hand —
// the resolved exercise_id lands on the line and the day turns green in the grid.

import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { ReviewDay } from '@/lib/dashboard/v2/import-review';
import {
  blockTruncation,
  dayIncompleteLines,
  dayProposedFields,
  dayProposedPaths,
  dayTone,
} from '@/lib/dashboard/v2/import-review';
import { MIcon } from '@/components/ui/MIcon';
import { BlockEditor } from '@/components/v2/editor/BlockEditor';

/**
 * Etiqueta de la sesión dentro del día. Solo se enseña cuando hay más de una:
 * en un día normal, poner «Mañana» encima de la única sesión es ruido.
 */
const SESSION_LABEL = ['Mañana', 'Tarde', 'Extra'];

/** La línea que se añade a mano donde la foto cortó. MISMA semilla que usa el
 *  «Añadir ejercicio» del editor de bloque (`EMPTY_PRESCRIPTION` en BlockEditor):
 *  una línea añadida aquí tiene que nacer igual que una añadida allí. */
const SEED_PRESCRIPTION: Prescription = {
  scheme: 'sets',
  modality: 'strength',
  sets: [{ measure: { kind: 'reps', value: 8 } }],
};

let manualSeq = 0;

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
  onAcceptProposals,
  onAddPhoto,
  onClose,
}: {
  day: ReviewDay;
  /** e.g. "Semana 1 · Martes". */
  dayLabel: string;
  /** El día tiene N sesiones: se edita la de este índice ([0]=am, [1]=pm). */
  onChangeSession: (sessionIndex: number, session: EditorSession) => void;
  /** Toggle whether this day gets imported at all. */
  onChangeIncluded: (included: boolean) => void;
  /** Da por buenos de golpe todos los valores propuestos del día. */
  onAcceptProposals: () => void;
  /** Vuelve al paso de las fotos para añadir la captura del entreno abierto.
   *  Ausente cuando esta importación no vino de una foto. */
  onAddPhoto?: () => void;
  onClose: () => void;
}) {
  const sessions = day.sessions;
  const hasSessions = sessions.length > 0;
  const tone = TONE_COPY[dayTone(day)];
  // Named-but-not-prescribed lines de TODAS las sesiones del día. Listed up front
  // with WHAT is missing, because the block editor below shows empty fields
  // without saying which ones matter.
  const incompleteLines = dayIncompleteLines(day);
  // Lo que la foto no enseñaba y rellenó el importador. Sale en trazo discontinuo:
  // el coach tiene que poder ver de un vistazo qué leyó la foto y qué pusimos
  // nosotros por él. Al confirmar la distinción desaparece y no se guarda.
  const proposedCount = dayProposedFields(day).length;
  // Por línea, qué rutas siguen siendo propuestas: el editor de bloque marca con
  // ellas el campo exacto, que es donde el coach entiende «esto no lo escribí yo».
  const proposedPaths = dayProposedPaths(day);

  /** Una línea vacía en el bloque que la foto cortó, para escribirla a mano. */
  const addManualLine = (sessionIndex: number, blockUid: string) => {
    const session = sessions[sessionIndex];
    if (!session) return;
    manualSeq += 1;
    onChangeSession(sessionIndex, {
      ...session,
      blocks: session.blocks.map((b) =>
        b.uid !== blockUid
          ? b
          : {
              ...b,
              items: [
                ...b.items,
                {
                  uid: `manual-${Date.now()}-${manualSeq}`,
                  exercise_id: null,
                  exercise_name: '',
                  prescription: SEED_PRESCRIPTION,
                },
              ],
            },
      ),
    });
  };

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
            <p className="text-sm text-[color:var(--v2-muted)]">Día de descanso, nada que revisar.</p>
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
                          {' · '}
                          {line.reasons.join(' · ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {day.notes ? (
                /* La fuente traía algo que no era entreno («Semana 12», «Control
                   test salto»). Se enseña ANTES de confirmar porque si no el coach
                   no puede comprobar qué se leyó, y al guardar acaba en la nota del
                   día. Aquí no se edita: para eso está el editor del día. */
                <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-[color:var(--v2-fg)]">
                    <MIcon name="sticky_note_2" size={15} className="text-[color:var(--v2-muted)]" />
                    Nota del día
                  </p>
                  <p className="mt-1.5 whitespace-pre-line text-label leading-snug text-[color:var(--v2-muted)]">
                    {day.notes}
                  </p>
                  <p className="mt-1.5 text-nano text-[color:var(--v2-faint)]">
                    No es un entreno, así que se guarda como nota. Si el día ya tiene una, esta se
                    añade debajo.
                  </p>
                </div>
              ) : null}

              {proposedCount > 0 ? (
                <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-warn)]/40 bg-[color:var(--v2-warn-soft)] p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-[color:var(--v2-warn)]">
                        <MIcon name="edit_note" size={15} />
                        {proposedCount === 1
                          ? '1 valor lo hemos puesto nosotros'
                          : `${proposedCount} valores los hemos puesto nosotros`}
                      </p>
                      {/* Lo que hace que aceptarlos en bloque sea seguro: solo se
                          proponen CONVENCIONES del entrenador, nunca un número que
                          dependa del atleta. Decirlo aquí ahorra abrir línea por
                          línea para comprobar qué se tocó. */}
                      <p className="mt-1 max-w-prose text-label leading-snug text-[color:var(--v2-muted)]">
                        La foto no los enseñaba, así que van con tus valores por defecto: descanso,
                        RIR y rango de repeticiones. El ritmo, la carga y la zona no se proponen
                        nunca, que dependen del atleta. Cámbialos donde haga falta o dalos por
                        buenos.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onAcceptProposals}
                      className="v2-focus shrink-0 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-warn)]/50 px-3 py-1.5 text-label font-semibold text-[color:var(--v2-warn)] transition-colors hover:bg-[color:var(--v2-warn)]/15"
                    >
                      Aceptar todos los propuestos
                    </button>
                  </div>
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
                    session.blocks.map((block) => {
                      const cut = blockTruncation(day, block.uid);
                      const hidden = cut?.hidden_count ?? null;
                      return (
                        <div key={block.uid} className="space-y-2">
                          <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-4">
                            <BlockEditor
                              block={block}
                              proposedPaths={proposedPaths}
                              onChange={(next) => updateBlock(sessionIndex, next)}
                            />
                          </div>
                          {cut ? (
                            /* Lo que la fuente cortó se DICE. Es la diferencia entre
                               una semana incompleta y una semana incompleta que
                               nadie sabe que lo está. */
                            <div className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-warn)]/45 bg-[color:var(--v2-warn-soft)] px-3 py-2.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="flex items-start gap-1.5 text-xs leading-snug text-[color:var(--v2-warn)]">
                                  <MIcon name="content_cut" size={14} className="mt-px shrink-0" />
                                  {hidden == null
                                    ? 'La foto cortaba aquí: la tarjeta seguía y no se ve el resto.'
                                    : hidden === 1
                                      ? 'La foto cortaba aquí: quedaba 1 entrada más en la tarjeta.'
                                      : `La foto cortaba aquí: quedaban ${hidden} entradas más en la tarjeta.`}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => addManualLine(sessionIndex, block.uid)}
                                    className="v2-focus whitespace-nowrap rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-1 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
                                  >
                                    Añadir a mano
                                  </button>
                                  {onAddPhoto ? (
                                    <button
                                      type="button"
                                      onClick={onAddPhoto}
                                      className="v2-focus whitespace-nowrap rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-1 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
                                    >
                                      Subir foto del entreno
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
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
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-4 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="check" size={16} />
            Hecho
          </button>
        </footer>
      </div>
    </div>
  );
}
