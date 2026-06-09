import { z } from 'zod';
import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import type { TemplateDetail, TemplateSegmentPreview } from '@/lib/dashboard/templates/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const templateId = Number(id);
  if (!Number.isFinite(templateId)) return jsonError('bad_request', 'ID inválido', 400);

  const tplRows = await sql<
    Array<{
      id: string;
      name: string;
      format: string;
      target_block: string;
      description: string | null;
      coach_notes: string | null;
    }>
  >`
    select
      id::text as id,
      name,
      format::text as format,
      target_block::text as target_block,
      description,
      coach_notes
    from templates
    where id = ${templateId} and coach_id = ${session.coach_id}
    limit 1
  `;
  const tpl = tplRows[0];
  if (!tpl) return jsonError('not_found', 'Entreno no encontrado', 404);

  const segmentRows = await sql<
    Array<{
      id: string;
      position: number;
      exercise_id: string;
      exercise_name: string;
      exercise_category: string;
      params_json: Record<string, unknown>;
      notes: string | null;
    }>
  >`
    select
      s.id::text as id,
      s.position,
      s.exercise_id::text as exercise_id,
      e.name as exercise_name,
      e.category::text as exercise_category,
      s.params_json,
      s.notes
    from template_segments s
    join exercises e on e.id = s.exercise_id
    where s.template_id = ${templateId}
    order by s.position asc
  `;

  const segments: TemplateSegmentPreview[] = segmentRows.map((s) => ({
    id: s.id,
    position: s.position,
    exercise_id: s.exercise_id,
    exercise_name: s.exercise_name,
    exercise_category: s.exercise_category,
    params_json: s.params_json,
    notes: s.notes,
  }));

  const template: TemplateDetail = {
    id: tpl.id,
    name: tpl.name,
    format: tpl.format,
    target_block: tpl.target_block,
    description: tpl.description,
    coach_notes: tpl.coach_notes,
    segments,
  };

  return jsonOk({ template });
}
