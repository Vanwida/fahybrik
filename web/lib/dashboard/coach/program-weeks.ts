import 'server-only';

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  programWeekUpsertSchema,
  type ProgramWeekUpsert,
} from '@fahybrid/shared/schema/program-templates';
import { normalizeWeekSlots, parseWeekSlotsFromDb } from './program-week-slots';

export async function listWeekTemplates(params: {
  coach_id: number | bigint;
  level?: string | undefined;
  client?: Sql | undefined;
}) {
  const client = params.client ?? defaultSql;
  return client<
    Array<{
      id: string;
      name: string;
      level: string;
      focus: string | null;
      atr_block_hint: string | null;
      updated_at: string;
    }>
  >`
    select
      w.id::text,
      w.name,
      w.level::text,
      w.focus,
      w.atr_block_hint::text,
      w.updated_at::text
    from program_week_templates w
    where w.coach_id = ${Number(params.coach_id)}
      and (${params.level ?? null}::program_level is null or w.level = ${params.level ?? null}::program_level)
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
      atr_block_hint: string | null;
      slots_json: unknown;
    }>
  >`
    select
      id::text,
      name,
      level::text,
      focus,
      coach_notes,
      atr_block_hint::text,
      slots_json
    from program_week_templates
    where id = ${Number(params.id)} and coach_id = ${Number(params.coach_id)}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const slots = parseWeekSlotsFromDb(row.slots_json);
  return { ...row, slots_json: slots };
}

export async function upsertWeekTemplate(params: {
  coach_id: number | bigint;
  id?: number | bigint | undefined;
  payload: unknown;
  // Accepts a transaction handle so callers can batch several upserts atomically.
  client?: Sql | TransactionClient | undefined;
}) {
  const parsed = programWeekUpsertSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new ProgramWeekError('invalid_payload', parsed.error.message, 400);
  }
  const body: ProgramWeekUpsert = parsed.data;
  const client = params.client ?? defaultSql;
  const slotsForDb = normalizeWeekSlots(body.slots_json);
  const slotsJson = JSON.parse(
    JSON.stringify(slotsForDb, (_, v) => (typeof v === 'bigint' ? Number(v) : v)),
  );

  if (params.id) {
    const rows = await client<Array<{ id: string }>>`
      update program_week_templates
      set
        name = ${body.name},
        level = ${body.level}::program_level,
        atr_block_hint = ${body.atr_block_hint ?? null},
        focus = ${body.focus ?? null},
        coach_notes = ${body.coach_notes ?? null},
        slots_json = ${client.json(slotsJson)},
        updated_at = now()
      where id = ${Number(params.id)} and coach_id = ${Number(params.coach_id)}
      returning id::text
    `;
    if (!rows[0]) throw new ProgramWeekError('not_found', 'Week template not found', 404);
    return rows[0].id;
  }

  const rows = await client<Array<{ id: string }>>`
    insert into program_week_templates (
      coach_id, name, level, atr_block_hint, focus, coach_notes, slots_json
    )
    values (
      ${Number(params.coach_id)},
      ${body.name},
      ${body.level}::program_level,
      ${body.atr_block_hint ?? null},
      ${body.focus ?? null},
      ${body.coach_notes ?? null},
      ${client.json(slotsJson)}
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
      level: src.level as ProgramWeekUpsert['level'],
      atr_block_hint: src.atr_block_hint as ProgramWeekUpsert['atr_block_hint'],
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
