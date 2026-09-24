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

/** ¿Todas las líneas tienen ejercicio? (el mismo listón que el guardado). */
export function blocksAreSaveable(blocks: EditorBlock[]): boolean {
  return blocks.every((b) => b.items.every((it) => it.exercise_id != null && Number(it.exercise_id) > 0));
}
