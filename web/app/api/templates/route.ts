import { z } from 'zod';
import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import type { TemplateListItem } from '@/lib/dashboard/templates/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  search: z.string().trim().max(120).optional(),
  include_drafts: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v !== 'false'),
});

export async function GET(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    search: url.searchParams.get('search') ?? undefined,
    include_drafts: url.searchParams.get('include_drafts') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError('bad_request', 'Query inválida', 400, parsed.error.flatten());
  }

  const { search, include_drafts } = parsed.data;
  const term = search ? `%${search.toLowerCase()}%` : null;

  const rows = await sql<
    Array<{
      id: string;
      name: string;
      format: string;
      target_block: string;
      target_level: number | null;
      segment_count: number;
      is_draft: boolean;
    }>
  >`
    select
      t.id::text as id,
      t.name,
      t.format::text as format,
      t.target_block::text as target_block,
      t.target_level,
      coalesce(seg.cnt, 0)::int as segment_count,
      t.is_draft
    from templates t
    left join (
      select template_id, count(*)::int as cnt
      from template_segments
      group by template_id
    ) seg on seg.template_id = t.id
    where t.coach_id = ${session.coach_id}
      and t.archived_at is null
      -- Exclude per-athlete INSTANCES (forks): the library lists only reusable
      -- templates; instances are reached through their assignment.
      and t.instance_athlete_id is null
      and (${include_drafts ? 1 : 0}::int = 1 or t.is_draft = false)
      and (${term}::text is null or lower(t.name) like ${term}::text)
    order by t.updated_at desc
    limit 200
  `;

  const templates: TemplateListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    format: r.format,
    target_block: r.target_block,
    target_level: r.target_level,
    segment_count: r.segment_count,
    is_draft: r.is_draft,
  }));

  return jsonOk({ templates });
}
