// ai-blocks-to-editor — CLIENT-SAFE conversion of the AI workout suggestion
// (#33) into the editor's block model. The suggest-workout endpoint returns
// `WeekDayPart[]` (the persistence shape: scalar `params_json` per item), but the
// session editor holds `EditorBlock[]` with a STRUCTURED `Prescription`. The
// canonical server mapping (editor-data.ts `mapPart`/`mapItem`) is `server-only`,
// so this is its client-safe twin — same field mapping, same `legacyItemToPrescription`
// bridge, so an inserted AI block is byte-for-byte an editor block. No new logic.

import {
  legacyItemToPrescription,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import type {
  WeekDayPart,
  WeekDayPartItem,
} from '@fahybrid/shared/schema/program-templates';
import type { EditorBlock, EditorItem, StructureGroup } from './editor-types';

// Structure-group heuristic — a client copy of editor-data.ts `inferGroup` (that
// module is server-only). A block has no explicit rail column; we infer it from
// the title/format so an inserted AI block lands in the right rail heading.
function inferGroup(title: string, format: string | null): StructureGroup {
  const t = `${title} ${format ?? ''}`.toLowerCase();
  if (/calent|warm|movilidad|mobility|activación/.test(t)) return 'calentamiento';
  if (/vuelta|cooldown|cool|estiramiento|stretch/.test(t)) return 'vuelta';
  return 'principal';
}

function toEditorItem(it: WeekDayPartItem): EditorItem {
  // Prefer the structured prescription when the source carried one (fast-mode
  // library items may); else derive it from the scalar params_json + notes, the
  // exact same bridge the editor loader uses.
  const prescription: Prescription =
    it.prescription_json ??
    legacyItemToPrescription({
      params_json: (it.params_json ?? null) as Record<string, unknown> | null,
      notes: it.notes ?? null,
    });
  return {
    uid: it.uid,
    exercise_id: Number(it.exercise_id),
    exercise_name: it.exercise_name,
    prescription,
    ...(it.notes != null ? { notes: it.notes } : {}),
  };
}

/** Convert ONE AI-suggested `WeekDayPart` into an editor `EditorBlock`. */
export function weekDayPartToEditorBlock(part: WeekDayPart, index = 0): EditorBlock {
  return {
    uid: part.uid || `ai-block-${index}`,
    title: part.title,
    format: part.format,
    methodology_group_id: part.methodology_group_id ?? null,
    group: inferGroup(part.title, part.format),
    source_block_id: part.source_block_id ?? null,
    items: (part.items ?? []).map(toEditorItem),
  };
}

/** Convert the AI suggestion's block list into editor blocks (order preserved). */
export function weekDayPartsToEditorBlocks(parts: WeekDayPart[]): EditorBlock[] {
  return parts.map((p, i) => weekDayPartToEditorBlock(p, i));
}
