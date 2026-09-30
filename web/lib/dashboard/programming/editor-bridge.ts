// Puente entre lo GUARDADO (`WeekDayPart`, lo que vive en slots_json y en las
// celdas de la rejilla) y el modelo del compositor detallado (`EditorBlock`, el
// que editan BlockEditor y sus controles de RIR / descanso / %RM). Puro y
// cliente-seguro: el panel lateral de una celda abre sus bloques en el
// compositor y guarda lo editado de vuelta en la celda, sin pasar por el editor
// de día viejo.
//
// Ida: la misma lectura que `editor-data.mapPart` (prescripción estructurada o,
// si falta, la derivada del legado). Vuelta: `serializeDay` — el serializador
// único, que conserva todo lo que el compositor no edita (config_json,
// modificadores, notas…) casando por uid.

import type { WeekDay, WeekDayPart, EditorSessionInput } from '@fahybrid/shared/schema/program-templates';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import { serializeDay } from '@/lib/dashboard/v2/editor-serialize';
import { itemHasExercise } from '@/lib/dashboard/v2/item-validity';
import { itemPrescription } from './progress-ops';

export function partToEditorBlock(part: WeekDayPart): EditorBlock {
  return {
    uid: part.uid,
    title: part.title,
    format: part.format,
    methodology_group_id: part.methodology_group_id ?? null,
    ...(part.group ? { group: part.group } : {}),
    source_block_id: part.source_block_id ?? null,
    optional: part.optional ?? false,
    ...(part.coach_note ? { coach_note: part.coach_note } : {}),
    circuit: part.circuit,
    items: (part.items ?? []).map<EditorItem>((it) => ({
      uid: it.uid,
      exercise_id: Number(it.exercise_id),
      exercise_name: it.exercise_name,
      notes: it.notes,
      prescription: itemPrescription(it),
    })),
  };
}

/** Bloques del compositor → partes guardables, conservando lo que el original ya tenía. */
export function editorBlocksToParts(blocks: EditorBlock[], originals: WeekDayPart[] = []): WeekDayPart[] {
  const session: EditorSessionInput = {
    uid: 'bridge',
    slot: 'am',
    blocks: blocks.map((b) => ({
      uid: b.uid,
      title: b.title.trim() || 'Bloque',
      format: (b.format ?? null) as EditorSessionInput['blocks'][number]['format'],
      methodology_group_id: b.methodology_group_id ?? null,
      ...(b.group ? { group: b.group } : {}),
      source_block_id: b.source_block_id ?? null,
      ...(b.coach_note ? { coach_note: b.coach_note } : {}),
      optional: b.optional ?? false,
      ...(b.circuit ? { circuit: b.circuit } : {}),
      items: b.items.map((it) => ({
        uid: it.uid,
        exercise_id: it.exercise_id,
        exercise_name: it.exercise_name,
        prescription: it.prescription,
        ...(it.notes ? { notes: it.notes } : {}),
      })),
    })),
  };
  const original: WeekDay = {
    day_of_week: 1,
    sessions: [{ kind: 'workout', template_id: null, blocks: originals }],
  };
  const day = serializeDay({ day_of_week: 1, sessions: [session], original });
  return day.sessions[0]?.blocks ?? [];
}

/**
 * Lo que SÍ se puede guardar de unos bloques en edición, sin renunciar a la regla
 * «nada sin ejercicio se persiste». Una línea sin ejercicio no se guarda (sigue en
 * el editor con su aviso); si ya existía guardada, se conserva su última versión
 * guardada en vez de borrarla. Un bloque nuevo cuyas líneas aún no tienen ejercicio
 * espera entero. `unsaved` cuenta las líneas que quedan fuera del guardado.
 */
export function persistableBlocks(
  blocks: EditorBlock[],
  originals: WeekDayPart[] = [],
): { blocks: EditorBlock[]; unsaved: number } {
  const previous = new Map(originals.map((p) => [p.uid, partToEditorBlock(p)]));
  const out: EditorBlock[] = [];
  let unsaved = 0;
  for (const block of blocks) {
    const before = previous.get(block.uid);
    const lastSaved = new Map((before?.items ?? []).map((it) => [it.uid, it]));
    const items = block.items.flatMap((it) => {
      if (itemHasExercise(it)) return [it];
      unsaved += 1;
      const old = lastSaved.get(it.uid);
      return old ? [old] : [];
    });
    if (block.items.length > 0 && items.length === 0 && !before) continue;
    out.push({ ...block, items });
  }
  return { blocks: out, unsaved };
}
