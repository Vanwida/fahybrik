import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import type { Block } from '@fahybrid/shared/schema/blocks';
import type {
  BlockUseModifiers,
  WeekDayPart,
  WeekDayPartConfig,
} from '@fahybrid/shared/schema/program-templates';
import { defaultConfigForPartFormat } from '@/lib/dashboard/constants/week-day-part-presets';
import { newBlockUid } from '@/lib/dashboard/programming/studio-types';

// Inserción de un bloque de la Biblioteca de Bloques (0037) en un día del
// week-studio. Un bloque es una prescripción VERBATIM de Pablo (texto), no una
// lista de ejercicios → lo representamos como un `WeekDayPart` cuyo
// `coach_note` lleva el texto íntegro + el resumen de modificadores aplicados.
// `source_block_id` + `block_modifiers` registran la procedencia y los ajustes
// por uso (no mutan la biblioteca). El `format` del bloque (enum propio) se
// mapea al `template_format` que entiende el resto del editor/materializador.

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
export function createPartFromLibraryBlock(
  block: Block,
  mods?: BlockUseModifiers,
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
    items: [],
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
