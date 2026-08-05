// import-review — CLIENT-SAFE view model + wire builders for the #28 importer's
// review step (Fork C: grid + drill-in). Turns the server's typed ImportProposal
// into an editable per-week/per-day model the coach reviews, computes each day's
// honest tone (rest / ok / review / unresolved), and builds the CONFIRM body:
//   · the explicit week mapping (Fork B — each imported week → a container week);
//   · the approved days' sessions in the #33 day-save wire shape;
//   · the synonyms to learn, reconstructed from the ORIGINAL flags + the coach's
//     final resolutions (an unresolved token that now points at an exercise).
//
// Types come from the server module via `import type` (erased at compile — the
// `server-only` side-effect never reaches the client bundle).

import {
  checkPrescriptionCompleteness,
  isExecutable,
  blockingReasons,
} from '@fahybrid/shared/domain/prescription';
import {
  hiddenEntryCount,
  findTruncation,
  pendingProposedFields,
  proposedPathsByItem,
  readProposedFields,
  readTruncations,
  type BlockTruncation,
  type ProposedField,
} from '@/lib/dashboard/v2/import-provenance';
import type { EditorSession, EditorBlock } from '@/lib/dashboard/v2/editor-types';
import type { ProposalFlag, ProposalDay, ProposalWeek, ImportProposal } from '@/lib/import/build-proposal';

/** A container week the coach can map an imported week onto (Fork B target). */
export interface MicroWeekRef {
  id: string;
  index: number;
  label: string;
  session_count: number;
}

// LEÍDO frente a PROPUESTO, y lo que la fuente cortó: los tipos y la lógica pura
// viven en `./import-provenance`. Aquí solo se cuelgan del día y se le pregunta
// por él, que es como los usa la pantalla.

export interface ReviewDay {
  day_of_week: number;
  dow: string;
  stimulus: string | null;
  /**
   * Editable in the drawer; EMPTY = rest / empty (nothing to write). Two entries
   * = double session (am + pm), slot positional as everywhere else.
   */
  sessions: EditorSession[];
  flags: ProposalFlag[];
  /** Lo que el importador rellenó por el coach. Vacío = la fuente lo traía todo. */
  proposed: ProposedField[];
  /** Las tarjetas que la fuente cortó. Vacío = no se cortó nada. */
  truncations: BlockTruncation[];
  /**
   * Lo que la fuente traía y NO era entreno: un «Semana 12», un «Control test
   * salto». Es información del coach, así que no se tira — va a la nota del día
   * (`WeekDay.notes`) al confirmar. Ausente = la fuente no traía ninguna.
   */
  notes?: string;
  /** Coach's selection — false = leave this day out of the import (not written,
   *  not counted, its unresolved lines stop blocking confirm). Rest days ignore it. */
  included: boolean;
}

export interface ReviewWeek {
  /** The xlsx week number (1..12). */
  week: number;
  sheet: string;
  fell_back: boolean;
  /** Fork B — the container week template this imported week writes into. */
  target_week_id: string | null;
  /** Coach's selection — false = leave the WHOLE week out (no mapping required). */
  included: boolean;
  days: ReviewDay[];
}

/** A day's honest tone for the grid. */
export type DayTone = 'rest' | 'skipped' | 'ok' | 'review' | 'incomplete' | 'unresolved';

// ── Lo que añade la rama de FOTO ──────────────────────────────────────────────
// El servidor los declara en `ProposalDay` (build-proposal.ts), pero llegan por la
// red dentro de un `as ImportProposal`, así que se validan igual al leerlos. El
// Excel y el texto pegado no los traen: una propuesta sin ellos se revisa
// exactamente igual que siempre.

function fromProposalDay(d: ProposalDay): ReviewDay {
  const sessions = d.sessions.map((s) => structuredClone(s));
  return {
    day_of_week: d.day_of_week,
    dow: d.dow,
    stimulus: d.stimulus,
    sessions,
    flags: d.flags,
    proposed: readProposedFields(sessions, d.filled),
    truncations: readTruncations(d.truncations),
    ...(typeof d.notes === 'string' && d.notes.trim() ? { notes: d.notes.trim() } : {}),
    included: true,
  };
}

function fromProposalWeek(w: ProposalWeek, defaultTarget: string | null): ReviewWeek {
  return {
    week: w.week,
    sheet: w.sheet,
    fell_back: w.fell_back,
    target_week_id: defaultTarget,
    included: true,
    days: w.days.map(fromProposalDay),
  };
}

/**
 * Build the editable review model. Default mapping = imported week i → the
 * container week at ordinal position i (the coach can re-map any of them). Extra
 * imported weeks beyond the container's length start unmapped (must be resolved).
 */
export function buildReviewModel(
  proposal: ImportProposal,
  microWeeks: MicroWeekRef[],
): ReviewWeek[] {
  const byIndex = [...microWeeks].sort((a, b) => a.index - b.index);
  return proposal.weeks.map((w, i) => fromProposalWeek(w, byIndex[i]?.id ?? null));
}

/** True when a line points at a real catalog exercise. */
function itemResolved(item: EditorBlock['items'][number]): boolean {
  return item.exercise_id != null && Number(item.exercise_id) > 0;
}

/** Items with no catalog exercise across a session (the hard save blocker). */
function sessionUnresolvedCount(session: EditorSession | null): number {
  if (!session) return 0;
  let n = 0;
  for (const block of session.blocks) {
    for (const item of block.items) {
      if (!itemResolved(item)) n += 1;
    }
  }
  return n;
}

/** A line that names an exercise but prescribes no work the athlete could do. */
export interface IncompleteLine {
  uid: string;
  exercise_name: string;
  /** Why it is not executable, coach-facing (from the domain gate). */
  reasons: string[];
}

/**
 * Lines that are RESOLVED but not executable — a "Back Squat" with no series, a
 * "Run" with no distance. The second half of the confirm gate: importing a name
 * with no dose writes a session the athlete cannot do, and until now the grid
 * called that "0 sin resolver" and let it through.
 *
 * Only the domain's BLOCKING issues count. An imported line legitimately omits
 * the intensity (Pablo's own workbook does it on ~130 of 369 lines: bodyweight
 * pull-ups have no %RM, an easy jog needs no pace) — the importer TRANSCRIBES
 * what the coach wrote, so `isExecutable`, never the strict `ok`. See the TWO
 * BARS note in shared/domain/prescription/completeness.ts.
 *
 * A line with no exercise is skipped here: it already blocks as "sin ejercicio"
 * and that is the first thing to fix, so each line reports ONE next action and
 * the two counters never double-count the same line.
 *
 * Modality comes from the prescription — client-side there is no catalog to ask,
 * and picking an exercise stamps its intrinsic modality onto the line (mig 0053,
 * `withPickedExercise`). Unknown modality falls back to the universal floor.
 */
export function sessionIncompleteLines(session: EditorSession | null): IncompleteLine[] {
  if (!session) return [];
  const out: IncompleteLine[] = [];
  for (const block of session.blocks) {
    for (const item of block.items) {
      if (!itemResolved(item)) continue;
      const check = checkPrescriptionCompleteness(item.prescription);
      if (isExecutable(check)) continue;
      out.push({
        uid: item.uid,
        exercise_name: item.exercise_name,
        reasons: blockingReasons(check),
      });
    }
  }
  return out;
}

function sessionIncompleteCount(session: EditorSession | null): number {
  return sessionIncompleteLines(session).length;
}

// ── Day-level rollups ─────────────────────────────────────────────────────────
// Un día tiene N sesiones (2 = doble sesión), así que los contadores del gate
// suman TODAS. Cuando el día era una sola sesión esto era el mismo número; con
// doble sesión, mirar solo la primera dejaría pasar sin revisar la mitad de la
// semana — justo el tipo de agujero silencioso que el gate existe para tapar.

/** Todas las líneas sin dosis del día (todas sus sesiones). */
export function dayIncompleteLines(day: ReviewDay): IncompleteLine[] {
  return day.sessions.flatMap((s) => sessionIncompleteLines(s));
}

// ── Lo propuesto y lo cortado, colgados del día ───────────────────────────────
// La lógica es de `./import-provenance`; aquí solo se le pregunta por un día, que
// es la forma en que lo usa la pantalla.

/** Las propuestas que SIGUEN siendo propuestas: editar una la da por confirmada. */
export function dayProposedFields(day: ReviewDay): ProposedField[] {
  return pendingProposedFields(day.sessions, day.proposed);
}

/** Las rutas todavía propuestas por línea, para que el editor marque el campo. */
export function dayProposedPaths(day: ReviewDay): Map<string, ReadonlyMap<string, string>> {
  return proposedPathsByItem(day.sessions, day.proposed);
}

/** Da por buenas TODAS las propuestas del día de una vez. No cambia ni un valor:
 *  lo que cambia es de quién son. */
export function acceptDayProposals(day: ReviewDay): ReviewDay {
  return day.proposed.length === 0 ? day : { ...day, proposed: [] };
}

/** Cuántas entradas dijo la fuente que escondía, sumando el día. */
export function dayHiddenCount(day: ReviewDay): number {
  return hiddenEntryCount(day.truncations);
}

/** El corte de UN bloque del día (0 o 1 en la práctica). */
export function blockTruncation(day: ReviewDay, blockUid: string): BlockTruncation | null {
  return findTruncation(day.truncations, blockUid);
}

function dayUnresolvedCount(day: ReviewDay): number {
  return day.sessions.reduce((n, s) => n + sessionUnresolvedCount(s), 0);
}

function dayIncompleteCount(day: ReviewDay): number {
  return day.sessions.reduce((n, s) => n + sessionIncompleteCount(s), 0);
}

/** True when this day would actually be written on confirm. */
function dayWrites(week: ReviewWeek, day: ReviewDay): boolean {
  return week.included && day.included && day.sessions.length > 0;
}

/** The day's tone: rest → grey, excluded (day or its whole week) → skipped, any
 *  unresolved exercise → red, any line with no dose → red, any review-confidence
 *  line → amber, else green. Ordered by what the coach must fix FIRST: pick the
 *  exercise, then prescribe it. Recomputed from the LIVE session so fixing a line
 *  turns a day green in place.
 *
 *  Lo cortado por la fuente y lo propuesto por el importador también son ámbar: no
 *  impiden guardar (el coach puede querer la semana tal cual), pero un día con
 *  trabajo sin ver o con valores que él no escribió no se puede pintar de verde.
 *
 *  ── OJO CON `confidence`, que tiene TRES valores ────────────────────────────
 *  La comparación de abajo es `=== 'review'` a propósito, y NO `!== 'detected'`.
 *  `incomplete` significa que la gramática supo el ejercicio pero no su dosis, y
 *  ese es el estado NORMAL de una foto: una tarjeta lista «Band Pull Apart» sin
 *  decir series ni reps. No es un error y casi siempre lo tapa el relleno por
 *  defecto, que además lo deja marcado como propuesto. Si esto se relajara a
 *  `!== 'detected'`, cada importación por foto saldría en ámbar por definición y
 *  el aviso dejaría de significar nada.
 *
 *  Lo que SÍ atrapa una `incomplete` que nadie pudo tapar es el gate del dominio
 *  (`dayIncompleteCount`, dos líneas más arriba): mira la prescripción de verdad,
 *  no lo que dijo la gramática, así que una línea que sigue sin trabajo sale roja
 *  y bloquea el confirmar. Los dos caminos no se pisan: uno juzga la lectura, el
 *  otro el resultado. */
export function dayTone(day: ReviewDay, weekIncluded = true): DayTone {
  if (day.sessions.length === 0) return 'rest';
  if (!weekIncluded || !day.included) return 'skipped';
  if (dayUnresolvedCount(day) > 0) return 'unresolved';
  if (dayIncompleteCount(day) > 0) return 'incomplete';
  if (day.truncations.length > 0) return 'review';
  if (dayProposedFields(day).length > 0) return 'review';
  if (day.flags.some((f) => f.confidence === 'review')) return 'review';
  return 'ok';
}

/** Líneas que la gramática NO pudo tipar en absoluto: se conservó su texto y hay
 *  que mirarlas. Es lo único que pide OJOS del coach entre lo ámbar — un hueco
 *  rellenado solo pide un visto bueno. */
export function dayReviewLineCount(day: ReviewDay): number {
  return day.flags.filter((f) => f.confidence === 'review').length;
}

/** Total unresolved-exercise lines across the INCLUDED days (the confirm gate).
 *  Excluding a day/week removes its unresolved lines from the count — one odd
 *  exercise never blocks importing the rest. */
export function totalUnresolved(weeks: ReviewWeek[]): number {
  return weeks.reduce(
    (acc, w) =>
      acc +
      w.days.reduce((a, d) => a + (dayWrites(w, d) ? dayUnresolvedCount(d) : 0), 0),
    0,
  );
}

/** Total lines that name an exercise but prescribe no work, across the INCLUDED
 *  days (the second confirm gate). Excluding a day/week removes its lines from
 *  the count, exactly like `totalUnresolved`. */
export function totalIncomplete(weeks: ReviewWeek[]): number {
  return weeks.reduce(
    (acc, w) =>
      acc +
      w.days.reduce((a, d) => a + (dayWrites(w, d) ? dayIncompleteCount(d) : 0), 0),
    0,
  );
}

/** Every non-rest INCLUDED day that would be written (for the "N días" readout). */
export function totalWritableDays(weeks: ReviewWeek[]): number {
  return weeks.reduce((acc, w) => acc + w.days.filter((d) => dayWrites(w, d)).length, 0);
}

/** Non-rest days the coach chose to leave out (day excluded, or its week). */
export function totalExcludedDays(weeks: ReviewWeek[]): number {
  return weeks.reduce(
    (acc, w) => acc + w.days.filter((d) => d.sessions.length > 0 && !dayWrites(w, d)).length,
    0,
  );
}

/** INCLUDED weeks that still lack a container-week mapping (blocks confirm).
 *  An excluded week needs no destination. */
export function unmappedWeekCount(weeks: ReviewWeek[]): number {
  return weeks.filter((w) => w.days.some((d) => dayWrites(w, d)) && !w.target_week_id).length;
}

// ── Wire builders ─────────────────────────────────────────────────────────────

interface WireItem {
  uid: string;
  exercise_id: number | null;
  exercise_name: string;
  prescription: EditorBlock['items'][number]['prescription'];
  notes?: string;
}

function blockToWire(block: EditorBlock) {
  return {
    uid: block.uid,
    title: block.title,
    format: block.format,
    methodology_group_id: block.methodology_group_id ?? null,
    source_block_id: block.source_block_id ?? null,
    items: block.items.map(
      (it): WireItem => ({
        uid: it.uid,
        exercise_id: it.exercise_id,
        exercise_name: it.exercise_name,
        prescription: it.prescription,
        ...(it.notes ? { notes: it.notes } : {}),
      }),
    ),
  };
}

function sessionToWire(session: EditorSession) {
  return {
    uid: session.uid,
    slot: session.slot,
    ...(session.focus && session.focus.trim() ? { focus: session.focus.trim() } : {}),
    blocks: session.blocks.map(blockToWire),
  };
}

export interface ConfirmBody {
  microcycle_id: number;
  weeks: Array<{
    target_week_template_id: number;
    day_of_week: number;
    /** N sesiones del día. Posicional: [0]=am, [1]=pm. */
    sessions: Array<ReturnType<typeof sessionToWire>>;
    /** La nota que traía la fuente, si traía alguna. El servidor decide cómo se
     *  junta con la que el día ya tuviera: nunca machaca la del coach. */
    notes?: string;
  }>;
  synonyms: Array<{ term: string; exercise_id: number }>;
}

/**
 * Build the CONFIRM request. Only INCLUDED non-rest days of INCLUDED weeks with a
 * mapped target week are sent. Synonyms are reconstructed from the ORIGINAL flags:
 * a token that was unresolved and now points at an exercise is learned (deduped by
 * normalized-ish term+id pair) — an excluded day teaches nothing. Rest days,
 * excluded days/weeks and unmapped weeks are silently skipped here — the caller
 * gates on `unmappedWeekCount` / `totalUnresolved` / `totalIncomplete` before
 * enabling confirm.
 */
export function buildConfirmBody(microcycleId: string, weeks: ReviewWeek[]): ConfirmBody {
  const out: ConfirmBody = { microcycle_id: Number(microcycleId), weeks: [], synonyms: [] };
  const seen = new Set<string>();

  for (const w of weeks) {
    if (!w.included || !w.target_week_id) continue;
    const target = Number(w.target_week_id);
    for (const d of w.days) {
      if (d.sessions.length === 0 || !d.included) continue;
      out.weeks.push({
        target_week_template_id: target,
        day_of_week: d.day_of_week,
        sessions: d.sessions.map(sessionToWire),
        ...(d.notes ? { notes: d.notes } : {}),
      });

      const flagByUid = new Map(d.flags.map((f) => [f.uid, f]));
      for (const block of d.sessions.flatMap((s) => s.blocks)) {
        for (const item of block.items) {
          const f = flagByUid.get(item.uid);
          const token = f?.exercise_token.trim();
          if (
            f?.unresolved_exercise &&
            token &&
            item.exercise_id != null &&
            Number(item.exercise_id) > 0
          ) {
            const key = `${token.toLowerCase()}::${Number(item.exercise_id)}`;
            if (!seen.has(key)) {
              seen.add(key);
              out.synonyms.push({ term: token, exercise_id: Number(item.exercise_id) });
            }
          }
        }
      }
    }
  }
  return out;
}
