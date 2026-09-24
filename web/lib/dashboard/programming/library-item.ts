import 'server-only';

// Carga de una pieza de la biblioteca para su editor (bloque o entreno), con sus
// etiquetas y, si es un bloque solo en texto, la prosa original para leerla al
// lado. `nextReview` = la siguiente pieza por revisar (para «Revisar en fila»).

import { sql } from '@/lib/db';
import { loadBlockEditorModel, loadSessionEditorModel } from '@/lib/dashboard/v2/editor-data';
import type { LibraryItemModel } from '@/components/v2/biblioteca/LibraryItemEditor';

export async function loadLibraryItem(params: { coach_id: number | bigint; kind: 'bloque' | 'entreno'; id: number }): Promise<LibraryItemModel | null> {
  const coachId = Number(params.coach_id);
  if (params.kind === 'bloque') {
    const m = await loadBlockEditorModel({ coach_id: coachId, block_id: params.id });
    if (!m) return null;
    const [row] = await sql<Array<{ tags: string[]; source_ref: string | null }>>`select tags, source_ref from blocks where id = ${params.id} and coach_id = ${coachId}`;
    return {
      kind: 'bloque',
      id: String(params.id),
      title: m.title,
      // Un bloque importado guarda su sustancia en la descripción: se enseña al
      // lado. En uno creado aquí la descripción es solo un resumen de sus líneas.
      prose: m.description?.trim() && (m.blocks.length === 0 || row?.source_ref) ? m.description : null,
      blocks: m.blocks.map((b) => ({ ...b, group: undefined })),
      tags: row?.tags ?? [],
      methodology_group_id: m.methodology_group_id,
      format: m.format,
      is_draft: false,
    };
  }
  const m = await loadSessionEditorModel({ coach_id: coachId, template_id: params.id });
  if (!m) return null;
  const [row] = await sql<Array<{ tags: string[] }>>`select tags from templates where id = ${params.id} and coach_id = ${coachId}`;
  return {
    kind: 'entreno',
    id: String(params.id),
    title: m.name,
    prose: null,
    blocks: m.blocks.map((b) => ({ ...b, group: undefined })),
    tags: row?.tags ?? [],
    methodology_group_id: null,
    format: m.format,
    is_draft: m.is_draft,
  };
}

export async function nextBlockToReview(coach_id: number | bigint, after: number | null): Promise<string | null> {
  const rows = await sql<Array<{ id: string }>>`
    select b.id::text from blocks b
    where b.coach_id = ${Number(coach_id)} and b.archived_at is null
      and not exists (select 1 from block_exercises be where be.block_id = b.id)
      ${after == null ? sql`` : sql`and b.id <> ${after}`}
    order by (b.id > ${after ?? 0}) desc, b.id
    limit 1
  `;
  return rows[0]?.id ?? null;
}
