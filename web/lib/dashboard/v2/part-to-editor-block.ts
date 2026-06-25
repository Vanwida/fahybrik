// part-to-editor-block — the ONE source of truth for mapping a domain
// `WeekDayPart` (the program-templates storage shape, with flat `params_json`
// items + optional structured `prescription_json`) into the v2 `EditorBlock`
// view model (structured `Prescription` per item + archetype-aware form routing).
//
// WHY THIS EXISTS: the server day-loader (editor-data.ts) and the client-side
// Pablo IA compose action both turn `WeekDayPart`s into `EditorBlock`s. The
// conversion is pure (no DB, no server-only deps) so it lives here, client-safe,
// and is imported by BOTH — instead of being duplicated or trapped behind the
// loader's `server-only` boundary. DRY: legacyItemToPrescription + inferGroup are
// reused, never re-implemented.

import { legacyItemToPrescription } from '@fahybrid/shared/domain/prescription';
import type {
  WeekDayPart,
  WeekDayPartItem,
} from '@fahybrid/shared/schema/program-templates';
import { archetypeForFormat } from '@/lib/dashboard/v2/archetypes';
import type { EditorBlock, EditorItem, StructureGroup } from '@/lib/dashboard/v2/editor-types';

// ── Block → structure group heuristic (rail headings) ────────────────────────
// A session has no explicit calentamiento/principal/vuelta column; we infer the
// rail group from the block's format/title so the editor groups blocks like the
// sketch. The first warmup-ish block falls to calentamiento, cooldown/mobility to
// vuelta, everything else to principal — a coach can still see all blocks.
export function inferGroup(title: string, format: string | null): StructureGroup {
  const t = `${title} ${format ?? ''}`.toLowerCase();
  if (/calent|warm|movilidad|mobility|activación/.test(t)) return 'calentamiento';
  if (/vuelta|cooldown|cool|estiramiento|stretch/.test(t)) return 'vuelta';
  return 'principal';
}

/** Map one part item → editor item, preferring the structured prescription. */
export function weekDayPartItemToEditorItem(it: WeekDayPartItem): EditorItem {
  return {
    uid: it.uid,
    exercise_id: it.exercise_id != null ? Number(it.exercise_id) : null,
    exercise_name: it.exercise_name,
    notes: it.notes,
    // Prefer the structured prescription; else derive from legacy params_json.
    prescription:
      it.prescription_json ??
      legacyItemToPrescription({
        params_json: (it.params_json ?? null) as Record<string, unknown> | null,
        notes: it.notes ?? null,
      }),
  };
}

/**
 * Map a domain `WeekDayPart` → the v2 `EditorBlock`. `index` only feeds a uid
 * fallback when the part carries none. The block's `archetype_id` is re-derived
 * from its `format` so the archetype-first tailored form renders on insert; it is
 * client-only (the serializer ignores it) so passing it here is harmless on the
 * server loader too.
 */
export function weekDayPartToEditorBlock(part: WeekDayPart, index = 0): EditorBlock {
  return {
    uid: part.uid || `block-${index}`,
    title: part.title,
    format: part.format,
    archetype_id: archetypeForFormat(part.format)?.id,
    methodology_group_id: part.methodology_group_id ?? null,
    group: inferGroup(part.title, part.format),
    source_block_id: part.source_block_id ?? null,
    items: (part.items ?? []).map((it) => weekDayPartItemToEditorItem(it)),
  };
}
