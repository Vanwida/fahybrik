import 'server-only';

import { z } from 'zod';

import type { Sql } from '@/lib/db';
import { sql as defaultSql, withOwnOrAmbientTx } from '@/lib/db';
import { recordAudit, type Actor, type AuditChannel } from '@/lib/audit/record-edit';
import {
  type CircuitConfig,
  type ProgramWeekUpsert,
  type WeekDay,
  type WeekSession,
} from '@fahybrid/shared/schema/program-templates';
import { templateFormat } from '@fahybrid/shared/schema/_primitives';
import { insertTemplateBlockCircuit } from './instantiate-program';
import { getWeekTemplate, upsertWeekTemplate } from './program-weeks';
import { getTemplateDetail, TemplateError, updateTemplate } from './templates';
import { mergeDayIntoDays } from '@/lib/dashboard/v2/editor-serialize';
import {
  type InstanceBlockRow,
  type RecipePromotePreview,
  type RecipeTarget,
  circuitFromTemplateBlockRow,
  dayOfWeekFromIso,
  instanceBlocksToWeekParts,
  sessionIndexInDay,
  weekdayLabelEs,
} from './copy-instance-to-recipe-model';

export type { RecipePromotePreview, RecipeTarget };
export {
  circuitFromTemplateBlockRow,
  dayOfWeekFromIso,
  instanceBlocksToWeekParts,
  sessionIndexInDay,
  weekdayLabelEs,
};

/**
 * Promote one athlete INSTANCE day back onto the recipe that produced it.
 *
 * Card 111 writes recipes (`program_*_templates` / library `templates`).
 * This is the explicit exception: the coach presses a button on the
 * per-athlete day, and we copy the saved instance onto THAT recipe only.
 * Never autosave. Never resync other athletes.
 */

export class RecipePromoteError extends Error {
  constructor(
    public readonly code: 'not_found' | 'no_recipe' | 'needs_confirm' | 'forbidden',
    message: string,
    public readonly status: number,
    public readonly details?: RecipePromotePreview,
  ) {
    super(message);
    this.name = 'RecipePromoteError';
  }
}

const promoteBodySchema = z.object({
  template_id: z.union([z.string(), z.number()]).transform((v) => Number(v)),
  confirm: z.boolean().optional(),
});
export type PromoteInstanceBody = z.infer<typeof promoteBodySchema>;

type IsolatedRow = {
  template_id: number;
  name: string;
  format: string;
  coach_notes: string | null;
  instance_of_template_id: number | null;
  source_week_template_id: number | null;
};

async function loadIsolatedInstance(params: {
  client: Sql;
  coach_id: number;
  athlete_id: number;
  iso_date: string;
  template_id: number;
}): Promise<IsolatedRow | null> {
  const rows = await params.client<
    Array<{
      template_id: string;
      name: string;
      format: string;
      coach_notes: string | null;
      instance_of_template_id: string | null;
      source_week_template_id: string | null;
    }>
  >`
    select
      t.id::text as template_id,
      t.name,
      t.format::text as format,
      t.coach_notes,
      t.instance_of_template_id::text as instance_of_template_id,
      mc.source_week_template_id::text as source_week_template_id
    from templates t
    join workout_assignments wa on wa.template_id = t.id
    left join microcycles mc on mc.id = wa.microcycle_id
    where t.id = ${params.template_id}
      and t.coach_id = ${params.coach_id}
      and t.instance_athlete_id = ${params.athlete_id}
      and t.archived_at is null
      and wa.athlete_id = ${params.athlete_id}
      and wa.scheduled_for = ${params.iso_date}::date
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    template_id: Number(row.template_id),
    name: row.name,
    format: row.format,
    coach_notes: row.coach_notes,
    instance_of_template_id:
      row.instance_of_template_id != null ? Number(row.instance_of_template_id) : null,
    source_week_template_id:
      row.source_week_template_id != null ? Number(row.source_week_template_id) : null,
  };
}

async function resolveTarget(params: {
  client: Sql;
  coach_id: number;
  athlete_id: number;
  iso_date: string;
  instance: IsolatedRow;
}): Promise<RecipeTarget | null> {
  const { client, coach_id, athlete_id, iso_date, instance } = params;

  if (instance.instance_of_template_id != null) {
    const lib = await client<Array<{ id: string; name: string }>>`
      select id::text, name
      from templates
      where id = ${instance.instance_of_template_id}
        and coach_id = ${coach_id}
        and instance_athlete_id is null
        and archived_at is null
      limit 1
    `;
    if (lib[0]) {
      return {
        kind: 'library_template',
        id: Number(lib[0].id),
        name: lib[0].name,
      };
    }
  }

  if (instance.source_week_template_id == null) return null;

  const week = await client<Array<{ id: string; name: string; athlete_id: string | null }>>`
    select id::text, name, athlete_id::text as athlete_id
    from program_week_templates
    where id = ${instance.source_week_template_id}
      and coach_id = ${coach_id}
    limit 1
  `;
  if (!week[0]) return null;
  if (week[0].athlete_id != null && Number(week[0].athlete_id) !== athlete_id) {
    throw new RecipePromoteError(
      'forbidden',
      'La receta de esa semana es de otro atleta',
      403,
    );
  }

  const dayIds = await client<Array<{ template_id: string }>>`
    select wa.template_id::text as template_id
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    where wa.athlete_id = ${athlete_id}
      and wa.scheduled_for = ${iso_date}::date
      and t.instance_athlete_id = ${athlete_id}
    order by wa.id asc
  `;
  const sessionIndex = sessionIndexInDay(
    dayIds.map((r) => Number(r.template_id)),
    instance.template_id,
  );
  const dayOfWeek = dayOfWeekFromIso(iso_date);
  return {
    kind: 'week_session',
    id: Number(week[0].id),
    name: week[0].name,
    day_of_week: dayOfWeek,
    day_label: weekdayLabelEs(dayOfWeek),
    session_index: sessionIndex,
  };
}

async function countOtherAthletes(params: {
  client: Sql;
  coach_id: number;
  athlete_id: number;
  target: RecipeTarget;
}): Promise<number> {
  const { client, coach_id, athlete_id, target } = params;
  if (target.kind === 'library_template') {
    const rows = await client<Array<{ n: number }>>`
      select count(distinct wa.athlete_id)::int as n
      from templates inst
      join workout_assignments wa on wa.template_id = inst.id
      join athletes a on a.id = wa.athlete_id
      where inst.instance_of_template_id = ${target.id}
        and inst.instance_athlete_id is not null
        and wa.athlete_id <> ${athlete_id}
        and a.coach_id = ${coach_id}
    `;
    return rows[0]?.n ?? 0;
  }
  const rows = await client<Array<{ n: number }>>`
    select count(distinct mc.athlete_id)::int as n
    from microcycles mc
    join athletes a on a.id = mc.athlete_id
    where mc.source_week_template_id = ${target.id}
      and mc.athlete_id <> ${athlete_id}
      and a.coach_id = ${coach_id}
  `;
  return rows[0]?.n ?? 0;
}

export async function previewCopyInstanceToRecipe(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  iso_date: string;
  template_id: number;
  client?: Sql;
}): Promise<{ target: RecipeTarget; other_athletes: number } | null> {
  const client = params.client ?? defaultSql;
  const coach = Number(params.coach_id);
  const ath = Number(params.athlete_id);
  const instance = await loadIsolatedInstance({
    client,
    coach_id: coach,
    athlete_id: ath,
    iso_date: params.iso_date,
    template_id: params.template_id,
  });
  if (!instance) return null;
  const target = await resolveTarget({
    client,
    coach_id: coach,
    athlete_id: ath,
    iso_date: params.iso_date,
    instance,
  });
  if (!target) return null;
  const other_athletes = await countOtherAthletes({
    client,
    coach_id: coach,
    athlete_id: ath,
    target,
  });
  return { target, other_athletes };
}

async function loadInstanceBlocks(params: {
  client: Sql;
  coach_id: number;
  template_id: number;
}): Promise<InstanceBlockRow[]> {
  const detail = await getTemplateDetail({
    coach_id: params.coach_id,
    template_id: params.template_id,
    client: params.client,
  });
  if (!detail) return [];
  return detail.blocks.map((b) => ({
    block_position: b.block_position,
    block_title: b.block_title,
    block_format: b.block_format,
    coach_note: b.coach_note,
    items: b.items.map((it) => ({
      id: it.id,
      position: it.position,
      exercise_id: Number(it.exercise_id),
      exercise_name: it.exercise_name,
      params_json: it.params_json,
      prescription_json: it.prescription_json,
      notes: it.notes,
    })),
  }));
}

async function loadInstanceCircuits(
  client: Sql,
  templateId: number,
): Promise<Map<number, CircuitConfig>> {
  const rows = await client<
    Array<{
      block_position: number;
      rounds: number | null;
      pacing: string | null;
      work_seconds: number | null;
      rest_between_stations_seconds: number | null;
      rest_between_rounds_seconds: number | null;
    }>
  >`
    select
      block_position,
      rounds,
      pacing,
      work_seconds,
      rest_between_stations_seconds,
      rest_between_rounds_seconds
    from template_blocks
    where template_id = ${templateId}
  `;
  const out = new Map<number, CircuitConfig>();
  for (const row of rows) {
    const circuit = circuitFromTemplateBlockRow(row);
    if (circuit) out.set(row.block_position, circuit);
  }
  return out;
}

async function copyToLibraryTemplate(params: {
  client: Sql;
  coach_id: number;
  instance: IsolatedRow;
  targetId: number;
}): Promise<void> {
  const segs = await params.client<
    Array<{
      position: number;
      block_position: number;
      block_title: string | null;
      block_format: string | null;
      block_coach_note: string | null;
      exercise_id: string;
      params_json: Record<string, unknown> | null;
      notes: string | null;
      prescription_json: unknown;
    }>
  >`
    select
      position,
      block_position,
      block_title,
      block_format,
      block_coach_note,
      exercise_id::text as exercise_id,
      params_json,
      notes,
      prescription_json
    from template_segments
    where template_id = ${params.instance.template_id}
    order by position
  `;

  await updateTemplate({
    coach_id: params.coach_id,
    template_id: params.targetId,
    client: params.client,
    payload: {
      name: params.instance.name,
      ...(templateFormat.safeParse(params.instance.format).success
        ? { format: templateFormat.parse(params.instance.format) }
        : {}),
      coach_notes: params.instance.coach_notes,
      segments: segs.map((s) => ({
        exercise_id: Number(s.exercise_id),
        position: s.position,
        block_position: s.block_position,
        block_format: s.block_format,
        block_title: s.block_title,
        block_coach_note: s.block_coach_note,
        params_json: s.params_json ?? {},
        notes: s.notes,
        prescription_json: s.prescription_json ?? null,
      })),
    },
  });

  await params.client`delete from template_blocks where template_id = ${params.targetId}`;
  const circuits = await loadInstanceCircuits(params.client, params.instance.template_id);
  for (const [blockPosition, circuit] of circuits) {
    await insertTemplateBlockCircuit(params.client, params.targetId, blockPosition, circuit);
  }
}

async function copyToWeekSession(params: {
  client: Sql;
  coach_id: number;
  instance: IsolatedRow;
  target: Extract<RecipeTarget, { kind: 'week_session' }>;
}): Promise<void> {
  const week = await getWeekTemplate({
    coach_id: params.coach_id,
    id: params.target.id,
    client: params.client,
  });
  if (!week) {
    throw new RecipePromoteError('not_found', 'Semana de la receta no encontrada', 404);
  }

  const blocks = await loadInstanceBlocks({
    client: params.client,
    coach_id: params.coach_id,
    template_id: params.instance.template_id,
  });
  const circuits = await loadInstanceCircuits(params.client, params.instance.template_id);
  const parts = instanceBlocksToWeekParts(blocks, params.instance.format, circuits);

  const days = week.slots_json.days;
  const original: WeekDay =
    days.find((d) => d.day_of_week === params.target.day_of_week) ?? {
      day_of_week: params.target.day_of_week,
      sessions: [],
    };

  const nextSession: WeekSession = {
    kind: 'workout',
    template_id: null,
    blocks: parts,
  };
  const focus = params.instance.name.trim();
  if (focus) nextSession.focus = focus.slice(0, 120);
  const notes = params.instance.coach_notes?.trim();
  if (notes) nextSession.notes = notes.slice(0, 800);

  const sessions = original.sessions.slice();
  if (params.target.session_index < sessions.length) {
    sessions[params.target.session_index] = nextSession;
  } else {
    sessions.push(nextSession);
  }

  const nextDay: WeekDay = {
    ...original,
    day_of_week: params.target.day_of_week,
    sessions,
  };
  delete nextDay.kind;
  if (nextDay.recovery_suggestions) delete nextDay.recovery_suggestions;

  const payload: ProgramWeekUpsert = {
    name: week.name,
    focus: week.focus,
    coach_notes: week.coach_notes,
    slots_json: { days: mergeDayIntoDays(days, nextDay) },
  };

  await upsertWeekTemplate({
    coach_id: params.coach_id,
    id: params.target.id,
    payload,
    client: params.client,
  });
}

export async function copyAthleteInstanceDayToRecipe(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  iso_date: string;
  payload: unknown;
  actor: Actor;
  channel?: AuditChannel;
  client?: Sql;
}): Promise<{ target: RecipeTarget; other_athletes: number }> {
  const parsed = promoteBodySchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new TemplateError('invalid_payload', parsed.error.message, 400);
  }
  const client = params.client ?? defaultSql;
  const coach = Number(params.coach_id);
  const ath = Number(params.athlete_id);

  const instance = await loadIsolatedInstance({
    client,
    coach_id: coach,
    athlete_id: ath,
    iso_date: params.iso_date,
    template_id: parsed.data.template_id,
  });
  if (!instance) {
    throw new RecipePromoteError(
      'not_found',
      'Entreno del atleta no encontrado para ese día',
      404,
    );
  }

  const target = await resolveTarget({
    client,
    coach_id: coach,
    athlete_id: ath,
    iso_date: params.iso_date,
    instance,
  });
  if (!target) {
    throw new RecipePromoteError(
      'no_recipe',
      'Este día no nació de una receta del plan',
      404,
    );
  }

  const other_athletes = await countOtherAthletes({
    client,
    coach_id: coach,
    athlete_id: ath,
    target,
  });
  if (other_athletes > 0 && !parsed.data.confirm) {
    throw new RecipePromoteError(
      'needs_confirm',
      other_athletes === 1
        ? `1 atleta más sigue usando la receta «${target.name}»`
        : `${other_athletes} atletas más siguen usando la receta «${target.name}»`,
      409,
      { target, other_athletes },
    );
  }

  await withOwnOrAmbientTx(client, async (tx) => {
    if (target.kind === 'library_template') {
      await copyToLibraryTemplate({
        client: tx,
        coach_id: coach,
        instance,
        targetId: target.id,
      });
    } else {
      await copyToWeekSession({
        client: tx,
        coach_id: coach,
        instance,
        target,
      });
    }

    await recordAudit(tx, {
      entity_type: target.kind === 'library_template' ? 'templates' : 'program_week_templates',
      entity_id: BigInt(target.id),
      action: 'update',
      actor: params.actor,
      channel: params.channel,
      diff: {
        promoted_from_instance: instance.template_id,
        athlete_id: ath,
        iso_date: params.iso_date,
        recipe_kind: target.kind,
        other_athletes,
      },
    });
  });

  return { target, other_athletes };
}
