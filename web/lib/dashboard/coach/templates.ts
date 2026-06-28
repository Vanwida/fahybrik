import 'server-only';
import type { TransactionSql } from 'postgres';
import { z } from 'zod';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

type AnySql = Sql | TransactionSql<{ readonly bigint: bigint }>;
import { templateFormat, targetBlock } from '@fahybrid/shared/schema/_primitives';
import { segmentParamsSchema } from '@fahybrid/shared/schema/templates';
import {
  prescriptionSchema,
  safeParsePrescription,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';

/**
 * Templates catalog helpers — list/create/update/delete + usage count.
 *
 * `template_segments` has ON DELETE CASCADE from `templates`, so the row delete
 * also wipes its segments. Multi-block columns (`block_position`,
 * `block_format`, `block_title`) live on `template_segments` and are grouped
 * by `block_position` on load.
 */

export const templateSegmentInputSchema = z.object({
  exercise_id: z.union([z.string(), z.number()]).transform((v) => Number(v)),
  position: z.number().int().nonnegative(),
  block_position: z.number().int().nonnegative().default(0),
  block_format: templateFormat.nullable().optional(),
  block_title: z.string().max(120).nullable().optional(),
  params_json: segmentParamsSchema.default({}),
  notes: z.string().max(4000).nullable().optional(),
  // Structured per-set prescription (migration 0043). TRANSITION: validated by
  // the shared Zod model and persisted when present; params_json remains the
  // fallback. An invalid shape is rejected here (server-side) before any write.
  prescription_json: prescriptionSchema.nullable().optional(),
});
export type TemplateSegmentInput = z.infer<typeof templateSegmentInputSchema>;

export const templateCreateSchema = z.object({
  name: z.string().min(1).max(200),
  format: templateFormat,
  target_block: targetBlock.default('any'),
  target_level: z.number().int().min(1).max(10).nullable().optional(),
  // Pedagogical training group 1..10 (A8 / D3). Nullable — not every template
  // maps cleanly. References methodology_groups(id).
  methodology_group_id: z.number().int().min(1).max(10).nullable().optional(),
  coach_notes: z.string().max(4000).nullable().optional(),
  is_draft: z.boolean().optional().default(false),
  segments: z.array(templateSegmentInputSchema).max(120).optional().default([]),
});
export type TemplateCreate = z.infer<typeof templateCreateSchema>;

export const templateUpdateSchema = templateCreateSchema.partial().extend({
  segments: z.array(templateSegmentInputSchema).max(120).optional(),
});
export type TemplateUpdate = z.infer<typeof templateUpdateSchema>;

export class TemplateError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}

export interface TemplateBlockSummary {
  block_position: number;
  block_title: string | null;
  block_format: string | null;
  item_count: number;
}

export interface TemplateListRow {
  id: string;
  name: string;
  format: string;
  target_block: string;
  target_level: number | null;
  is_draft: boolean;
  segment_count: number;
  block_count: number;
  updated_at: string;
  methodology_group_id: number | null;
}

export async function listTemplatesForCoach(
  coach_id: number | bigint,
  client: Sql = defaultSql,
): Promise<TemplateListRow[]> {
  return client<TemplateListRow[]>`
    select
      t.id::text as id,
      t.name,
      t.format::text as format,
      t.target_block::text as target_block,
      t.target_level,
      t.is_draft,
      coalesce(seg.cnt, 0)::int as segment_count,
      coalesce(seg.blocks, 0)::int as block_count,
      t.updated_at::text as updated_at,
      t.methodology_group_id
    from templates t
    left join (
      select
        template_id,
        count(*)::int as cnt,
        count(distinct block_position)::int as blocks
      from template_segments
      group by template_id
    ) seg on seg.template_id = t.id
    where t.coach_id = ${coach_id as number}
      and t.archived_at is null
      -- Exclude per-athlete INSTANCES (forks): the library lists only reusable
      -- templates; instances are reached through their assignment.
      and t.instance_athlete_id is null
    order by t.updated_at desc
    limit 500
  `;
}

export interface TemplateDetailFull {
  id: string;
  name: string;
  format: string;
  target_block: string;
  target_level: number | null;
  methodology_group_id: number | null;
  coach_notes: string | null;
  is_draft: boolean;
  updated_at: string;
  blocks: TemplateDetailBlock[];
}

export interface TemplateDetailBlock {
  block_position: number;
  block_title: string | null;
  block_format: string | null;
  items: TemplateDetailItem[];
}

export interface TemplateDetailItem {
  id: string;
  position: number;
  exercise_id: string;
  exercise_name: string;
  exercise_category: string;
  // Intrinsic modality of the exercise (migration 0053). Used as the fallback
  // modality for legacy items that have no structured prescription_json.
  exercise_modality: string;
  params_json: Record<string, unknown>;
  // Structured per-set prescription (migration 0043). Editor prefers this over
  // params_json so the coach sees the real modality/sets, not a legacy default.
  prescription_json: Prescription | null;
  notes: string | null;
}

export async function getTemplateDetail(params: {
  coach_id: number | bigint;
  template_id: number | bigint;
  client?: Sql;
}): Promise<TemplateDetailFull | null> {
  const client = params.client ?? defaultSql;
  const tplRows = await client<
    Array<{
      id: string;
      name: string;
      format: string;
      target_block: string;
      target_level: number | null;
      methodology_group_id: number | null;
      coach_notes: string | null;
      is_draft: boolean;
      updated_at: string;
    }>
  >`
    select
      id::text as id,
      name,
      format::text as format,
      target_block::text as target_block,
      target_level,
      methodology_group_id,
      coach_notes,
      is_draft,
      updated_at::text as updated_at
    from templates
    where id = ${Number(params.template_id)}
      and coach_id = ${Number(params.coach_id)}
      and archived_at is null
    limit 1
  `;
  const tpl = tplRows[0];
  if (!tpl) return null;

  const segmentRows = await client<
    Array<{
      id: string;
      position: number;
      block_position: number;
      block_title: string | null;
      block_format: string | null;
      exercise_id: string;
      exercise_name: string;
      exercise_category: string;
      exercise_modality: string;
      params_json: Record<string, unknown> | null;
      prescription_json: unknown;
      notes: string | null;
    }>
  >`
    select
      s.id::text as id,
      s.position,
      s.block_position,
      s.block_title,
      s.block_format,
      s.exercise_id::text as exercise_id,
      e.name as exercise_name,
      e.category::text as exercise_category,
      e.modality::text as exercise_modality,
      s.params_json,
      s.prescription_json,
      s.notes
    from template_segments s
    join exercises e on e.id = s.exercise_id
    where s.template_id = ${Number(params.template_id)}
    order by s.block_position asc, s.position asc
  `;

  const blocksMap = new Map<number, TemplateDetailBlock>();
  for (const row of segmentRows) {
    const key = row.block_position;
    let block = blocksMap.get(key);
    if (!block) {
      block = {
        block_position: row.block_position,
        block_title: row.block_title,
        block_format: row.block_format,
        items: [],
      };
      blocksMap.set(key, block);
    }
    const parsedPresc = safeParsePrescription(row.prescription_json);
    block.items.push({
      id: row.id,
      position: row.position,
      exercise_id: row.exercise_id,
      exercise_name: row.exercise_name,
      exercise_category: row.exercise_category,
      exercise_modality: row.exercise_modality,
      params_json: (row.params_json ?? {}) as Record<string, unknown>,
      prescription_json: parsedPresc.success ? (parsedPresc.data as Prescription) : null,
      notes: row.notes,
    });
  }

  const blocks = Array.from(blocksMap.values()).sort(
    (a, b) => a.block_position - b.block_position,
  );

  return { ...tpl, blocks };
}

export async function createTemplate(params: {
  coach_id: number | bigint;
  payload: unknown;
  client?: Sql;
}): Promise<string> {
  const parsed = templateCreateSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new TemplateError('invalid_payload', parsed.error.message, 400);
  }
  const body = parsed.data;
  const client = params.client ?? defaultSql;

  let templateId = '';
  await client.begin(async (tx) => {
    const rows = await tx<Array<{ id: string }>>`
      insert into templates (
        coach_id, name, format, target_block, target_level,
        methodology_group_id, coach_notes, is_draft
      )
      values (
        ${Number(params.coach_id)},
        ${body.name},
        ${body.format}::template_format,
        ${body.target_block}::target_block,
        ${body.target_level ?? null},
        ${body.methodology_group_id ?? null},
        ${body.coach_notes ?? null},
        ${body.is_draft}
      )
      returning id::text
    `;
    templateId = rows[0]!.id;

    if (body.segments && body.segments.length > 0) {
      await insertSegments(tx, Number(templateId), body.segments);
    }
  });

  return templateId;
}

export async function updateTemplate(params: {
  coach_id: number | bigint;
  template_id: number | bigint;
  payload: unknown;
  client?: Sql;
}): Promise<void> {
  const parsed = templateUpdateSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new TemplateError('invalid_payload', parsed.error.message, 400);
  }
  const body = parsed.data;
  const client = params.client ?? defaultSql;

  await client.begin(async (tx) => {
    const existing = await tx<
      Array<{
        name: string;
        format: string;
        target_block: string;
        target_level: number | null;
        methodology_group_id: number | null;
        coach_notes: string | null;
        is_draft: boolean;
      }>
    >`
      select name, format::text as format, target_block::text as target_block,
             target_level, methodology_group_id, coach_notes, is_draft
      from templates
      where id = ${Number(params.template_id)}
        and coach_id = ${Number(params.coach_id)}
        and archived_at is null
      limit 1
    `;
    if (!existing[0]) {
      throw new TemplateError('not_found', 'Entreno no encontrado', 404);
    }
    const cur = existing[0];

    // Merge — only override fields present in the body. Undefined → keep.
    const next = {
      name: body.name ?? cur.name,
      format: body.format ?? cur.format,
      target_block: body.target_block ?? cur.target_block,
      target_level:
        body.target_level !== undefined ? body.target_level : cur.target_level,
      methodology_group_id:
        body.methodology_group_id !== undefined
          ? body.methodology_group_id
          : cur.methodology_group_id,
      coach_notes:
        body.coach_notes !== undefined ? body.coach_notes : cur.coach_notes,
      is_draft: body.is_draft !== undefined ? body.is_draft : cur.is_draft,
    };

    await tx`
      update templates set
        name                 = ${next.name},
        format               = ${next.format}::template_format,
        target_block         = ${next.target_block}::target_block,
        target_level         = ${next.target_level},
        methodology_group_id = ${next.methodology_group_id},
        coach_notes          = ${next.coach_notes},
        is_draft             = ${next.is_draft},
        updated_at           = now()
      where id = ${Number(params.template_id)}
        and coach_id = ${Number(params.coach_id)}
    `;

    if (body.segments !== undefined) {
      await tx`delete from template_segments where template_id = ${Number(params.template_id)}`;
      if (body.segments.length > 0) {
        await insertSegments(tx, Number(params.template_id), body.segments);
      }
    }
  });
}

async function insertSegments(
  client: AnySql,
  template_id: number,
  segments: TemplateSegmentInput[],
): Promise<void> {
  for (const seg of segments) {
    const paramsJson = JSON.parse(
      JSON.stringify(seg.params_json ?? {}, (_, v) =>
        typeof v === 'bigint' ? Number(v) : v,
      ),
    );
    // TRANSITION: persist the structured prescription when the client sends one
    // (already validated by prescriptionSchema). NULL preserves the legacy
    // params_json-only path. Both columns are written so readers can prefer
    // prescription_json and fall back to params_json.
    const prescriptionJson =
      seg.prescription_json != null
        ? client.json(
            JSON.parse(JSON.stringify(seg.prescription_json)) as Parameters<
              typeof client.json
            >[0],
          )
        : null;
    await client`
      insert into template_segments (
        template_id, position, block_position, block_title, block_format,
        exercise_id, params_json, notes, prescription_json
      )
      values (
        ${template_id},
        ${seg.position},
        ${seg.block_position},
        ${seg.block_title ?? null},
        ${seg.block_format ?? null},
        ${seg.exercise_id},
        ${client.json(paramsJson)},
        ${seg.notes ?? null},
        ${prescriptionJson}
      )
    `;
  }
}

/**
 * Counts how many `program_week_templates.slots_json` reference this template
 * via any `sessions[].template_id`. Used for the delete-confirm message.
 *
 * Postgres jsonb query: jsonb_path_exists across days[*].sessions[*].template_id.
 */
export async function countTemplateUsageInWeeks(params: {
  coach_id: number | bigint;
  template_id: number | bigint;
  client?: Sql;
}): Promise<number> {
  const client = params.client ?? defaultSql;
  const rows = await client<Array<{ cnt: number }>>`
    select count(*)::int as cnt
    from program_week_templates w
    where w.coach_id = ${Number(params.coach_id)}
      and exists (
        select 1
        from jsonb_array_elements(coalesce(w.slots_json->'days', '[]'::jsonb)) as d
        cross join jsonb_array_elements(coalesce(d->'sessions', '[]'::jsonb)) as s
        where (s->>'template_id')::bigint = ${Number(params.template_id)}
      )
  `;
  return rows[0]?.cnt ?? 0;
}

export async function deleteTemplate(params: {
  coach_id: number | bigint;
  template_id: number | bigint;
  client?: Sql;
}): Promise<void> {
  const client = params.client ?? defaultSql;
  // template_segments has ON DELETE CASCADE → no manual cleanup needed.
  const rows = await client<Array<{ id: string }>>`
    delete from templates
    where id = ${Number(params.template_id)}
      and coach_id = ${Number(params.coach_id)}
    returning id::text
  `;
  if (!rows[0]) {
    throw new TemplateError('not_found', 'Entreno no encontrado', 404);
  }
}
