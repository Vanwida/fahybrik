import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import { safeParsePrescription } from '@fahybrid/shared/domain/prescription';
import type { Block } from '@fahybrid/shared/schema/blocks';
import type {
  BlockUseModifiers,
  WeekDayPart,
  WeekDayPartConfig,
} from '@fahybrid/shared/schema/program-templates';
import { defaultConfigForPartFormat } from '@/lib/dashboard/constants/week-day-part-presets';
import { newBlockUid } from '@/lib/dashboard/programming/studio-types';

// Inserción de un bloque de la Biblioteca de Bloques (0037) en un día del
// week-studio. `source_block_id` + `block_modifiers` registran la procedencia y
// los ajustes por uso (no mutan la biblioteca). El `format` del bloque (enum
// propio) se mapea al `template_format` que entiende el resto del editor.
//
// UN BLOQUE SÍ TIENE EJERCICIOS — la premisa vieja ya no es cierta.
// Esto se escribió cuando un bloque era sólo texto verbatim de Pablo, así que
// materializaba `items: []` y metía la prescripción entera en `coach_note`. Hoy
// `block_exercises` guarda la estructura real: de los 99 bloques del método de
// Pablo, 121/121 de sus ejercicios llevan `exercise_id` Y `prescription_json`
// ("Front squat 6 series 7/6/6/6/5/5" = 6 series tipadas, no una frase). Tirar
// eso a `coach_note` convertía su método en texto muerto: la app no puede
// calcular analíticas con él, la IA no puede adaptarlo y el atleta no lo ve
// desglosado.
// Así que los ejercicios, cuando el llamante los carga, se mapean a `items[]`.
// `coach_note` se mantiene: es la voz literal de Pablo y la trazabilidad de
// dónde salió — el mismo patrón dual `params_json` / `prescription_json` que ya
// usa el resto del dominio.
//
// ⚠️ PERO el `items: []` DE CUANDO NO SE PASAN EJERCICIOS NO ES UN OLVIDO: es la
// mitad de un contrato vivo. Un part con `source_block_id` e `items` vacío es una
// REFERENCIA sin resolver, y `hydrateBlockParts` (lib/dashboard/coach/
// instantiate-program.ts) la resuelve AL ASIGNAR. En `slots_json` de las semanas
// ya escritas viven 39 parts así (verificado contra prod, jul-2026). Sembrar items
// siempre — o borrar la hidratación por no encontrarle llamadores nuevos — deja
// esas 39 piezas vacías en el entreno del atleta.
//
// El editor de día NO pasa por aquí: al insertar un bloque copia la estructura
// (`library-block-to-editor.ts`). Esta función es la vía de la IA + el lector de
// lo viejo. Las dos conviven a propósito.

// block.format → template_format. Espeja BLOCK_TO_TEMPLATE_FORMAT del
// materializador (instantiate-program). Cualquier valor no mapeado cae en el
// fallback neutro `tempo` (= bloque de texto sin timing impuesto).
const BLOCK_FORMAT_TO_TEMPLATE_FORMAT: Record<string, TemplateFormat> = {
  strength_block: 'strength_block',
  plyometric: 'strength_block',
  erg_intervals: 'intervals',
  run_intervals: 'intervals',
  zone2: 'tempo',
  metcon: 'amrap',
  race_sim: 'hyrox_sim',
  core_mobility: 'tempo',
  functional_circuit: 'circuit',
  tapering: 'tempo',
};

const DEFAULT_BLOCK_TEMPLATE_FORMAT: TemplateFormat = 'tempo';

export function templateFormatForBlock(block: Pick<Block, 'format'>): TemplateFormat {
  if (!block.format) return DEFAULT_BLOCK_TEMPLATE_FORMAT;
  return BLOCK_FORMAT_TO_TEMPLATE_FORMAT[block.format] ?? DEFAULT_BLOCK_TEMPLATE_FORMAT;
}

/** Línea legible con los modificadores aplicados, p.ej. "Intensidad 85% · 4 rondas". */
export function modifiersSummary(mods: BlockUseModifiers | undefined): string {
  if (!mods) return '';
  const parts: string[] = [];
  if (typeof mods.intensity_pct === 'number') parts.push(`Intensidad ${mods.intensity_pct}%`);
  if (mods.level) parts.push(`Nivel ${mods.level}`);
  if (typeof mods.duration_min === 'number') parts.push(`${mods.duration_min} min`);
  if (typeof mods.rounds === 'number') parts.push(`${mods.rounds} rondas`);
  return parts.join(' · ');
}

/**
 * Construye el `coach_note` que ve el atleta: prescripción verbatim del bloque
 * seguida (si hay) del resumen de modificadores. Recortado al máximo del
 * schema para no romper la validación de `weekDayPartSchema`.
 */
const COACH_NOTE_MAX = 2000;

export function buildBlockCoachNote(
  description: string,
  mods: BlockUseModifiers | undefined,
): string {
  const summary = modifiersSummary(mods);
  const body = summary ? `${description}\n\n— ${summary}` : description;
  return body.slice(0, COACH_NOTE_MAX);
}

/** config_json derivado de los modificadores aplicables al formato del bloque. */
function configFromModifiers(
  format: TemplateFormat,
  mods: BlockUseModifiers | undefined,
): WeekDayPartConfig {
  const base = defaultConfigForPartFormat(format);
  if (!mods) return base;
  const next: WeekDayPartConfig = { ...base };
  if (typeof mods.rounds === 'number') next.rounds = mods.rounds;
  if (typeof mods.duration_min === 'number') next.time_cap_seconds = mods.duration_min * 60;
  return next;
}

/**
 * Crea un `WeekDayPart` a partir de un bloque de biblioteca + modificadores.
 * Items vacío: el contenido vive como prosa en `coach_note` (Modelo A).
 */
/**
 * One `block_exercises` row, as the caller loaded it. Kept structural (not a DB
 * type) so this module stays client-safe and testable without a database.
 */
export interface LibraryBlockExercise {
  exercise_id: number | string;
  exercise_name: string;
  /** The typed dose. Validated here — an invalid one is dropped, never guessed. */
  prescription_json?: unknown;
  /** Legacy scalar mirror; the bridge downstream derives from it when needed. */
  params_json?: Record<string, unknown> | null;
  notes?: string | null;
}

/** Map the block's own exercises to part items, keeping the loader's order. */
function itemsFromBlockExercises(
  exercises: readonly LibraryBlockExercise[],
): WeekDayPart['items'] {
  return exercises.flatMap((ex) => {
    const id = Number(ex.exercise_id);
    // No catalog id = nothing to save. The gate ("nada se guarda sin ejercicio
    // del catálogo") holds here too.
    if (!Number.isFinite(id) || id <= 0) return [];
    const prescription = safeParsePrescription(ex.prescription_json);
    return [
      {
        uid: newBlockUid(),
        exercise_id: id,
        exercise_name: ex.exercise_name,
        ...(ex.params_json ? { params_json: ex.params_json } : {}),
        ...(prescription.success ? { prescription_json: prescription.data } : {}),
        ...(ex.notes ? { notes: ex.notes } : {}),
      },
    ];
  });
}

/**
 * Materialise a library block into a day part.
 *
 * `exercises` is optional: a caller that did not load them gets the old
 * text-only part (`items: []` + verbatim `coach_note`), so this stays additive.
 * A caller that loads them gets Pablo's method as STRUCTURE — which is the point.
 */
export function createPartFromLibraryBlock(
  block: Block,
  mods?: BlockUseModifiers,
  exercises?: readonly LibraryBlockExercise[],
): WeekDayPart {
  const format = templateFormatForBlock(block);
  const part: WeekDayPart = {
    uid: newBlockUid(),
    format,
    title: block.title.slice(0, 120),
    // Carry the block's methodology group forward so the studio can color-code
    // the inserted block (left accent bar + group chip). Library blocks always
    // have one (1–10); custom blocks set it from their preset (part-factory).
    methodology_group_id: block.methodology_group_id,
    config_json: configFromModifiers(format, mods),
    coach_note: buildBlockCoachNote(block.description, mods),
    items: exercises && exercises.length > 0 ? itemsFromBlockExercises(exercises) : [],
    source_block_id: block.id,
  };
  if (mods && Object.keys(mods).length > 0) part.block_modifiers = mods;
  return part;
}

/**
 * Recalcula `coach_note` y `config_json` de un part de biblioteca tras editar
 * sus modificadores, preservando la descripción verbatim original. Reconstruye
 * el texto a partir del cuerpo previo (todo lo anterior al separador "— ").
 */
export function applyModifiersToBlockPart(
  part: WeekDayPart,
  mods: BlockUseModifiers,
): WeekDayPart {
  const sepIndex = (part.coach_note ?? '').indexOf('\n\n— ');
  const description =
    sepIndex >= 0 ? (part.coach_note ?? '').slice(0, sepIndex) : (part.coach_note ?? '');
  const hasMods = Object.keys(mods).length > 0;
  return {
    ...part,
    config_json: configFromModifiers(part.format, mods),
    coach_note: buildBlockCoachNote(description, hasMods ? mods : undefined),
    block_modifiers: hasMods ? mods : undefined,
  };
}
