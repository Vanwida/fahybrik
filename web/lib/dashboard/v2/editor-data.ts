import 'server-only';

// editor-data — server loaders for the library editors (an entreno or a block
// into the compositor model). Each REUSES an existing real loader
// (getTemplateDetail, getBlockById) and maps it into the client-safe view
// models in editor-types.ts. No new tables, no invented data: an empty result
// degrades to an empty model (the UI shows an EmptyState), never throws.

import { getTemplateDetail } from '@/lib/dashboard/coach/templates';
import { getBlockById, getBlockExerciseRowsForEdit } from '@/lib/dashboard/coach/blocks';
import {
  legacyItemToPrescription,
  safeParsePrescription,
  type Modality,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import type { BlockEditorModel, EditorBlock, EditorItem, SessionEditorModel, StructureGroup } from './editor-types';

// ── Block → structure group heuristic (rail headings) ────────────────────────
// A session has no explicit calentamiento/principal/vuelta column; we infer the
// rail group from the block's format/title so the editor groups blocks like the
// sketch. The first warmup-ish block falls to calentamiento, cooldown/mobility
// to vuelta, everything else to principal — a coach can still see all blocks.
function inferGroup(title: string, format: string | null): StructureGroup {
  const t = `${title} ${format ?? ''}`.toLowerCase();
  if (/calent|warm|movilidad|mobility|activación/.test(t)) return 'calentamiento';
  if (/vuelta|cooldown|cool|estiramiento|stretch/.test(t)) return 'vuelta';
  return 'principal';
}

// ── SCREEN 5 · load a session template into the editor model ─────────────────
export async function loadSessionEditorModel(params: {
  coach_id: number | bigint;
  template_id: number | bigint;
}): Promise<SessionEditorModel | null> {
  const detail = await getTemplateDetail({
    coach_id: params.coach_id,
    template_id: params.template_id,
  });
  if (!detail) return null;

  const blocks: EditorBlock[] = detail.blocks.map((b, i) => {
    const title = b.block_title ?? `Bloque ${i + 1}`;
    return {
      uid: `tpl-block-${b.block_position}`,
      title,
      format: b.block_format ?? detail.format,
      group: inferGroup(title, b.block_format ?? detail.format),
      items: b.items.map<EditorItem>((it) => {
        // Prefiere la prescripción ESTRUCTURADA (0043) y degrada a la legacy solo
        // si falta o no valida — igual que loadBlockEditorModel. Antes se llamaba
        // a legacyItemToPrescription SIEMPRE: una sesión con prescripción
        // estructurada se abría degradada y, al volver a guardar, PERSISTÍA lo
        // degradado (pérdida silenciosa). getTemplateDetail ya la trae parseada.
        const prescription: Prescription =
          it.prescription_json ??
          legacyItemToPrescription({
            params_json: it.params_json,
            notes: it.notes,
          });
        return {
          uid: `tpl-item-${it.id}`,
          exercise_id: Number(it.exercise_id),
          exercise_name: it.exercise_name,
          exercise_modality: (it.exercise_modality ?? null) as Modality | null,
          notes: it.notes ?? undefined,
          prescription,
        };
      }),
    };
  });

  return {
    template_id: detail.id,
    name: detail.name,
    format: detail.format,
    is_draft: detail.is_draft,
    blocks,
    used_in_plans: 0, // TODO(endpoint): plan-usage count not exposed by getTemplateDetail
  };
}

// ── Library BLOCK · load a block into the editor model ───────────────────────
// A library block is structurally a mini-session: its block_exercises rows,
// grouped by block_position, become EditorBlock[] (one EditorBlock per group).
// Returns null when the block doesn't exist / isn't owned by this coach
// (getBlockById enforces coach ownership). Prefers the structured prescription_json,
// degrading to the legacy params_json only when absent/invalid.
export async function loadBlockEditorModel(params: {
  coach_id: number | bigint;
  block_id: number;
}): Promise<BlockEditorModel | null> {
  const block = await getBlockById(params.coach_id, params.block_id);
  if (!block) return null;

  const rows = await getBlockExerciseRowsForEdit(params.block_id, params.coach_id);

  // Group rows by block_position, preserving first-seen order.
  const groupsMap = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = groupsMap.get(row.block_position);
    if (list) list.push(row);
    else groupsMap.set(row.block_position, [row]);
  }

  const blocks: EditorBlock[] = Array.from(groupsMap.entries()).map(([blockPosition, groupRows], i) => {
    const title = groupRows[0]?.block_title ?? `Bloque ${i + 1}`;
    const format = groupRows[0]?.block_format ?? block.format;
    return {
      uid: `be-block-${blockPosition}`,
      title,
      format,
      group: inferGroup(title, format),
      items: groupRows.map<EditorItem>((it) => {
        const parsed = safeParsePrescription(it.prescription_json);
        const prescription: Prescription = parsed.success
          ? (parsed.data as Prescription)
          : legacyItemToPrescription({
              params_json: (it.params_json ?? null) as Record<string, unknown> | null,
              notes: it.notes ?? null,
            });
        return {
          uid: `be-item-${it.position}`,
          exercise_id: Number(it.exercise_id),
          exercise_name: it.exercise_name,
          // La modalidad del CATÁLOGO viaja al cliente para que el editor juzgue
          // la dosis con el mismo dato que la Biblioteca (si no, se contradicen).
          exercise_modality: (it.exercise_modality ?? null) as Modality | null,
          notes: it.notes ?? undefined,
          prescription,
        };
      }),
    };
  });

  return {
    block_id: block.id,
    title: block.title,
    description: block.description,
    methodology_group_id: block.methodology_group_id,
    format: block.format,
    blocks,
  };
}
