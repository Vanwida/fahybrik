// El CONTENIDO de una sesión, tal y como entra por el conector: bloques con
// líneas, y cada línea con su prescripción TIPADA. Cero texto libre como dosis.
//
// POR QUÉ ESTA FORMA Y NO OTRA. Es la del editor del panel (`EditorBlock` /
// `EditorItem`): un bloque con título y formato, y dentro N líneas, cada una con
// su ejercicio del catálogo y su `Prescription` del dominio. Y no se parece por
// gusto: se serializa con el MISMO serializador que guarda el editor
// (`serializeSessionSegments`), que es quien deriva `params_json` de la
// prescripción y quien se niega a persistir una línea sin ejercicio. Si el
// conector tuviera su propia forma, habría dos maneras de escribir un entreno y
// una de las dos se quedaría atrás.
//
// LOS TRES PORTONES, EN ESTE ORDEN, Y POR QUÉ ASÍ:
//
//   1. ZOD DEL DOMINIO (`prescriptionObjectSchemaRaw`) — está en el `inputSchema`
//      de la tool, así que el cliente recibe el esquema JSON completo de la
//      prescripción y lo rellena bien a la primera; lo que llegue torcido se
//      rechaza con el campo y lo que se esperaba.
//   2. EL CATÁLOGO — cada `exercise_id` tiene que ser visible para ESTE coach.
//      Inexistente y de otro club se rechazan IGUAL (decirlo distinto ya sería
//      confirmar que el ajeno existe). De la misma consulta sale lo que hace
//      falta después: el nombre (para la lectura de vuelta) y la MODALIDAD
//      intrínseca del ejercicio, que es con la que juzga el gate de completitud.
//   3. COMPLETITUD (`checkPrescriptionCompleteness`) — el mismo listón del editor
//      y del grid de importación. Se rechaza SOLO lo `blocking` (el atleta no
//      podría ejecutarlo); lo `advisory` es criterio del entrenador y vuelve como
//      AVISO en la respuesta, nunca como error: negarle un rodaje suave porque no
//      declaró el ritmo sería enmendarle la plana.
//
// LA NORMALIZACIÓN VA ANTES DE LOS PORTONES, NO DESPUÉS. La prescripción se
// canoniza (`safeParsePrescription`, la variante con transform: un alias antiguo
// entra y sale canónico) Y se le deriva el plano de su estructura
// (`withFlatFromStructure`) en `normalizeContentBlocks`, ANTES de juzgarla. Si no,
// los portones opinan sobre una prescripción distinta de la que se persiste — que
// es exactamente lo que pasó el 10-ago-2026: un fartlek dictado con la zona DENTRO
// de `structure` (y sin plano, porque el cliente no tiene por qué escribirlo)
// volvió con el aviso «Run — Sin objetivo: falta ritmo, zona, pulso o RPE» encima
// de un entreno que declaraba Z4 en cada tramo. Completitud, aviso y lectura de
// vuelta miran ahora la MISMA prescripción que acaba en la base de datos.

import { z } from 'zod';
import {
  blockingReasons,
  checkPrescriptionCompleteness,
  isExecutable,
  normalizeFormat,
  prescriptionGrammarLines,
  prescriptionObjectSchemaRaw,
  prescriptionToText,
  safeParsePrescription,
  withFlatFromStructure,
  type Modality,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import { templateFormat } from '@fahybrid/shared/schema/_primitives';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  joinCoachOverride,
  mergedExerciseContent,
  visibleToCoach,
} from '@/lib/exercises/coach-override';
import {
  serializeSessionSegments,
  type SessionSegmentInput,
} from '@/lib/dashboard/v2/editor-serialize';

/** Tope de bloques por sesión. Un entreno real no pasa de una docena. */
const MAX_BLOCKS = 20;
/** Tope de líneas por sesión. Espeja el `.max(120)` de `athleteDayContentSchema`:
 *  el mismo tope, dicho aquí para que el rechazo llegue con nombre de campo. */
const MAX_ITEMS = 120;
/** Formato de sesión cuando ningún bloque declara uno: la tabla de series. */
const FALLBACK_SESSION_FORMAT = 'sets';

// ── La forma que entra por el cable ──────────────────────────────────────────

const itemSchema = z
  .object({
    exercise_id: z
      .number()
      .int()
      .positive()
      .describe('El exercise_id del catálogo, tal y como lo devuelve search_library.'),
    prescription: prescriptionObjectSchemaRaw.describe(
      'La dosis TIPADA de esta línea. Nunca texto: medida × objetivo × modalidad.',
    ),
    notes: z
      .string()
      .max(4000)
      .optional()
      .describe('Matiz de ESTA línea para el atleta ("el último set a tope"). No es la dosis.'),
  })
  .describe('Una línea del bloque: un ejercicio con su dosis.');

const blockSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .max(120)
      .describe('Cómo se llama el bloque para el atleta: «Calentamiento», «Series», «Metcon».'),
    format: templateFormat
      .optional()
      .describe(
        'El formato del bloque. Sin esto se toma el scheme de la primera prescripción del bloque.',
      ),
    items: z.array(itemSchema).min(1).describe('Las líneas del bloque, en el orden en que se hacen.'),
  })
  .describe('Un bloque de la sesión: título, formato y sus líneas.');

/**
 * Los bloques de UNA sesión. Se declara como forma cruda (no como schema cerrado)
 * para poder inyectarla en el `inputSchema` de varias tools sin repetirla.
 */
export const contentBlocksArg = z
  .array(blockSchema)
  .min(1)
  .max(MAX_BLOCKS)
  .superRefine((blocks, ctx) => {
    const items = blocks.reduce((n, b) => n + b.items.length, 0);
    if (items > MAX_ITEMS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Demasiadas líneas en una sesión (${items}); el máximo es ${MAX_ITEMS}.`,
      });
    }
  });

export type ContentBlock = z.infer<typeof blockSchema>;

/**
 * Los mismos bloques con la prescripción YA canónica y con el plano derivado de su
 * estructura. Es lo único que ven los portones, el serializador y la lectura de
 * vuelta: el tipo obliga a normalizar antes de juzgar (ver la nota de arriba).
 */
export type NormalizedContentBlock = Omit<ContentBlock, 'items'> & {
  items: Array<Omit<ContentBlock['items'][number], 'prescription'> & { prescription: Prescription }>;
};

/**
 * La prescripción de cada línea en su forma canónica y con el plano completo.
 * Idempotente: normalizar lo ya normalizado no cambia nada (el transform de Zod
 * deja lo canónico igual, y `withFlatFromStructure` no toca una prescripción que
 * ya declara su dosis plana).
 */
export function normalizeContentBlocks(blocks: ContentBlock[]): NormalizedContentBlock[] {
  return blocks.map((block) => ({
    ...block,
    items: block.items.map((item) => ({
      ...item,
      prescription: withFlatFromStructure(normalizePrescription(item.prescription)),
    })),
  }));
}

/**
 * La gramática de la prescripción, dicha para el cliente DENTRO de la descripción
 * de la tool. Es la misma que aprende el importador y la que valida el Zod de
 * arriba (`grammar-prompt.ts` la deriva del propio esquema), así que un asistente
 * que lea esto no puede escribir una forma que el portón rechace.
 */
export function contentGrammar(): string {
  return [
    'CADA línea lleva su dosis TIPADA en `prescription` — jamás texto libre.',
    ...prescriptionGrammarLines(),
  ].join('\n');
}

// ── Portón 2: el catálogo ────────────────────────────────────────────────────

/** Lo que hace falta de un ejercicio para escribir y para leer de vuelta. */
export interface ContentExercise {
  exercise_id: number;
  /** El nombre que ve ESTE coach (su override gana sobre el del catálogo base). */
  name: string;
  /** `exercises.modality` (0053) — con la que juzga el gate, no la de la prescripción. */
  modality: Modality | null;
}

export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentError';
  }
}

/**
 * Los ejercicios de los bloques, resueltos contra lo que este coach puede ver.
 * Levanta `ContentError` con una frase accionable si alguno no existe o es de otro
 * club — los dos casos con la MISMA frase, y con la salida (search_library).
 */
export async function resolveContentExercises(params: {
  coach_id: number | bigint;
  /** Solo se leen los `exercise_id`, así que sirve cualquiera de las dos formas. */
  blocks: Array<{ items: Array<{ exercise_id: number }> }>;
  client?: Sql;
}): Promise<Map<number, ContentExercise>> {
  const client = params.client ?? defaultSql;
  const wanted = [
    ...new Set(params.blocks.flatMap((b) => b.items.map((it) => it.exercise_id))),
  ];

  const rows = await client<Array<{ id: string; name: string; modality: string | null }>>`
    select e.id::text as id, e.modality,
           ${mergedExerciseContent(client)}
    from exercises e
    ${joinCoachOverride(client, params.coach_id)}
    where e.id = any(${wanted}::bigint[])
      and ${visibleToCoach(client, params.coach_id)}
  `;

  const found = new Map<number, ContentExercise>();
  for (const r of rows) {
    found.set(Number(r.id), {
      exercise_id: Number(r.id),
      name: r.name,
      modality: (r.modality as Modality | null) ?? null,
    });
  }

  const missing = wanted.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ContentError(
      `Estos ejercicios no existen o no son tuyos: ${missing.join(', ')}. ` +
        'Búscalos con search_library (kind: "exercise") y usa el exercise_id que salga ahí.',
    );
  }
  return found;
}

// ── Portón 3: completitud ────────────────────────────────────────────────────

export interface ContentGateResult {
  /** Lo que NADIE puede publicar: el atleta no podría ejecutar la línea. */
  blocking: string[];
  /** Criterio del entrenador. Viaja como aviso en la respuesta, no como error. */
  avisos: string[];
}

/**
 * El mismo gate del editor y del grid de importación, línea a línea, con la
 * modalidad del CATÁLOGO (`exercise_modality`) — nunca la de la prescripción, que
 * es una pista que quien la escribió pudo omitir. Los dos listones salen de UNA
 * llamada por línea: `blocking` bloquea, `advisory` avisa.
 */
export function gateContent(
  blocks: NormalizedContentBlock[],
  exercises: Map<number, ContentExercise>,
): ContentGateResult {
  const blocking: string[] = [];
  const avisos: string[] = [];

  for (const block of blocks) {
    for (const item of block.items) {
      const exercise = exercises.get(item.exercise_id);
      const name = exercise?.name ?? `ejercicio ${item.exercise_id}`;
      const check = checkPrescriptionCompleteness(item.prescription, {
        modality: exercise?.modality ?? null,
      });
      if (!isExecutable(check)) {
        for (const reason of blockingReasons(check)) {
          blocking.push(`«${block.title}» · ${name}: ${reason}`);
        }
        continue;
      }
      for (const issue of check.issues) {
        if (issue.severity === 'advisory') avisos.push(`«${block.title}» · ${name}: ${issue.message}`);
      }
    }
  }

  return { blocking, avisos };
}

// ── De los bloques a las filas ───────────────────────────────────────────────

/**
 * Los bloques, serializados con el serializador del editor — el mismo que deriva
 * `params_json` de la prescripción, así que las dos columnas cuentan lo mismo.
 */
export function contentToSegments(
  blocks: NormalizedContentBlock[],
  exercises: Map<number, ContentExercise>,
): SessionSegmentInput[] {
  return serializeSessionSegments(
    blocks.map((block) => ({
      title: block.title,
      format: blockFormat(block),
      items: block.items.map((item) => ({
        exercise_id: item.exercise_id,
        exercise_name: exercises.get(item.exercise_id)?.name ?? '',
        prescription: item.prescription,
        ...(item.notes ? { notes: item.notes } : {}),
      })),
    })),
  );
}

/**
 * El formato de un bloque: el que declaró el coach, y si no, el `scheme` de su
 * primera prescripción — que ES el mismo eje (un bloque tiene un formato, y sus
 * líneas lo comparten; ver `PrescriptionScheme`). Nunca se inventa un tercero.
 */
function blockFormat(block: NormalizedContentBlock): string {
  if (block.format) return block.format;
  const scheme = block.items[0]?.prescription.scheme;
  return (scheme ? normalizeFormat(scheme) : undefined) ?? FALLBACK_SESSION_FORMAT;
}

/**
 * El formato de la SESIÓN (`templates.format`), derivado del primer bloque. Es lo
 * que la app usa para decir de qué va el entreno cuando no mira dentro; sale del
 * contenido, no de una plantilla ajena de la que se hubiera copiado.
 */
export function sessionFormatFor(blocks: NormalizedContentBlock[]): string {
  return blocks[0] ? blockFormat(blocks[0]) : FALLBACK_SESSION_FORMAT;
}

/**
 * La prescripción en su forma canónica. `safeParsePrescription` es el mismo Zod
 * que ya la validó en el `inputSchema`, ahora con su transform: aquí no puede
 * fallar salvo que el esquema de la tool y el del dominio se hubieran separado, y
 * en ese caso se dice en voz alta en vez de persistir a medias.
 */
function normalizePrescription(raw: ContentBlock['items'][number]['prescription']): Prescription {
  const parsed = safeParsePrescription(raw);
  if (!parsed.success) {
    throw new ContentError(`Prescripción inválida: ${readableZodError(parsed.error)}`);
  }
  return parsed.data as Prescription;
}

// ── Lectura de vuelta ────────────────────────────────────────────────────────

/** Una línea escrita como se lee: «Sentadilla 3×5 @ RIR 2 · descanso 2'30''». */
export function contentLine(
  item: NormalizedContentBlock['items'][number],
  exercises: Map<number, ContentExercise>,
): string {
  const name = exercises.get(item.exercise_id)?.name ?? `ejercicio ${item.exercise_id}`;
  const dose = prescriptionToText(item.prescription).trim();
  return dose ? `${name} ${dose}` : name;
}

/** Los bloques escritos, con sus líneas ya legibles — lo que se confirma. */
export function contentReadback(
  blocks: NormalizedContentBlock[],
  exercises: Map<number, ContentExercise>,
): Array<{ title: string; format: string; lines: string[] }> {
  return blocks.map((block) => ({
    title: block.title,
    format: blockFormat(block),
    lines: block.items.map((item) => contentLine(item, exercises)),
  }));
}

/**
 * Un error de Zod dicho para que el que llama se corrija: campo y qué se esperaba,
 * una línea por problema. El `message` crudo de Zod es un JSON de dos pantallas y
 * el asistente se pierde en él.
 */
export function readableZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(raíz)';
      return `${path}: ${issue.message}`;
    })
    .join(' · ');
}
