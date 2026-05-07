import { z } from 'zod';
import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { templateUpsertSchema } from '@/lib/templates/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.coerce.bigint();

interface TemplateRow {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  format: string;
  target_block: string;
  target_level: number | null;
  version: number;
  parent_template_id: string | null;
  day_position: string | null;
  paired_with_template_id: string | null;
  is_draft: boolean;
  is_partner_workout: boolean;
  warmup: string | null;
  cooldown: string | null;
  coach_notes: string | null;
  meta_json: Record<string, unknown>;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface SegmentRow {
  id: string;
  position: number;
  exercise_id: string;
  exercise_slug: string;
  exercise_name: string;
  exercise_category: string;
  params_json: Record<string, unknown>;
  notes: string | null;
}

interface VersionChainRow {
  id: string;
  version: number;
  is_draft: boolean;
  archived_at: Date | null;
  updated_at: Date;
  assignment_count: number;
}

async function fetchTemplate(coachId: bigint, templateId: bigint) {
  const rows = await sql<TemplateRow[]>`
    select
      id::text                          as id,
      coach_id::text                    as coach_id,
      name,
      description,
      format::text                      as format,
      target_block::text                as target_block,
      target_level,
      version,
      parent_template_id::text          as parent_template_id,
      day_position,
      paired_with_template_id::text     as paired_with_template_id,
      is_draft,
      is_partner_workout,
      warmup,
      cooldown,
      coach_notes,
      meta_json,
      archived_at,
      created_at,
      updated_at
    from templates
    where id = ${templateId} and coach_id = ${coachId}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const parsedId = idParamSchema.safeParse(id);
  if (!parsedId.success) return jsonError('invalid_request', 'Invalid id', 400);
  const templateId = parsedId.data;

  const tpl = await fetchTemplate(auth.session.coach_id, templateId);
  if (!tpl) return jsonError('not_found', 'Template not found', 404);

  const segments = await sql<SegmentRow[]>`
    select
      s.id::text             as id,
      s.position             as position,
      s.exercise_id::text    as exercise_id,
      e.slug                 as exercise_slug,
      e.name                 as exercise_name,
      e.category::text       as exercise_category,
      s.params_json          as params_json,
      s.notes                as notes
    from template_segments s
    join exercises e on e.id = s.exercise_id
    where s.template_id = ${templateId}
    order by s.position asc
  `;

  // Version chain — ascend parent links and descend descendants by parent.
  // Bounded by sane recursion (max 50 versions, more than enough for a single template).
  const chain = await sql<VersionChainRow[]>`
    with recursive ascendants as (
      select id, parent_template_id, version, is_draft, archived_at, updated_at
      from templates where id = ${templateId} and coach_id = ${auth.session.coach_id}
      union all
      select t.id, t.parent_template_id, t.version, t.is_draft, t.archived_at, t.updated_at
      from templates t
      join ascendants a on a.parent_template_id = t.id
      where t.coach_id = ${auth.session.coach_id}
    ),
    root_id as (
      select id from ascendants where parent_template_id is null limit 1
    ),
    descendants as (
      select id, parent_template_id, version, is_draft, archived_at, updated_at
      from templates
      where id = (select id from root_id) and coach_id = ${auth.session.coach_id}
      union all
      select t.id, t.parent_template_id, t.version, t.is_draft, t.archived_at, t.updated_at
      from templates t
      join descendants d on t.parent_template_id = d.id
      where t.coach_id = ${auth.session.coach_id}
    )
    select
      d.id::text                             as id,
      d.version                              as version,
      d.is_draft                             as is_draft,
      d.archived_at                          as archived_at,
      d.updated_at                           as updated_at,
      coalesce(asg.cnt, 0)::int              as assignment_count
    from descendants d
    left join (
      select template_id, count(*)::int as cnt
      from workout_assignments group by template_id
    ) asg on asg.template_id = d.id
    order by d.version asc
    limit 50
  `;

  return jsonOk({
    template: {
      id: tpl.id,
      coach_id: tpl.coach_id,
      name: tpl.name,
      description: tpl.description,
      format: tpl.format,
      target_block: tpl.target_block,
      target_level: tpl.target_level,
      version: tpl.version,
      parent_template_id: tpl.parent_template_id,
      day_position: tpl.day_position,
      paired_with_template_id: tpl.paired_with_template_id,
      is_draft: tpl.is_draft,
      is_partner_workout: tpl.is_partner_workout,
      warmup: tpl.warmup,
      cooldown: tpl.cooldown,
      coach_notes: tpl.coach_notes,
      meta_json: tpl.meta_json,
      archived_at: tpl.archived_at?.toISOString() ?? null,
      created_at: tpl.created_at.toISOString(),
      updated_at: tpl.updated_at.toISOString(),
    },
    segments: segments.map((s) => ({
      id: s.id,
      position: s.position,
      exercise_id: s.exercise_id,
      exercise_slug: s.exercise_slug,
      exercise_name: s.exercise_name,
      exercise_category: s.exercise_category,
      params_json: s.params_json,
      notes: s.notes,
    })),
    version_chain: chain.map((c) => ({
      id: c.id,
      version: c.version,
      is_draft: c.is_draft,
      archived_at: c.archived_at?.toISOString() ?? null,
      updated_at: c.updated_at.toISOString(),
      assignment_count: c.assignment_count,
    })),
  });
}

const patchBodySchema = templateUpsertSchema.partial().extend({
  segments: templateUpsertSchema.shape.segments.optional(),
  is_draft: z.boolean().optional(),
  force_new_version: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const parsedId = idParamSchema.safeParse(id);
  if (!parsedId.success) return jsonError('invalid_request', 'Invalid id', 400);
  const templateId = parsedId.data;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = patchBodySchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid patch payload', 400, parsed.error.flatten());
  }
  const body = parsed.data;

  const existing = await fetchTemplate(auth.session.coach_id, templateId);
  if (!existing) return jsonError('not_found', 'Template not found', 404);

  // Auto-versioning: if template is assigned and this isn't a draft-only edit,
  // we copy to a new version row instead of mutating in place.
  const assignedRows = await sql<{ cnt: number }[]>`
    select count(*)::int as cnt from workout_assignments where template_id = ${templateId}
  `;
  const isAssigned = (assignedRows[0]?.cnt ?? 0) > 0;
  const editingDraftOnly = body.is_draft === true || existing.is_draft;
  const mustVersion = !editingDraftOnly && (isAssigned || body.force_new_version === true);

  const result = await sql.begin(async (tx) => {
    if (mustVersion) {
      const [next] = await tx<{ id: string; version: number }[]>`
        insert into templates (
          coach_id, name, description, format, target_block, target_level,
          version, parent_template_id, day_position, paired_with_template_id,
          is_draft, is_partner_workout, warmup, cooldown, coach_notes, meta_json
        )
        values (
          ${auth.session.coach_id},
          ${body.name ?? existing.name},
          ${body.description ?? existing.description},
          ${(body.format ?? existing.format)}::template_format,
          ${(body.target_block ?? existing.target_block)}::target_block,
          ${body.target_level ?? existing.target_level ?? null},
          ${existing.version + 1},
          ${templateId},
          ${body.day_position ?? existing.day_position},
          ${body.paired_with_template_id ?? existing.paired_with_template_id},
          ${body.is_draft ?? false},
          ${body.is_partner_workout ?? existing.is_partner_workout},
          ${body.warmup ?? existing.warmup},
          ${body.cooldown ?? existing.cooldown},
          ${body.coach_notes ?? existing.coach_notes},
          ${JSON.stringify(existing.meta_json ?? {})}::jsonb
        )
        returning id::text as id, version
      `;
      const newId = next!.id;

      const segs = body.segments;
      if (segs) {
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i]!;
          await tx`
            insert into template_segments (template_id, position, exercise_id, params_json, notes)
            values (
              ${newId}::bigint,
              ${i},
              ${s.exercise_id}::bigint,
              ${JSON.stringify(s.params_json ?? {})}::jsonb,
              ${s.notes ?? null}
            )
          `;
        }
      } else {
        // copy existing segments
        await tx`
          insert into template_segments (template_id, position, exercise_id, params_json, notes)
          select ${newId}::bigint, position, exercise_id, params_json, notes
          from template_segments where template_id = ${templateId}
        `;
      }
      return { id: newId, version: next!.version, versioned: true };
    }

    // In-place update
    await tx`
      update templates set
        name                    = ${body.name ?? existing.name},
        description             = ${body.description ?? existing.description},
        format                  = ${(body.format ?? existing.format)}::template_format,
        target_block            = ${(body.target_block ?? existing.target_block)}::target_block,
        target_level            = ${body.target_level ?? existing.target_level ?? null},
        day_position            = ${body.day_position ?? existing.day_position},
        paired_with_template_id = ${body.paired_with_template_id ?? existing.paired_with_template_id},
        is_draft                = ${body.is_draft ?? existing.is_draft},
        is_partner_workout      = ${body.is_partner_workout ?? existing.is_partner_workout},
        warmup                  = ${body.warmup ?? existing.warmup},
        cooldown                = ${body.cooldown ?? existing.cooldown},
        coach_notes             = ${body.coach_notes ?? existing.coach_notes}
      where id = ${templateId} and coach_id = ${auth.session.coach_id}
    `;

    if (body.segments) {
      await tx`delete from template_segments where template_id = ${templateId}`;
      for (let i = 0; i < body.segments.length; i++) {
        const s = body.segments[i]!;
        await tx`
          insert into template_segments (template_id, position, exercise_id, params_json, notes)
          values (
            ${templateId},
            ${i},
            ${s.exercise_id}::bigint,
            ${JSON.stringify(s.params_json ?? {})}::jsonb,
            ${s.notes ?? null}
          )
        `;
      }
    }
    return { id: existing.id, version: existing.version, versioned: false };
  });

  return jsonOk(result);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const parsedId = idParamSchema.safeParse(id);
  if (!parsedId.success) return jsonError('invalid_request', 'Invalid id', 400);
  const templateId = parsedId.data;

  const existing = await fetchTemplate(auth.session.coach_id, templateId);
  if (!existing) return jsonError('not_found', 'Template not found', 404);

  // Soft archive — assigned templates are never hard-deleted.
  await sql`
    update templates set archived_at = now()
    where id = ${templateId} and coach_id = ${auth.session.coach_id}
  `;
  return jsonOk({ id: existing.id, archived: true });
}
