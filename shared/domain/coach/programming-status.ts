import type { Sql } from 'postgres';
import { isPgMissingRelation } from '../db/pg-errors';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate, startOfDayInBox } from '../dates';

export type ProgrammingStatus =
  | 'ok'
  | 'no_month'
  | 'pending_proposal'
  | 'empty_week'
  | 'month_2_pending';

export type AthleteProgrammingStatus = {
  athlete_id: string;
  status: ProgrammingStatus;
  label: string;
  detail: string | null;
};

export async function getAthleteProgrammingStatus(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<AthleteProgrammingStatus> {
  const client = params.client;
  const today = startOfDayInBox(params.on_date ?? new Date());
  const weekStart = isoDateString(mondayOfWeek(today));
  const weekEnd = isoDateString(addDays(mondayOfWeek(today), 6));

  try {
    // An athlete "has a plan" when there's a microciclo assignment on record: a row
    // in `athlete_month_assignments` (the materialization receipt). This is the only
    // assignment path — the ORDER of microciclos IS the plan.
    const monthCount = await client<Array<{ n: number }>>`
      select count(*)::int as n from athlete_month_assignments
      where athlete_id = ${params.athlete_id as number}
    `;
    const hasMonthPlan = (monthCount[0]?.n ?? 0) > 0;

    if (!hasMonthPlan) {
      return {
        athlete_id: String(params.athlete_id),
        status: 'no_month',
        label: 'Sin mes asignado',
        detail: 'Asignar primer mes desde plan o intake',
      };
    }

    const pendingMonth = await client<Array<{ id: string }>>`
      select id::text from monthly_block_proposals
      where athlete_id = ${params.athlete_id as number} and status = 'pending'
      limit 1
    `;
    if (pendingMonth[0]) {
      return {
        athlete_id: String(params.athlete_id),
        status: 'month_2_pending',
        label: 'Mes siguiente pendiente',
        detail: 'Pablo debe validar el bloque mensual propuesto',
      };
    }

    const pendingWeek = await client<Array<{ id: string }>>`
      select id::text from week_adjustment_proposals
      where athlete_id = ${params.athlete_id as number}
        and status = 'pending'
        and verdict = 'needs_adjustment'
      limit 1
    `;
    if (pendingWeek[0]) {
      return {
        athlete_id: String(params.athlete_id),
        status: 'pending_proposal',
        label: 'Propuesta IA pendiente',
        detail: 'Revisar ajuste semanal propuesto',
      };
    }

    const weekSessions = await client<Array<{ n: number }>>`
      select count(*)::int as n from workout_assignments
      where athlete_id = ${params.athlete_id as number}
        and scheduled_for >= ${weekStart}::date
        and scheduled_for <= ${weekEnd}::date
    `;
    if ((weekSessions[0]?.n ?? 0) === 0) {
      const lastMonth = await client<Array<{ end_date: string }>>`
        select to_char(max(end_date), 'YYYY-MM-DD') as end_date
        from athlete_month_assignments where athlete_id = ${params.athlete_id as number}
      `;
      const end = lastMonth[0]?.end_date;
      if (end && parseIsoDate(end) < today) {
        return {
          athlete_id: String(params.athlete_id),
          status: 'month_2_pending',
          label: 'Semana bloqueada',
          detail: 'Fin de mes sin bloque aprobado — atleta no ve semana 5+',
        };
      }
      return {
        athlete_id: String(params.athlete_id),
        status: 'empty_week',
        label: 'Semana vacía',
        detail: 'No hay entrenos programados esta semana',
      };
    }

    return {
      athlete_id: String(params.athlete_id),
      status: 'ok',
      label: 'Plan OK',
      detail: null,
    };
  } catch (err) {
    if (
      isPgMissingRelation(err, 'athlete_month_assignments') ||
      isPgMissingRelation(err, 'monthly_block_proposals') ||
      isPgMissingRelation(err, 'week_adjustment_proposals')
    ) {
      return {
        athlete_id: String(params.athlete_id),
        status: 'ok',
        label: 'Plan OK',
        detail: null,
      };
    }
    throw err;
  }
}

export async function loadProgrammingStatusMap(params: {
  athlete_ids: Array<number | bigint>;
  client: Sql;
}): Promise<Map<string, AthleteProgrammingStatus>> {
  const map = new Map<string, AthleteProgrammingStatus>();
  for (const id of params.athlete_ids) {
    const s = await getAthleteProgrammingStatus({ athlete_id: id, client: params.client });
    map.set(String(id), s);
  }
  return map;
}
