import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, parseIsoDate, mondayOfWeek } from '@fahybrid/shared/domain/atr/dates';
import { getMonthTemplate } from './program-months';
import { getWeekTemplate } from './program-weeks';
import { parseWeekSlotsFromDb } from './program-week-slots';
import type { WeekSlots } from '@fahybrid/shared/schema/program-templates';
import {
  parseAvailability,
  parsePreferredWeek,
  remapWeekDaysToAvailability,
} from '@fahybrid/shared/domain/coach/intake-availability';

export type InstantiateMonthResult = {
  month_assignment_id: string;
  assignment_count: number;
  start_date: string;
  end_date: string;
  microcycle_ids: string[];
};

export class InstantiateProgramError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'InstantiateProgramError';
  }
}

export async function instantiateMonthFromTemplate(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  month_template_id: number | bigint;
  start_date: string;
  client?: Sql;
}): Promise<InstantiateMonthResult> {
  const client = params.client ?? defaultSql;

  const athleteRows = await client<
    Array<{ id: string; availability_json: unknown; preferred_week_json: unknown }>
  >`
    select id::text, availability_json, preferred_week_json
    from athletes
    where id = ${params.athlete_id as number}
      and coach_id = ${params.coach_id as number}
    limit 1
  `;
  if (!athleteRows[0]) {
    throw new InstantiateProgramError('not_found', 'Athlete not found', 404);
  }

  // Step 5/6 intake — sessions only land on the athlete's `program` days, softly
  // biased to their preferred day-TYPE. Empty availability → remap is identity.
  const availability = parseAvailability(athleteRows[0].availability_json);
  const preferredWeek = parsePreferredWeek(athleteRows[0].preferred_week_json);

  const month = await getMonthTemplate({
    coach_id: params.coach_id,
    id: params.month_template_id,
    client,
  });
  if (!month) {
    throw new InstantiateProgramError('not_found', 'Month template not found', 404);
  }
  if (month.weeks.length === 0) {
    throw new InstantiateProgramError('empty_month', 'Month template has no weeks', 400);
  }

  const startMonday = mondayOfWeek(parseIsoDate(params.start_date));
  const startIso = isoDateString(startMonday);
  const weekCount = month.weeks.length;
  const endIso = isoDateString(addDays(startMonday, weekCount * 7 - 1));

  const macroRows = await client<Array<{ id: string; status: string }>>`
    select id::text, status::text
    from atr_macrocycles
    where athlete_id = ${params.athlete_id as number}
      and status in ('planned', 'active')
    order by start_date desc
    limit 1
  `;
  const macro = macroRows[0];
  if (!macro) {
    throw new InstantiateProgramError(
      'no_macrocycle',
      'Athlete has no macrocycle — complete intake first',
      400,
    );
  }

  let assignmentCount = 0;
  const microcycleIds: string[] = [];
  let monthAssignmentId = '0';

  await client.begin(async (tx) => {
    if (macro.status === 'planned') {
      await tx`
        update atr_macrocycles set status = 'active', updated_at = now()
        where id = ${Number(macro.id)}
      `;
    }

    for (let wi = 0; wi < month.weeks.length; wi++) {
      const weekMeta = month.weeks[wi]!;
      const weekStart = addDays(startMonday, wi * 7);
      const weekEnd = addDays(weekStart, 6);
      const weekStartIso = isoDateString(weekStart);
      const weekEndIso = isoDateString(weekEnd);

      const microId = await resolveOrCreateMicrocycle({
        client: tx as unknown as Sql,
        athlete_id: params.athlete_id,
        macrocycle_id: macro.id,
        week_start: weekStartIso,
        week_end: weekEndIso,
        week_number: wi + 1,
      });
      microcycleIds.push(microId);

      const weekTpl = await getWeekTemplate({
        coach_id: params.coach_id,
        id: Number(weekMeta.week_template_id),
        client: tx as unknown as Sql,
      });
      if (!weekTpl) {
        throw new InstantiateProgramError(
          'week_not_found',
          `Week template ${weekMeta.week_template_id} missing`,
          400,
        );
      }

      const slots: WeekSlots =
        typeof weekTpl.slots_json === 'object' && weekTpl.slots_json !== null
          ? (weekTpl.slots_json as WeekSlots)
          : parseWeekSlotsFromDb(weekTpl.slots_json);

      const placedDays = remapWeekDaysToAvailability({
        days: slots.days,
        availability,
        preferredWeek,
      }).days;

      for (const day of placedDays) {
        const dayDate = addDays(weekStart, day.day_of_week - 1);
        const dayIso = isoDateString(dayDate);

        // sessions[] → notes label. Idx 0 → 'am', idx 1 → 'pm', idx 2+ → 'slot:N'.
        // iOS lee notes con `slotFromNotes` → mantiene compat AM/PM existente.
        for (let i = 0; i < day.sessions.length; i++) {
          const session = day.sessions[i]!;
          const slotLabel: 'am' | 'pm' | `slot:${number}` =
            i === 0 ? 'am' : i === 1 ? 'pm' : `slot:${i + 1}`;
          assignmentCount += await insertSlotAssignment({
            client: tx as unknown as Sql,
            athlete_id: params.athlete_id,
            microcycle_id: microId,
            scheduled_for: dayIso,
            slot: slotLabel,
            daySlot: {
              kind: session.kind,
              template_id:
                session.template_id != null ? String(session.template_id) : null,
            },
          });
        }
      }
    }

    const assignRows = await tx<Array<{ id: string }>>`
      insert into athlete_month_assignments (
        athlete_id,
        month_template_id,
        start_date,
        end_date,
        microcycle_ids,
        assignment_count,
        created_by_coach_id
      )
      values (
        ${params.athlete_id as number},
        ${params.month_template_id as number},
        ${startIso}::date,
        ${endIso}::date,
        ${microcycleIds.map(Number)}::bigint[],
        ${assignmentCount},
        ${params.coach_id as number}
      )
      returning id::text
    `;
    monthAssignmentId = assignRows[0]!.id;
  });

  return {
    month_assignment_id: monthAssignmentId,
    assignment_count: assignmentCount,
    start_date: startIso,
    end_date: endIso,
    microcycle_ids: microcycleIds,
  };
}

async function resolveOrCreateMicrocycle(params: {
  client: Sql;
  athlete_id: number | bigint;
  macrocycle_id: string;
  week_start: string;
  week_end: string;
  week_number: number;
}): Promise<string> {
  const db = params.client as Sql;
  const existing = await db<Array<{ id: string }>>`
    select mc.id::text
    from microcycles mc
    join atr_blocks b on b.id = mc.block_id
    where b.macrocycle_id = ${Number(params.macrocycle_id)}
      and mc.start_date <= ${params.week_end}::date
      and mc.end_date >= ${params.week_start}::date
    order by mc.start_date asc
    limit 1
  `;
  if (existing[0]) return existing[0].id;

  const blockRows = await db<Array<{ id: string }>>`
    select b.id::text
    from atr_blocks b
    where b.macrocycle_id = ${Number(params.macrocycle_id)}
      and b.start_date <= ${params.week_end}::date
      and b.end_date >= ${params.week_start}::date
    order by b.position asc
    limit 1
  `;
  const blockId = blockRows[0]?.id;
  if (!blockId) {
    throw new InstantiateProgramError(
      'no_block',
      'No ATR block covers the assignment week range',
      400,
    );
  }

  const ins = await db<Array<{ id: string }>>`
    insert into microcycles (block_id, week_number, start_date, end_date)
    values (
      ${Number(blockId)},
      ${params.week_number},
      ${params.week_start}::date,
      ${params.week_end}::date
    )
    returning id::text
  `;
  return ins[0]!.id;
}

async function insertSlotAssignment(params: {
  client: Sql;
  athlete_id: number | bigint;
  microcycle_id: string;
  scheduled_for: string;
  slot: 'am' | 'pm' | `slot:${number}`;
  daySlot: { kind: string; template_id?: string | null };
}): Promise<number> {
  if (params.daySlot.kind !== 'workout' || !params.daySlot.template_id) return 0;

  const templateId = Number(params.daySlot.template_id);
  const versionRows = await params.client<Array<{ version: number }>>`
    select coalesce(max(version), 1)::int as version
    from templates where id = ${templateId}
  `;
  const version = versionRows[0]?.version ?? 1;

  await params.client`
    insert into workout_assignments (
      athlete_id,
      microcycle_id,
      scheduled_for,
      template_id,
      template_version,
      status,
      notes
    )
    values (
      ${params.athlete_id as number},
      ${Number(params.microcycle_id)},
      ${params.scheduled_for}::date,
      ${templateId},
      ${version},
      'scheduled',
      ${`slot:${params.slot}`}
    )
  `;
  return 1;
}
