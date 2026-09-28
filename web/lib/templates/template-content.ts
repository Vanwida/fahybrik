// EL serializador de una plantilla: bloques con líneas → filas de
// `template_segments` + filas de `template_blocks`.
//
// UN SOLO ESCRITOR (docs/DECISIONS.md, 2026-09-28). Un entreno libre del atleta y
// uno programado por el coach tienen que ser el MISMO objeto, y antes no lo eran:
// había un escritor por superficie y cada uno guardaba la sesión a su manera
// (un AMRAP del coach como `for_time`, el circuito de la biblioteca sin sus
// rondas, el libre con `block_position` desde 1, `params_json` vacío y el
// calentamiento como fuerza). Ahora todos los caminos que escriben una plantilla
// —editor de biblioteca, edición de un día del atleta, materializar una semana,
// el conector, los tests del coach y el entreno libre— pasan por aquí, y las
// reglas viven una vez:
//
//   · `block_position` y `position` desde 0, contiguos, en el orden de los bloques
//     y de sus líneas. Un bloque sin líneas no deja fila.
//   · `block_format` = el formato elegido del bloque (`resolveBlockFormat`): un
//     AMRAP es `amrap` aunque el bloque naciera como WOD `for_time`.
//   · `prescription_json` en su forma canónica (`canonicalPrescription`) y la
//     modalidad del EJERCICIO manda sobre la de la prescripción (mig 0053).
//   · `params_json` SIEMPRE derivado de la prescripción. Solo una línea heredada
//     sin prescripción conserva el suyo (no se inventa lo que no está escrito).
//   · Circuito: rondas, pacing y los dos descansos en `template_blocks`, una vez
//     por bloque; las estaciones no los repiten (DECISIONS 2026-08-07).
//
// Isomórfico a propósito (sin `server-only`): lo usan el editor en el navegador
// para montar el cuerpo de la petición y el servidor para volver a serializar lo
// que llega — la frontera de confianza aplica las mismas reglas que el cliente.

import {
  blockingReasons,
  canonicalPrescription,
  checkPrescriptionCompleteness,
  formatMeta,
  formatsByFamily,
  isExecutable,
  normalizeFormat,
  prescriptionToParams,
  TEMPLATE_FORMAT_VALUES,
  type FormatParam,
  type Modality,
  type Prescription,
  type PrescriptionRole,
  type WorkoutFormat,
} from '@fahybrid/shared/domain/prescription';
import type { CircuitConfig } from '@fahybrid/shared/schema/program-templates';
import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';

/** Una línea sin ejercicio no se guarda NUNCA en silencio (A3). */
export class InvalidAuthoringLineError extends Error {
  constructor(public count: number) {
    super(
      count === 1
        ? '1 línea sin ejercicio. Elígelo del catálogo o bórrala para guardar.'
        : `${count} líneas sin ejercicio. Elígelas del catálogo o bórralas para guardar.`,
    );
    this.name = 'InvalidAuthoringLineError';
  }
}

// ── Entrada: el modelo de bloques ───────────────────────────────────────────

export interface TemplateContentLine {
  exercise_id: number | bigint | null;
  exercise_name?: string;
  /** `null` = línea heredada sin prescripción tipada: se guarda su `params_json`. */
  prescription: Prescription | null;
  params_json?: Record<string, unknown> | null;
  notes?: string | null;
  /** `exercises.modality` del catálogo. Manda sobre la de la prescripción (0053). */
  exercise_modality?: Modality | null;
}

export interface TemplateContentBlock {
  title: string | null;
  /**
   * El formato que declara quien escribe (valor del enum `template_format`).
   * `null` = declarado SIN formato (se respeta: un test de calibración no lleva);
   * ausente (`undefined`) = quien escribe no lo sabe y se deriva de sus líneas
   * (el entreno libre, el conector sin formato).
   */
  format?: string | null;
  /** Solo un bloque Circuito (`format === 'circuit'`). */
  circuit?: CircuitConfig | null;
  items: TemplateContentLine[];
}

// ── Salida: las filas ───────────────────────────────────────────────────────

export interface TemplateSegmentRow {
  position: number;
  block_position: number;
  exercise_id: number;
  exercise_name: string;
  block_format: TemplateFormat | null;
  block_title: string | null;
  params_json: Record<string, unknown>;
  notes: string | null;
  prescription_json: Prescription | null;
}

/** Una fila de `template_blocks`: la config de UN bloque Circuito. */
export interface TemplateBlockRow {
  block_position: number;
  circuit: CircuitConfig;
}

export interface TemplateContent {
  segments: TemplateSegmentRow[];
  blocks: TemplateBlockRow[];
}

// ── El formato del bloque ───────────────────────────────────────────────────

/**
 * Los formatos que elige el selector «Formato» de un bloque de componentes (WOD,
 * EMOM…): la familia metcon del catálogo salvo la simulación HYROX (tiene su
 * plantilla) más las series. Derivado del catálogo, sin lista paralela.
 */
export const COMPONENT_FORMATS: readonly WorkoutFormat[] = [
  ...formatsByFamily('metcon').filter((f) => f !== 'hyrox_sim'),
  'intervals',
];

const COMPONENT_FORMAT_SET = new Set<string>(COMPONENT_FORMATS);
const TEMPLATE_FORMAT_SET = new Set<string>(TEMPLATE_FORMAT_VALUES);

const STRUCTURAL_PARAMS: readonly FormatParam[] = ['rounds', 'work_s', 'rest_s', 'total_s', 'start', 'increment'];

/** ¿Lleva la línea solo los campos de estructura que su formato admite? */
function paramsFitScheme(p: Prescription, scheme: WorkoutFormat): boolean {
  const allowed = new Set<FormatParam>(formatMeta(scheme)?.params ?? []);
  return STRUCTURAL_PARAMS.every((param) => p[param] === undefined || allowed.has(param));
}

/**
 * El formato que el EDITOR del coach guarda para un bloque cuyas líneas comparten
 * `scheme`, cuando quien escribe no declara ninguno (el libre, el conector sin
 * formato). Es el vocabulario con el que el editor reabre el bloque en su
 * formulario: un continuo es `tempo` (Carrera continua), una fuerza de un solo
 * ejercicio es `strength_block` y la de varios `sets` (apply-block-type.ts).
 */
export function blockFormatForScheme(scheme: WorkoutFormat, lineCount: number): TemplateFormat {
  if (scheme === 'steady') return 'tempo';
  if (scheme === 'sets') return lineCount === 1 ? 'strength_block' : 'sets';
  return scheme;
}

/**
 * El formato ELEGIDO del bloque.
 *
 *   1. Un bloque de componentes cuyas líneas comparten un formato del selector
 *      (y solo los campos de ese formato) ES ese formato: el selector cambia el
 *      `scheme` de todas sus líneas, y el bloque sigue. Un AMRAP no se guarda
 *      como `for_time` (el móvil puntuaba por tiempo).
 *   2. Si no, el que declara quien escribe, si el enum lo conoce.
 *   3. Sin declarar (`undefined`): el de sus líneas, si todas comparten uno.
 *   4. Declarado sin formato (`null`) o con uno que el enum no conoce: ninguno.
 */
export function resolveBlockFormat(
  declared: string | null | undefined,
  lines: ReadonlyArray<{ prescription: Prescription | null }>,
): TemplateFormat | null {
  const known = declared && TEMPLATE_FORMAT_SET.has(declared) ? (declared as TemplateFormat) : null;
  const prescriptions = lines.map((l) => l.prescription).filter((p): p is Prescription => p != null);
  const schemes = new Set(prescriptions.map((p) => normalizeFormat(p.scheme)).filter(Boolean));
  const shared = schemes.size === 1 && prescriptions.length === lines.length ? [...schemes][0]! : null;

  if (
    known &&
    COMPONENT_FORMAT_SET.has(known) &&
    shared &&
    COMPONENT_FORMAT_SET.has(shared) &&
    prescriptions.every((p) => paramsFitScheme(p, shared))
  ) {
    return shared;
  }
  if (known) return known;
  if (declared !== undefined) return null;
  return shared ? blockFormatForScheme(shared, lines.length) : null;
}

// ── Circuito ────────────────────────────────────────────────────────────────

/** Lo que es del BLOQUE en un circuito y no se repite en cada estación. */
function withoutCircuitFields(p: Prescription): Prescription {
  const out = { ...p };
  delete out.rounds;
  delete out.rounds_max;
  delete out.work_s;
  delete out.rest_s;
  return out;
}

/** Columnas de `template_blocks` ↔ `CircuitConfig`. */
export interface TemplateBlockColumns {
  rounds: number;
  pacing: string;
  work_seconds: number | null;
  rest_between_stations_seconds: number | null;
  rest_between_rounds_seconds: number | null;
}

export function circuitToColumns(c: CircuitConfig): TemplateBlockColumns {
  return {
    rounds: c.rounds,
    pacing: c.pacing.kind,
    work_seconds: c.pacing.kind === 'por_reloj' ? c.pacing.work_seconds : null,
    rest_between_stations_seconds: c.rest_between_stations_seconds ?? null,
    rest_between_rounds_seconds: c.rest_between_rounds_seconds ?? null,
  };
}

export function circuitFromColumns(r: TemplateBlockColumns): CircuitConfig {
  return {
    rounds: r.rounds,
    pacing:
      r.pacing === 'por_reloj' && r.work_seconds != null
        ? { kind: 'por_reloj', work_seconds: r.work_seconds }
        : { kind: 'por_tarea' },
    ...(r.rest_between_stations_seconds != null
      ? { rest_between_stations_seconds: r.rest_between_stations_seconds }
      : {}),
    ...(r.rest_between_rounds_seconds != null
      ? { rest_between_rounds_seconds: r.rest_between_rounds_seconds }
      : {}),
  };
}

// ── EL serializador ─────────────────────────────────────────────────────────

function lineHasExercise(line: TemplateContentLine): boolean {
  return line.exercise_id != null && Number(line.exercise_id) > 0;
}

/** La prescripción de una línea tal y como se guarda: la modalidad del ejercicio manda. */
function storedPrescription(line: TemplateContentLine): Prescription | null {
  if (!line.prescription) return null;
  const withModality =
    line.exercise_modality && line.prescription.modality !== line.exercise_modality
      ? { ...line.prescription, modality: line.exercise_modality }
      : line.prescription;
  return canonicalPrescription(withModality);
}

/** Bloques → filas. Ver la cabecera del fichero para las reglas. */
export function serializeTemplateContent(blocks: readonly TemplateContentBlock[]): TemplateContent {
  const invalid = blocks.reduce((n, b) => n + b.items.filter((it) => !lineHasExercise(it)).length, 0);
  if (invalid > 0) throw new InvalidAuthoringLineError(invalid);

  const segments: TemplateSegmentRow[] = [];
  const blockRows: TemplateBlockRow[] = [];
  let blockPosition = 0;

  for (const block of blocks) {
    if (block.items.length === 0) continue;
    const lines = block.items.map((it) => ({ line: it, prescription: storedPrescription(it) }));
    const format = resolveBlockFormat(block.format, lines);
    const circuit = format === 'circuit' && block.circuit ? block.circuit : null;
    const title = block.title?.trim() || null;

    for (const { line, prescription: stored } of lines) {
      const prescription = stored && circuit ? withoutCircuitFields(stored) : stored;
      segments.push({
        position: segments.length,
        block_position: blockPosition,
        exercise_id: Number(line.exercise_id),
        exercise_name: line.exercise_name ?? '',
        block_format: format,
        block_title: title,
        params_json: prescription ? prescriptionToParams(prescription) : { ...(line.params_json ?? {}) },
        notes: line.notes != null && line.notes !== '' ? line.notes : null,
        prescription_json: prescription,
      });
    }
    if (circuit) blockRows.push({ block_position: blockPosition, circuit });
    blockPosition += 1;
  }

  return { segments, blocks: blockRows };
}

/**
 * Filas → bloques: lo que llega por la API (segmentos + config de circuito) se
 * vuelve a agrupar para pasarlo OTRA VEZ por el serializador en el servidor.
 * Agrupa por `block_position` y ordena por `position`, como lo lee el editor.
 */
export function blocksFromRows(
  segments: ReadonlyArray<{
    position: number;
    block_position: number;
    block_format?: string | null;
    block_title?: string | null;
    exercise_id: number;
    params_json?: Record<string, unknown> | null;
    notes?: string | null;
    prescription_json?: Prescription | null;
  }>,
  circuits: ReadonlyArray<TemplateBlockRow> = [],
): TemplateContentBlock[] {
  const byPosition = new Map<number, typeof segments[number][]>();
  for (const seg of [...segments].sort((a, b) => a.block_position - b.block_position || a.position - b.position)) {
    const list = byPosition.get(seg.block_position) ?? [];
    list.push(seg);
    byPosition.set(seg.block_position, list);
  }
  const circuitByPosition = new Map(circuits.map((c) => [c.block_position, c.circuit]));
  return [...byPosition.entries()].map(([position, rows]) => ({
    title: rows[0]?.block_title ?? null,
    format: rows[0]?.block_format ?? null,
    circuit: circuitByPosition.get(position) ?? null,
    items: rows.map((r) => ({
      exercise_id: r.exercise_id,
      prescription: r.prescription_json ?? null,
      params_json: r.params_json ?? null,
      notes: r.notes ?? null,
    })),
  }));
}

// ── El control de completitud mínima ────────────────────────────────────────

/** El papel de una línea para el control: el calentamiento no pide objetivo. */
function roleOf(format: TemplateFormat | null): PrescriptionRole {
  if (format === 'warmup') return 'calentamiento';
  if (format === 'cooldown') return 'vuelta';
  return 'principal';
}

/**
 * Las líneas que el atleta NO podría ejecutar tal y como están escritas (el
 * listón EJECUTABLE: sin dosis, un formato con tope sin tope, una serie sin
 * medida). Lo que es criterio del coach —objetivo, descanso— no se pide: nunca se
 * obliga a una estructura que el modelo no exige. Una línea heredada sin
 * prescripción tampoco se juzga: no hay nada tipado que juzgar.
 */
export function undosedContentLines(
  content: TemplateContent,
  modalityByExercise: ReadonlyMap<number, Modality | null> = new Map(),
): string[] {
  const out: string[] = [];
  for (const seg of content.segments) {
    if (!seg.prescription_json) continue;
    const check = checkPrescriptionCompleteness(seg.prescription_json, {
      modality: modalityByExercise.get(seg.exercise_id) ?? null,
      role: roleOf(seg.block_format),
    });
    if (isExecutable(check)) continue;
    const where = seg.block_title ? `«${seg.block_title}» · ` : '';
    const name = seg.exercise_name || `ejercicio ${seg.exercise_id}`;
    for (const reason of blockingReasons(check)) out.push(`${where}${name}: ${reason}`);
  }
  return out;
}
