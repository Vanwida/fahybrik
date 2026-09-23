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
import { Check, CircleAlert, CircleMinus, CirclePlus, NotebookPen, Scissors, StickyNote } from 'lucide-react';
import { Button, Sheet, StatusBadge, Input, type StatusTone } from '@/components/v2/ui';
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

const TONE_COPY: Record<ReturnType<typeof dayTone>, { label: string; tone: StatusTone }> = {
  rest: { label: 'Descanso', tone: 'neutral' },
  skipped: { label: 'No se importa', tone: 'neutral' },
  ok: { label: 'Tipado', tone: 'ok' },
  review: { label: 'Revisar', tone: 'warn' },
  incomplete: { label: 'Falta prescripción', tone: 'danger' },
  unresolved: { label: 'Falta ejercicio', tone: 'danger' },
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
    <Sheet
      open
      size="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={dayLabel}
      description={
        <span className="flex flex-col gap-1">
          <StatusBadge size="sm" tone={tone.tone} label={tone.label} />
          {day.stimulus ? (
            <span className="line-clamp-2">
              <span className="text-v2-faint">Estímulo · </span>
              {day.stimulus}
            </span>
          ) : null}
        </span>
      }
      footer={
        <>
          {hasSessions ? (
            <Button
              variant="ghost"
              icon={day.included ? CircleMinus : CirclePlus}
              onClick={() => onChangeIncluded(!day.included)}
              className="mr-auto"
            >
              {day.included ? 'No importar este día' : 'Importar este día'}
            </Button>
          ) : null}
          <Button variant="primary" icon={Check} onClick={onClose}>
            Hecho
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!hasSessions ? (
          <p className="t-body text-v2-muted">Día de descanso, nada que revisar.</p>
        ) : (
          <>
            {incompleteLines.length > 0 ? (
              <div className="rounded-panel bg-v2-danger-soft p-3">
                <p className="flex items-center gap-1.5 t-body-sm font-medium text-v2-danger">
                  <CircleAlert aria-hidden strokeWidth={2} className="size-3.5" />
                  {incompleteLines.length === 1
                    ? 'Falta prescribir 1 línea'
                    : `Faltan prescribir ${incompleteLines.length} líneas`}
                </p>
                <ul className="mt-2 space-y-1">
                  {incompleteLines.map((line) => (
                    <li key={line.uid} className="t-body-sm">
                      <span className="font-medium text-v2-fg">{line.exercise_name || 'Línea sin nombre'}</span>
                      <span className="text-v2-muted">
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
              <div className="rounded-panel bg-v2-surface-2 p-3">
                <p className="flex items-center gap-1.5 t-body-sm font-medium text-v2-fg">
                  <StickyNote aria-hidden strokeWidth={1.75} className="size-3.5 text-v2-muted" />
                  Nota del día
                </p>
                <p className="mt-1.5 whitespace-pre-line t-body-sm text-v2-muted">{day.notes}</p>
                <p className="mt-1.5 t-meta text-v2-faint">
                  No es un entreno: se guarda como nota, debajo de la que ya tenga el día.
                </p>
              </div>
            ) : null}

            {proposedCount > 0 ? (
              <div className="flex flex-wrap items-start justify-between gap-2 rounded-panel bg-v2-warn-soft p-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 t-body-sm font-medium text-v2-warn">
                    <NotebookPen aria-hidden strokeWidth={2} className="size-3.5" />
                    {proposedCount === 1
                      ? '1 valor lo hemos puesto nosotros'
                      : `${proposedCount} valores los hemos puesto nosotros`}
                  </p>
                  {/* Lo que hace que aceptarlos en bloque sea seguro: solo se
                      proponen CONVENCIONES del entrenador, nunca un número que
                      dependa del atleta. */}
                  <p className="mt-1 max-w-prose t-body-sm text-v2-muted">
                    Van con tus valores por defecto (descanso, RIR, rango de repeticiones). Ritmo, carga y zona no
                    se proponen nunca.
                  </p>
                </div>
                <Button size="sm" onClick={onAcceptProposals}>
                  Aceptar los propuestos
                </Button>
              </div>
            ) : null}

            {sessions.map((session, sessionIndex) => (
              <section key={session.uid} className="space-y-3">
                {sessions.length > 1 ? (
                  <h3 className="t-label text-v2-faint">
                    {SESSION_LABEL[sessionIndex] ?? `Entreno ${sessionIndex + 1}`}
                  </h3>
                ) : null}

                <label className="block space-y-1.5">
                  <span className="t-meta text-v2-muted">Título del entreno</span>
                  <Input
                    type="text"
                    size="lg"
                    value={session.focus ?? ''}
                    maxLength={120}
                    onChange={(e) => setFocus(sessionIndex, e.target.value)}
                    placeholder="p. ej. Fuerza · Tren inferior"
                  />
                </label>

                {session.blocks.length === 0 ? (
                  <p className="t-body-sm text-v2-muted">Este entreno no tiene bloques tipados.</p>
                ) : (
                  session.blocks.map((block) => {
                    const cut = blockTruncation(day, block.uid);
                    const hidden = cut?.hidden_count ?? null;
                    return (
                      <div key={block.uid} className="space-y-2">
                        <div className="rounded-panel border border-v2-border p-3">
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
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-ctl bg-v2-warn-soft px-3 py-2">
                            <p className="flex items-start gap-1.5 t-body-sm text-v2-warn">
                              <Scissors aria-hidden strokeWidth={2} className="mt-0.5 size-3.5 shrink-0" />
                              {hidden == null
                                ? 'La foto cortaba aquí: la tarjeta seguía y no se ve el resto.'
                                : hidden === 1
                                  ? 'La foto cortaba aquí: quedaba 1 entrada más en la tarjeta.'
                                  : `La foto cortaba aquí: quedaban ${hidden} entradas más en la tarjeta.`}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              <Button size="sm" onClick={() => addManualLine(sessionIndex, block.uid)}>
                                Añadir a mano
                              </Button>
                              {onAddPhoto ? (
                                <Button size="sm" onClick={onAddPhoto}>
                                  Subir foto del entreno
                                </Button>
                              ) : null}
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
    </Sheet>
  );
}
