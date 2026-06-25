import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  programWeekUpsertSchema,
  type ProgramWeekUpsert,
} from '@fahybrid/shared/schema/program-templates';
import { normalizeWeekSlots, parseWeekSlotsFromDb } from './program-week-slots';

export async function listWeekTemplates(params: {
  coach_id: number | bigint;
  client?: Sql;
}) {
  const client = params.client ?? defaultSql;
  return client<
    Array<{
      id: string;
      name: string;
      level: string;
      focus: string | null;
      updated_at: string;
    }>
  >`
    select
      w.id::text,
      w.name,
      coalesce(al.name, '') as level,
      w.focus,
      w.updated_at::text
    from program_week_templates w
    left join athlete_levels al on al.id = w.level_id
    where w.coach_id = ${params.coach_id as number}
    order by w.updated_at desc
  `;
}

export async function getWeekTemplate(params: {
  coach_id: number | bigint;
  id: number | bigint;
  client?: Sql;
}) {
  const client = params.client ?? defaultSql;
  const rows = await client<
    Array<{
      id: string;
      name: string;
      level: string;
      focus: string | null;
      coach_notes: string | null;
      slots_json: unknown;
    }>
  >`
    select
      w.id::text,
      w.name,
      coalesce(al.name, '') as level,
      w.focus,
      w.coach_notes,
      w.slots_json
    from program_week_templates w
    left join athlete_levels al on al.id = w.level_id
    where w.id = ${params.id} and w.coach_id = ${params.coach_id}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const slots = parseWeekSlotsFromDb(row.slots_json);
  return { ...row, slots_json: slots };
}

export async function upsertWeekTemplate(params: {
  coach_id: number | bigint;
  id?: number | bigint;
  payload: unknown;
  client?: Sql;
}) {
  const parsed = programWeekUpsertSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new ProgramWeekError('invalid_payload', parsed.error.message, 400);
  }
  const body: ProgramWeekUpsert = parsed.data;
  const client = params.client ?? defaultSql;
  const slotsForDb = normalizeWeekSlots(body.slots_json);

  if (params.id) {
    const rows = await client<Array<{ id: string }>>`
      update program_week_templates
      set
        name = ${body.name},
        focus = ${body.focus ?? null},
        coach_notes = ${body.coach_notes ?? null},
        slots_json = ${client.json(slotsForDb as unknown as Parameters<typeof client.json>[0])},
        updated_at = now()
      where id = ${params.id} and coach_id = ${params.coach_id}
      returning id::text
    `;
    if (!rows[0]) throw new ProgramWeekError('not_found', 'Week template not found', 404);
    return rows[0].id;
  }

  const rows = await client<Array<{ id: string }>>`
    insert into program_week_templates (
      coach_id, name, focus, coach_notes, slots_json
    )
    values (
      ${params.coach_id},
      ${body.name},
      ${body.focus ?? null},
      ${body.coach_notes ?? null},
      ${client.json(slotsForDb as unknown as Parameters<typeof client.json>[0])}
    )
    returning id::text
  `;
  return rows[0]!.id;
}

export async function duplicateWeekTemplate(params: {
  coach_id: number | bigint;
  id: number | bigint;
  client?: Sql;
}): Promise<string> {
  const src = await getWeekTemplate(params);
  if (!src) throw new ProgramWeekError('not_found', 'Week template not found', 404);

  return upsertWeekTemplate({
    coach_id: params.coach_id,
    payload: {
      name: `${src.name} (copia)`,
      focus: src.focus,
      coach_notes: src.coach_notes,
      slots_json: src.slots_json,
    },
    client: params.client,
  });
}

export class ProgramWeekError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ProgramWeekError';
  }
}
