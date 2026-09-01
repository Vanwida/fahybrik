// import-provenance — DE DÓNDE SALE cada valor de una importación: leído de la
// fuente, propuesto por el importador, o ni siquiera llegó a verse.
//
// Vive aparte de `import-review` porque es otro eje. Aquel decide QUÉ entra
// (incluir, excluir, mapear semanas, bloquear el confirmar); este solo dice de
// dónde viene cada número. Y son datos de PROCESO: se pintan en la revisión, el
// coach los acepta o los cambia, y al confirmar desaparecen. Nada de esto se
// persiste — por eso no viaja dentro de la prescripción, sino al lado.
//
// NO conoce `ReviewDay` a propósito: trabaja sobre sesiones y listas sueltas, así
// que la dependencia va en un solo sentido (import-review → aquí) y este módulo
// se puede probar sin montar media revisión.

import {
  isScalarTarget,
  measureFloor,
  measureIsRange,
  setMeasure,
  setTarget,
  type Measure,
  type Prescription,
  type Target,
} from '@fahybrid/shared/domain/prescription';
import { OBJETIVO_LABEL } from '@/lib/dashboard/v2/editor-axes';
import type { EditorBlock, EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { FilledField, FilledFieldKind } from '@/lib/import/fill-defaults';

/**
 * Qué clase de hueco tapó el importador. Es EL MISMO tipo que emite el relleno
 * (`lib/import/fill-defaults`), no una copia: si allí nace una clase nueva, aquí
 * deja de compilar en vez de aparecer un día sin etiqueta en la pantalla.
 */
export type ProposedFieldKind = FilledFieldKind;

/** Un valor que el importador PROPUSO porque la fuente no lo enseñaba. */
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

/** Una tarjeta que la fuente cortó: hay trabajo que no llegó a enseñar. */
export interface BlockTruncation {
  /** El bloque que salió de esa tarjeta. */
  block_uid: string;
  /** Cuántas entradas dijo la fuente que escondía («4 More»), o null si no lo dijo. */
  hidden_count: number | null;
}

// ── Leer lo que manda el servidor ─────────────────────────────────────────────
// `ProposalDay` ya declara los dos campos (build-proposal.ts), pero llegan por la
// red dentro de un `as ImportProposal`: el tipo no es una garantía en ejecución,
// así que se validan igual. Lo que no se entienda, se tira.

/** Lo que de `FilledField` viaja por la red: el `reason` no se pinta, ni se pide. */
type FilledFieldWire = Pick<FilledField, 'item_uid' | 'field' | 'path'>;

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

function readFilledWire(raw: unknown): FilledFieldWire[] {
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

export function readTruncations(raw: unknown): BlockTruncation[] {
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

// ── Leer un valor por su ruta ─────────────────────────────────────────────────

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

function itemByUid(
  sessions: readonly EditorSession[],
  uid: string,
): EditorBlock['items'][number] | null {
  for (const session of sessions) {
    for (const block of session.blocks) {
      for (const item of block.items) {
        if (item.uid === uid) return item;
      }
    }
  }
  return null;
}

// ── La marca ──────────────────────────────────────────────────────────────────

/**
 * Congela lo propuesto: la propuesta ya viene rellenada, así que lo que hay ahora
 * en cada ruta es exactamente lo que se propuso. Lo que apunte a una línea o a una
 * ruta que no existen se descarta.
 */
export function readProposedFields(
  sessions: readonly EditorSession[],
  raw: unknown,
): ProposedField[] {
  const out: ProposedField[] = [];
  for (const filled of readFilledWire(raw)) {
    const item = itemByUid(sessions, filled.item_uid);
    if (!item) continue;
    const snapshot = valueAtPath(item.prescription, filled.path);
    if (snapshot === undefined) continue;
    out.push({ ...filled, snapshot });
  }
  return out;
}

/**
 * Las que SIGUEN siendo propuestas. Una cuyo valor ya no coincide con el que dejó
 * el importador es que el coach la editó, y editarla la da por confirmada: deja de
 * pintarse en discontinuo y deja de contar.
 */
export function pendingProposedFields(
  sessions: readonly EditorSession[],
  proposed: readonly ProposedField[],
): ProposedField[] {
  if (proposed.length === 0) return [];
  return proposed.filter((p) => {
    const item = itemByUid(sessions, p.item_uid);
    if (!item) return false;
    return sameValue(valueAtPath(item.prescription, p.path), p.snapshot);
  });
}

/**
 * Las rutas todavía propuestas, por línea y CON su etiqueta ya escrita
 * (`sets[0].rest_s` → «descanso 90 s»).
 *
 * Con la etiqueta dentro, el editor de bloque puede marcar el campo exacto Y
 * decirlo cuando su formulario no tiene ese campo, sin conocer una sola palabra
 * del importador: para él es «esta ruta no la escribiste tú, y se llama así».
 */
export function proposedPathsByItem(
  sessions: readonly EditorSession[],
  proposed: readonly ProposedField[],
): Map<string, ReadonlyMap<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const p of pendingProposedFields(sessions, proposed)) {
    const label = proposedFieldLabel(p.field, p.snapshot);
    const paths = out.get(p.item_uid);
    if (paths) paths.set(p.path, label);
    else out.set(p.item_uid, new Map([[p.path, label]]));
  }
  return out;
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
  // escriben en reloj, no en número suelto; y un objetivo relativo lleva una
  // referencia, no una cifra propia. El importador no propone ninguno de los
  // cuatro (solo RIR), así que aquí basta con no mentir sobre ellos.
  if (!isScalarTarget(target)) return label;
  const amount = target.value ?? target.min ?? target.max;
  return amount === undefined ? label : `${label} ${amount}`;
}

// ── Lo que la fuente cortó ────────────────────────────────────────────────────

/** Cuántas entradas dijo la fuente que escondía. Las tarjetas que se cortaron sin
 *  decir cuántas cuentan como 1: hay trabajo sin ver, y callarlo porque no sabemos
 *  el número sería justo lo que este aviso viene a evitar. */
export function hiddenEntryCount(truncations: readonly BlockTruncation[]): number {
  return truncations.reduce((n, t) => n + (t.hidden_count ?? 1), 0);
}

/** El corte de UN bloque (0 o 1 en la práctica). */
export function findTruncation(
  truncations: readonly BlockTruncation[],
  blockUid: string,
): BlockTruncation | null {
  return truncations.find((t) => t.block_uid === blockUid) ?? null;
}
