// library-block-to-editor — convierte UN bloque de la Biblioteca en los
// `EditorBlock[]` que el editor de día inserta en una sesión. Es el post-proceso
// de `loadBlockEditorModel` (editor-data.ts), que ya hace el trabajo pesado:
// agrupar `block_exercises` por `block_position` y quedarse con la prescripción
// ESTRUCTURADA (degradando a legacy solo si falta). Aquí NO se re-mapea nada de
// eso — se arreglan las tres cosas que ese loader no puede saber desde la
// biblioteca, porque solo importan al INSERTAR:
//
//   1. uids FRESCOS. El loader emite uids deterministas (`be-block-0`,
//      `be-item-0`): insertar el MISMO bloque dos veces en un día colisionaría.
//   2. TÍTULOS de verdad. `block_exercises.block_title` es NULL en las 121 filas
//      importadas del coach, así que el loader cae a "Bloque 1..4" — insertar el
//      bloque 52 daría cuatro bloques llamados "Bloque 1..4", inútil. Ver la
//      cadena en `derivePartTitle`.
//   3. PROCEDENCIA. `source_block_id` + `methodology_group_id` en cada pieza.
//
// Client-safe a propósito (sin `server-only`): la ruta lo usa en el servidor y los
// tests lo prueban sin base de datos. Mismo patrón que `ai-blocks-to-editor.ts`.
//
// La inserción COPIA la estructura en el día. No es una referencia viva: editar
// el bloque en la Biblioteca después NO cambia los días donde ya se insertó.

import { templateFormat, type TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import { newBlockUid } from '@/lib/dashboard/programming/studio-types';
import { templateFormatForBlock } from '@/lib/dashboard/programming/block-to-part';
import type { BlockEditorModel, EditorBlock, EditorItem } from './editor-types';

/**
 * ¿El título de esta pieza es el relleno de `loadBlockEditorModel` (block_title
 * NULL) o un nombre real del coach?
 *
 * El loader colapsa `block_title ?? \`Bloque ${i + 1}\``, así que el único rastro
 * es la cadena literal. Aproximación consciente: si un coach llegara a llamar a
 * una pieza exactamente "Bloque 1" (en la posición 1), la trataríamos como
 * relleno y derivaríamos el título — que en ese caso es MEJOR (el nombre del
 * ejercicio o el del bloque), así que el fallo degrada hacia lo correcto.
 */
function isFallbackPartTitle(title: string, index: number): boolean {
  return title === `Bloque ${index + 1}`;
}

/**
 * El título de UNA pieza, en cadena de más específico a menos:
 *   1. `block_title` real → el coach ya la nombró.
 *   2. el bloque es de UNA sola pieza → `blocks.title`, que es más rico
 *      ("6r Hang power clean 70%" en vez de "Hang Power Clean").
 *   3. la pieza tiene UN solo ejercicio → su nombre ("Rowing", "SkiErg", "Run").
 *   4. resto → `${blocks.title} · ${i + 1}`.
 *
 * Verificado contra los 72 bloques tipados del coach (119 piezas): 44 caen en la
 * 2, 73 en la 3, 2 en la 4 (bloques 389/390, cuya primera pieza tiene 2
 * ejercicios). Ninguna queda vacía ni en texto libre.
 */
function derivePartTitle(model: BlockEditorModel, part: EditorBlock, index: number): string {
  if (!isFallbackPartTitle(part.title, index)) return part.title;
  if (model.blocks.length === 1) return model.title;
  const onlyItem = part.items.length === 1 ? part.items[0] : null;
  if (onlyItem?.exercise_name) return onlyItem.exercise_name;
  return `${model.title} · ${index + 1}`;
}

/**
 * Desambigua los títulos repetidos DENTRO de una misma inserción. La regla 3 los
 * produce de verdad: el bloque 53 es row + ski + bike + run + run → dos piezas
 * llamadas "Run"; el 389, cuatro. Dos bloques con el mismo nombre en un día son
 * tan inútiles como "Bloque 1..4", que es justo lo que la cadena arregla.
 *
 * Se sufija con el mismo vocabulario que la regla 4 (` · N`) y a TODAS las
 * repeticiones, no solo a la segunda: "Run · 4" / "Run · 5" se leen como pareja;
 * "Run" / "Run · 5" parece un error.
 */
function disambiguate(titles: string[]): string[] {
  const seen = new Map<string, number>();
  for (const t of titles) seen.set(t, (seen.get(t) ?? 0) + 1);
  return titles.map((t, i) => ((seen.get(t) ?? 0) > 1 ? `${t} · ${i + 1}` : t));
}

/**
 * El `format` de la pieza, traducido al vocabulario que entiende el DÍA.
 *
 * `blocks.format` es TEXTO LIBRE con el vocabulario del IMPORTADOR del plan del
 * coach (zone2, run_intervals, race_sim, metcon, plyometric, tapering…), mientras
 * que `WeekDayPart.format` es el enum `templateFormat` (for_time | amrap | steady
 * | intervals | strength_block | tempo | …). Son DOS ejes distintos, y la
 * inserción cruza de uno al otro.
 *
 * Sin esto, guardar el día devuelve 400: `zone2` no está en el enum, y 87 de los
 * 99 bloques del coach usan el vocabulario del importador. El bloque entraba en el
 * editor y luego "Guardar día" fallaba para siempre — verificado contra la BD real.
 *
 * La traducción NO se reinventa: `templateFormatForBlock` (block-to-part.ts) ya es
 * la fuente de esta correspondencia y la comparte con el materializador
 * (`instantiate-program`). Aquí solo se reutiliza, para que un bloque insertado a
 * mano y uno materializado por el sistema aterricen con el MISMO formato.
 *
 * Si la pieza ya trae un `templateFormat` válido (los bloques que el coach crea en
 * la Biblioteca guardan `block_format` en ESE vocabulario), se respeta tal cual.
 */
function toDayFormat(partFormat: string | null, blockFormat: string | null): TemplateFormat {
  if (partFormat && templateFormat.safeParse(partFormat).success) {
    return partFormat as TemplateFormat;
  }
  return templateFormatForBlock({ format: blockFormat });
}

/**
 * ¿Se puede insertar este bloque en un día?
 *
 * Solo si está TIPADO (tiene `block_exercises`). 27 de los 99 bloques del coach
 * son solo PROSA: toda su sustancia vive verbatim en `blocks.description`, y
 * `EditorBlock` no tiene dónde guardarla (`serializePart` solo conserva el
 * `coach_note` del original casado por uid). Insertarlos perdería en SILENCIO lo
 * que escribió el coach, así que el rail los enseña deshabilitados y la ruta
 * devuelve 409.
 */
export function isInsertableBlockModel(model: BlockEditorModel): boolean {
  return model.blocks.length > 0;
}

/** uid fresco por ítem; la prescripción ESTRUCTURADA pasa intacta (no se re-deriva). */
function toFreshItem(item: EditorItem): EditorItem {
  return { ...item, uid: newBlockUid() };
}

/**
 * Un bloque de biblioteca → las piezas que se añaden a la sesión, en orden de
 * `block_position`. Un bloque NO es siempre una pieza: 28 de los 72 tipados del
 * coach dan de 2 a 6 (el 52, "10' row z2", es en realidad row + ski + bike + run).
 *
 * Un bloque solo-prosa devuelve [] (ver `isInsertableBlockModel`).
 */
export function libraryBlockToEditorBlocks(model: BlockEditorModel): EditorBlock[] {
  if (!isInsertableBlockModel(model)) return [];
  const titles = disambiguate(model.blocks.map((p, i) => derivePartTitle(model, p, i)));
  return model.blocks.map((part, index) => ({
    uid: newBlockUid(),
    title: titles[index] ?? part.title,
    format: toDayFormat(part.format, model.format),
    methodology_group_id: model.methodology_group_id,
    // Procedencia: de qué bloque de la biblioteca salió esta pieza. `serializePart`
    // lo persiste, así que el día recuerda su origen aunque el coach lo edite.
    source_block_id: model.block_id,
    // `group` (calentamiento/principal/vuelta) se OMITE a propósito: el editor de
    // día es agnóstico — una lista plana que el coach nombra y ordena — igual que
    // `createBlockFromArchetype`. Además el que trae el loader se infirió del
    // título de relleno, que aquí acabamos de sustituir. Al recargar, `mapPart` lo
    // vuelve a inferir del título REAL, así que omitirlo no pierde nada.
    items: part.items.map(toFreshItem),
  }));
}
