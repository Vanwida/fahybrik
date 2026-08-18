import type { Sql } from 'postgres';
import { isPgMissingRelation } from '../db/pg-errors';
import { addDays, isoDateString, mondayOfWeek, startOfDayInBox } from '../dates';

export type ProgrammingStatus =
  | 'ok'
  | 'no_month'
  | 'pending_proposal'
  | 'empty_week'
  | 'month_2_pending'
  | 'block_ended';

export type ProgrammingCta = 'reponer_bloque' | 'validar_propuesta' | null;

export type AthleteProgrammingStatus = {
  athlete_id: string;
  status: ProgrammingStatus;
  label: string;
  detail: string | null;
  cta: ProgrammingCta;
  cta_label: string | null;
};

export type ProgrammingFacts = {
  has_month_plan: boolean;
  has_pending_month_proposal: boolean;
  has_pending_week_proposal: boolean;
  week_session_count: number;
  /** YYYY-MM-DD del último `athlete_month_assignments.end_date`. */
  last_month_end: string | null;
  /** YYYY-MM-DD del día de caja. */
  today: string;
};

type ProgrammingView = {
  label: string;
  detail: string | null;
  cta: ProgrammingCta;
  cta_label: string | null;
};

/** Copy y CTA por estado. `month_2_pending` es la propuesta mensual, no el
 *  ajuste semanal (`pending_proposal`) ni el bloque que ya se acabó. */
export const PROGRAMMING_VIEW: Record<ProgrammingStatus, ProgrammingView> = {
  ok: { label: 'Plan OK', detail: null, cta: null, cta_label: null },
  no_month: {
    label: 'Sin mes asignado',
    detail: 'Asignar primer mes desde plan o intake',
    cta: null,
    cta_label: null,
  },
  pending_proposal: {
    label: 'Propuesta IA pendiente',
    detail: 'Revisar ajuste semanal propuesto',
    cta: null,
    cta_label: null,
  },
  empty_week: {
    label: 'Semana vacía',
    detail: 'No hay entrenos programados esta semana',
    cta: null,
    cta_label: null,
  },
  month_2_pending: {
    label: 'Propuesta de mes pendiente',
    detail: 'Hay un bloque mensual por validar',
    cta: 'validar_propuesta',
    cta_label: 'Validar propuesta',
  },
  block_ended: {
    label: 'Bloque terminado',
    detail: 'Sin siguiente bloque',
    cta: 'reponer_bloque',
    cta_label: 'Reponer bloque',
  },
};

export function isSinPlanStatus(status: ProgrammingStatus): boolean {
  return status === 'no_month';
}

function viewed(status: ProgrammingStatus): Omit<AthleteProgrammingStatus, 'athlete_id'> {
  return { status, ...PROGRAMMING_VIEW[status] };
}

/**
 * Parte los dos huecos que `month_2_pending` mezclaba: acabó y no hay
 * siguiente (`block_ended`) vs hay propuesta mensual por validar
 * (`month_2_pending`). `pending_proposal` sigue siendo el ajuste semanal.
 * No auto-asigna.
 */
export function classifyProgrammingStatus(facts: ProgrammingFacts): Omit<
  AthleteProgrammingStatus,
  'athlete_id'
> {
  if (!facts.has_month_plan) return viewed('no_month');
  if (facts.has_pending_month_proposal) return viewed('month_2_pending');
  if (facts.has_pending_week_proposal) return viewed('pending_proposal');
  if (facts.week_session_count === 0) {
    const end = facts.last_month_end;
    if (end && end < facts.today) return viewed('block_ended');
    return viewed('empty_week');
  }
  return viewed('ok');
}

export async function getAthleteProgrammingStatus(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<AthleteProgrammingStatus> {
  const client = params.client;
  const today = startOfDayInBox(params.on_date ?? new Date());
  const weekStart = isoDateString(mondayOfWeek(today));
  const weekEnd = isoDateString(addDays(mondayOfWeek(today), 6));
  const athlete_id = String(params.athlete_id);

  try {
    // An athlete "has a plan" when there's a microciclo assignment on record: a row
    // in `athlete_month_assignments` (the materialization receipt). This is the only
    // assignment path — the ORDER of microciclos IS the plan.
    const monthCount = await client<Array<{ n: number }>>`
      select count(*)::int as n from athlete_month_assignments
      where athlete_id = ${params.athlete_id as number}
    `;
    const hasMonthPlan = (monthCount[0]?.n ?? 0) > 0;

    const pendingMonth = hasMonthPlan
      ? await client<Array<{ id: string }>>`
          select id::text from monthly_block_proposals
          where athlete_id = ${params.athlete_id as number} and status = 'pending'
          limit 1
        `
      : [];

    const pendingWeek = hasMonthPlan && !pendingMonth[0]
      ? await client<Array<{ id: string }>>`
          select id::text from week_adjustment_proposals
          where athlete_id = ${params.athlete_id as number}
            and status = 'pending'
            and verdict = 'needs_adjustment'
          limit 1
        `
      : [];

    let weekSessionCount = 0;
    let lastMonthEnd: string | null = null;
    if (hasMonthPlan && !pendingMonth[0] && !pendingWeek[0]) {
      const weekSessions = await client<Array<{ n: number }>>`
        select count(*)::int as n from workout_assignments
        where athlete_id = ${params.athlete_id as number}
          and scheduled_for >= ${weekStart}::date
          and scheduled_for <= ${weekEnd}::date
      `;
      weekSessionCount = weekSessions[0]?.n ?? 0;
      if (weekSessionCount === 0) {
        const lastMonth = await client<Array<{ end_date: string }>>`
          select to_char(max(end_date), 'YYYY-MM-DD') as end_date
          from athlete_month_assignments where athlete_id = ${params.athlete_id as number}
        `;
        lastMonthEnd = lastMonth[0]?.end_date ?? null;
      }
    }

    return {
      athlete_id,
      ...classifyProgrammingStatus({
        has_month_plan: hasMonthPlan,
        has_pending_month_proposal: Boolean(pendingMonth[0]),
        has_pending_week_proposal: Boolean(pendingWeek[0]),
        week_session_count: weekSessionCount,
        last_month_end: lastMonthEnd,
        today: isoDateString(today),
      }),
    };
  } catch (err) {
    if (
      isPgMissingRelation(err, 'athlete_month_assignments') ||
      isPgMissingRelation(err, 'monthly_block_proposals') ||
      isPgMissingRelation(err, 'week_adjustment_proposals')
    ) {
      return { athlete_id, ...viewed('ok') };
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
