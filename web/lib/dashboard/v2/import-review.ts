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
  measureFloor,
  measureIsRange,
  setMeasure,
  setTarget,
  type Measure,
  type Prescription,
  type Target,
} from '@fahybrid/shared/domain/prescription';
import { OBJETIVO_LABEL } from '@/lib/dashboard/v2/editor-axes';
import type { EditorSession, EditorBlock } from '@/lib/dashboard/v2/editor-types';
import type { ProposalFlag, ProposalDay, ProposalWeek, ImportProposal } from '@/lib/import/build-proposal';
import type { FilledField, FilledFieldKind } from '@/lib/import/fill-defaults';

/** A container week the coach can map an imported week onto (Fork B target). */
export interface MicroWeekRef {
  id: string;
  index: number;
  label: string;
  session_count: number;
}

// ── LEÍDO frente a PROPUESTO ──────────────────────────────────────────────────
// Una captura recorta, y hay valores que el coach escribe una vez y repite por
// costumbre (el descanso entre series, lo cerca del fallo que va una serie, las
// repeticiones cuando se ven las series pero no el número). El importador los
// rellena con SUS valores por defecto y los marca. Aquí solo vive la MARCA.
//
// La distinción es SOLO de la importación: se pinta en la revisión, el coach la
// acepta o la cambia, y al confirmar desaparece — `buildConfirmBody` manda la
// prescripción a secas y nada de esto se persiste. Por eso no viaja dentro de la
// prescripción, sino al lado.

/**
 * Qué clase de hueco tapó el importador. Es EL MISMO tipo que emite el relleno
 * (`lib/import/fill-defaults`), no una copia: si allí nace una clase nueva, aquí
 * deja de compilar en vez de aparecer un día sin etiqueta en la pantalla.
 */
export type ProposedFieldKind = FilledFieldKind;

/** Un valor que el importador PROPUSO porque la foto no lo enseñaba. */
export interface ProposedField {
  item_uid: string;
  field: ProposedFieldKind;
  /** Ruta dentro de la prescripción del item: `sets[0].rest_s`, `sets[0].measure`… */
  path: string;
  /**
   * El valor tal y como lo dejó el importador. Si hoy hay otro en esa ruta es que
   * el coach ya lo tocó, y entonces deja de ser una propuesta: es suyo. Así
   * «editar un propuesto lo da por confirmado» sale del propio dato y no de tener
   * que escuchar cada tecla del editor.
   */
  snapshot: unknown;
}

/** Una tarjeta que la fuente cortó: hay trabajo que la foto no llegó a enseñar. */
export interface BlockTruncation {
  /** El bloque que salió de esa tarjeta. */
  block_uid: string;
  /** Cuántas entradas dijo la fuente que escondía («4 More»), o null si no lo dijo. */
  hidden_count: number | null;
}

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
// Son campos OPCIONALES de la propuesta: el Excel y el texto pegado no los traen y
// una propuesta sin ellos se revisa exactamente igual que siempre. Se leen a mano y
// con desconfianza (vienen por la red) en vez de darlos por buenos.

/** Lo que de `FilledField` viaja por la red: el `reason` no se pinta, así que ni
 *  se pide. La forma la sigue mandando el que rellena, no esta pantalla. */
type FilledFieldWire = Pick<FilledField, 'item_uid' | 'field' | 'path'>;

interface TruncationWire {
  block_uid: string;
  hidden_count: number | null;
}

interface PhotoProposalExtras {
  filled?: readonly FilledFieldWire[];
  truncations?: readonly TruncationWire[];
}

/** Las clases válidas, en forma de registro EXHAUSTIVO a propósito: si aparece
 *  una cuarta, esto deja de compilar. Con una lista suelta se colaría en silencio. */
const PROPOSED_FIELD_KINDS: Record<ProposedFieldKind, true> = {
  reps: true,
  rest: true,
  intensity: true,
};

function isProposedFieldKind(value: unknown): value is ProposedFieldKind {
  // `Object.hasOwn` y no `in`: `'toString' in {}` es cierto por el prototipo.
  return typeof value === 'string' && Object.hasOwn(PROPOSED_FIELD_KINDS, value);
}

function photoExtras(d: ProposalDay): PhotoProposalExtras {
  // La propuesta tipada aún no declara estos dos campos porque solo los emite la
  // rama de foto. La conversión es el precio de leer algo aditivo; lo que llega se
  // valida entero justo debajo, así que un servidor que mande basura no pinta nada.
  return d as ProposalDay & PhotoProposalExtras;
}

function readFilled(raw: unknown): FilledFieldWire[] {
  if (!Array.isArray(raw)) return [];
  const out: FilledFieldWire[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { item_uid, field, path } = entry as Record<string, unknown>;
    if (typeof item_uid !== 'string' || typeof path !== 'string') continue;
    if (!isProposedFieldKind(field)) continue;
    out.push({ item_uid, field, path });
  }
  return out;
}

function readTruncations(raw: unknown): BlockTruncation[] {
  if (!Array.isArray(raw)) return [];
  const out: BlockTruncation[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { block_uid, hidden_count } = entry as Record<string, unknown>;
    if (typeof block_uid !== 'string') continue;
    out.push({
      block_uid,
      hidden_count:
        typeof hidden_count === 'number' && Number.isFinite(hidden_count) && hidden_count > 0
          ? Math.trunc(hidden_count)
          : null,
    });
  }
  return out;
}

/** `sets[3].rest_s` → índice + campo. Solo esas tres rutas: son las únicas que el
 *  importador rellena, y aceptar una ruta arbitraria sería inventarse un lenguaje. */
const SET_PATH_RE = /^sets\[(\d+)\]\.(measure|target|rest_s)$/;

function valueAtPath(prescription: Prescription, path: string): unknown {
  const parsed = SET_PATH_RE.exec(path);
  if (!parsed) return undefined;
  const set = prescription.sets?.[Number(parsed[1])];
  if (!set) return undefined;
  // measure/target se leen por el accesor del dominio: una prescripción vieja los
  // guarda como alias sueltos (`reps`, `rir`) y leer el campo a pelo los perdería.
  if (parsed[2] === 'measure') return setMeasure(set);
  if (parsed[2] === 'target') return setTarget(set);
  return set.rest_s;
}

/** Comparación estable de valores pequeños y planos (un Measure, un Target, un
 *  número). Ordena las claves para que reconstruir el mismo objeto en otro orden
 *  no se lea como una edición del coach. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) =>
    sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

function itemByUid(sessions: EditorSession[], uid: string): EditorBlock['items'][number] | null {
  for (const session of sessions) {
    for (const block of session.blocks) {
      for (const item of block.items) {
        if (item.uid === uid) return item;
      }
    }
  }
  return null;
}

function fromProposalDay(d: ProposalDay): ReviewDay {
  const sessions = d.sessions.map((s) => structuredClone(s));
  const extras = photoExtras(d);
  // El valor de la propuesta se congela AQUÍ: la propuesta ya viene rellenada, así
  // que lo que hay ahora en cada ruta es exactamente lo que se propuso.
  const proposed: ProposedField[] = [];
  for (const filled of readFilled(extras.filled)) {
    const item = itemByUid(sessions, filled.item_uid);
    if (!item) continue;
    const snapshot = valueAtPath(item.prescription, filled.path);
    if (snapshot === undefined) continue;
    proposed.push({ ...filled, snapshot });
  }
  return {
    day_of_week: d.day_of_week,
    dow: d.dow,
    stimulus: d.stimulus,
    sessions,
    flags: d.flags,
    proposed,
    truncations: readTruncations(extras.truncations),
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

// ── Lo propuesto, en vivo ─────────────────────────────────────────────────────

/**
 * Las propuestas que SIGUEN siendo propuestas. Una cuyo valor ya no coincide con
 * lo que dejó el importador es que el coach la editó, y editarla la da por
 * confirmada: deja de pintarse en discontinuo y deja de contar.
 */
export function dayProposedFields(day: ReviewDay): ProposedField[] {
  if (day.proposed.length === 0) return [];
  return day.proposed.filter((p) => {
    const item = itemByUid(day.sessions, p.item_uid);
    if (!item) return false;
    return sameValue(valueAtPath(item.prescription, p.path), p.snapshot);
  });
}

/** Da por buenas TODAS las propuestas del día de una vez. No cambia ni un valor:
 *  lo que cambia es de quién son. */
export function acceptDayProposals(day: ReviewDay): ReviewDay {
  return day.proposed.length === 0 ? day : { ...day, proposed: [] };
}

/** Lo propuesto de un item concreto, para pintarlo junto a su línea. */
export function itemProposedFields(day: ReviewDay, itemUid: string): ProposedField[] {
  return dayProposedFields(day).filter((p) => p.item_uid === itemUid);
}

/** Cómo se lee una propuesta: «descanso 90 s», «8-12 reps», «RIR 2». */
export function proposedFieldLabel(field: ProposedFieldKind, value: unknown): string {
  if (field === 'rest') {
    return typeof value === 'number' ? `descanso ${Math.round(value)} s` : 'descanso';
  }
  if (field === 'reps') {
    const measure = value as Measure | undefined;
    if (!measure || measure.kind !== 'reps') return 'repeticiones';
    return measureIsRange(measure)
      ? `${measureFloor(measure)}-${measure.max} reps`
      : `${measureFloor(measure)} reps`;
  }
  const target = value as Target | undefined;
  if (!target) return 'intensidad';
  const label = OBJETIVO_LABEL[target.kind] ?? 'intensidad';
  // Peso corporal no lleva cifra; ritmo y tiempo tope la llevan en segundos y se
  // escriben en reloj, no en número suelto. El importador no propone ninguno de los
  // tres (solo RIR), así que aquí basta con no mentir sobre ellos.
  if (target.kind === 'bodyweight' || target.kind === 'pace' || target.kind === 'time_cap') {
    return label;
  }
  const amount = target.value ?? target.min ?? target.max;
  return amount === undefined ? label : `${label} ${amount}`;
}

// ── Lo que la fuente cortó ────────────────────────────────────────────────────

/** Cuántas entradas dijo la fuente que escondía, sumando el día. Las tarjetas que
 *  se cortaron sin decir cuántas cuentan como 1: hay trabajo sin ver, y callarlo
 *  porque no sabemos el número sería justo lo que este aviso viene a evitar. */
export function dayHiddenCount(day: ReviewDay): number {
  return day.truncations.reduce((n, t) => n + (t.hidden_count ?? 1), 0);
}

/** Las tarjetas cortadas de UN bloque (0 o 1 en la práctica). */
export function blockTruncation(day: ReviewDay, blockUid: string): BlockTruncation | null {
  return day.truncations.find((t) => t.block_uid === blockUid) ?? null;
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
 *  trabajo sin ver o con valores que él no escribió no se puede pintar de verde. */
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
