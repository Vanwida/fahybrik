import { z } from 'zod';
import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import {
  templateUpsertSchema,
  templateFormatSchema as templateFormat,
  targetBlockSchema as targetBlock,
} from '@/lib/templates/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  format: templateFormat.optional(),
  target_block: targetBlock.optional(),
  target_level: z.coerce.number().int().min(1).max(10).optional(),
  search: z.string().trim().max(120).optional(),
  include_archived: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
  include_drafts: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v !== 'false'),
});

interface TemplateListRow {
  id: string;
  name: string;
  format: string;
  target_block: string;
  target_level: number | null;
  version: number;
  parent_template_id: string | null;
  is_draft: boolean;
  is_partner_workout: boolean;
  archived_at: Date | null;
  updated_at: Date;
  segment_count: number;
  assignment_count: number;
  last_assigned_at: Date | null;
}

export async function GET(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    format: url.searchParams.get('format') ?? undefined,
    target_block: url.searchParams.get('target_block') ?? undefined,
    target_level: url.searchParams.get('target_level') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    include_archived: url.searchParams.get('include_archived') ?? undefined,
    include_drafts: url.searchParams.get('include_drafts') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid query', 400, parsed.error.flatten());
  }

  const { format, target_block, target_level, search, include_archived, include_drafts } =
    parsed.data;
  const term = search ? `%${search.toLowerCase()}%` : null;

  const rows = await sql<TemplateListRow[]>`
    select
      t.id::text                              as id,
      t.name                                  as name,
      t.format::text                          as format,
      t.target_block::text                    as target_block,
      t.target_level                          as target_level,
      t.version                               as version,
      t.parent_template_id::text              as parent_template_id,
      t.is_draft                              as is_draft,
      t.is_partner_workout                    as is_partner_workout,
      t.archived_at                           as archived_at,
      t.updated_at                            as updated_at,
      coalesce(seg.cnt, 0)::int               as segment_count,
      coalesce(asg.cnt, 0)::int               as assignment_count,
      asg.last_at                             as last_assigned_at
    from templates t
    left join (
      select template_id, count(*)::int as cnt
      from template_segments group by template_id
    ) seg on seg.template_id = t.id
    left join (
      select template_id, count(*)::int as cnt, max(created_at) as last_at
      from workout_assignments group by template_id
    ) asg on asg.template_id = t.id
    where t.coach_id = ${auth.session.coach_id}
      and (${include_archived ? 1 : 0}::int = 1 or t.archived_at is null)
      and (${include_drafts ? 1 : 0}::int = 1 or t.is_draft = false)
      and (${format ?? null}::template_format is null or t.format = ${format ?? null}::template_format)
      and (${target_block ?? null}::target_block is null or t.target_block = ${target_block ?? null}::target_block)
      and (${target_level ?? null}::int is null or t.target_level = ${target_level ?? null}::int)
      and (${term}::text is null or lower(t.name) like ${term}::text)
    order by t.updated_at desc
    limit 200
  `;

  return jsonOk({
    templates: rows.map((r) => ({
      id: r.id,
      name: r.name,
      format: r.format,
      target_block: r.target_block,
      target_level: r.target_level,
      version: r.version,
      parent_template_id: r.parent_template_id,
      is_draft: r.is_draft,
      is_partner_workout: r.is_partner_workout,
      archived_at: r.archived_at?.toISOString() ?? null,
      updated_at: r.updated_at.toISOString(),
      segment_count: r.segment_count,
      assignment_count: r.assignment_count,
      last_assigned_at: r.last_assigned_at?.toISOString() ?? null,
    })),
  });
}

const createBodySchema = templateUpsertSchema.extend({
  is_draft: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = createBodySchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid template payload', 400, parsed.error.flatten());
  }

  const t = parsed.data;

  const inserted = await sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; version: number }[]>`
      insert into templates (
        coach_id, name, description, format, target_block, target_level,
        version, parent_template_id, day_position, paired_with_template_id,
        is_draft, is_partner_workout, warmup, cooldown, coach_notes, meta_json
      )
      values (
        ${auth.session.coach_id},
        ${t.name},
        ${t.description ?? null},
        ${t.format}::template_format,
        ${t.target_block}::target_block,
        ${t.target_level ?? null},
        1,
        null,
        ${t.day_position ?? null},
        ${t.paired_with_template_id ?? null},
        ${t.is_draft ?? true},
        ${t.is_partner_workout ?? false},
        ${t.warmup ?? null},
        ${t.cooldown ?? null},
        ${t.coach_notes ?? null},
        ${'{}'}::jsonb
      )
      returning id::text as id, version
    `;

    if (t.segments.length > 0) {
      for (let i = 0; i < t.segments.length; i++) {
        const s = t.segments[i]!;
        await tx`
          insert into template_segments (template_id, position, exercise_id, params_json, notes)
          values (
            ${row!.id}::bigint,
            ${i},
            ${s.exercise_id}::bigint,
            ${JSON.stringify(s.params_json ?? {})}::jsonb,
            ${s.notes ?? null}
          )
        `;
      }
    }

    return row!;
  });

  return jsonOk({ id: inserted.id, version: inserted.version }, 201);
}
