import type { Sql } from 'postgres';
import { isPgMissingRelation } from '../db/pg-errors';
import { addDays, isoDateString, mondayOfWeek, startOfDayInBox } from '../dates';

export type ProgrammingStatus =
  | 'ok'
  | 'no_month'
  | 'pending_proposal'
  | 'empty_week'
  | 'month_2_pending'
  | 'block_ended'
  | 'starts_soon';

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
  /**
   * Entrenos puestos por el coach desde el lunes de esta semana en adelante.
   * Un atleta con entrenos sueltos (sin programa asignado) TIENE plan: «Sin
   * plan» con un próximo entreno en la ficha era una contradicción. Sin el
   * dato (undefined) se clasifica como antes, solo por el recibo del programa.
   */
  upcoming_session_count?: number;
  /**
   * YYYY-MM-DD del último entreno del coach ANTES de esta semana (con o sin
   * programa). Quien entrenó entrenos del coach no «nunca ha tenido programa»:
   * se le acabó (informe C: «nunca» salía por no tener recibo de programa).
   */
  last_coach_session?: string | null;
  /**
   * YYYY-MM-DD de lo siguiente que ya tiene asignado DESPUÉS de esta semana (el
   * inicio de su próximo programa o su próximo entreno suelto).
   */
  next_start?: string | null;
  /** YYYY-MM-DD del domingo de la semana que viene (hasta ahí, «empieza pronto»). */
  next_week_end?: string;
  /** Hoy está dentro de un programa (su recibo cubre hoy). */
  has_current_program?: boolean;
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
  starts_soon: {
    label: 'Empieza pronto',
    detail: 'Su programa empieza la semana que viene',
    cta: null,
    cta_label: null,
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
  const upcoming = facts.upcoming_session_count ?? 0;
  if (!facts.has_month_plan && upcoming === 0) {
    // Nunca = nunca tuvo entrenos del coach. Si los tuvo, se le acabó.
    return viewed(facts.last_coach_session ? 'block_ended' : 'no_month');
  }
  if (facts.has_pending_month_proposal) return viewed('month_2_pending');
  if (facts.has_pending_week_proposal) return viewed('pending_proposal');
  if (facts.week_session_count === 0) {
    const end = maxIso(facts.last_month_end, facts.last_coach_session ?? null);
    // Con entrenos más adelante no está terminado: es una semana sin nada…
    if (upcoming === 0 && end && end < facts.today) return viewed('block_ended');
    // …salvo que lo siguiente sea un programa que arranca ya la semana que viene
    // (sin estar dentro de otro): eso no es un hueco, es «empieza pronto».
    if (
      !facts.has_current_program &&
      facts.next_start &&
      facts.next_week_end &&
      facts.next_start <= facts.next_week_end
    ) {
      return viewed('starts_soon');
    }
    return viewed('empty_week');
  }
  return viewed('ok');
}

function maxIso(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  return a > b ? a : b;
}

export async function getAthleteProgrammingStatus(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<AthleteProgrammingStatus> {
  // Un atleta = el lote de uno: misma consulta y misma clasificación que el
  // roster, Hoy y el motor (antes eran dos caminos que podían divergir).
  const map = await loadProgrammingStatusMap({
    athlete_ids: [params.athlete_id],
    on_date: params.on_date,
    client: params.client,
  });
  const athlete_id = String(params.athlete_id);
  return map.get(athlete_id) ?? { athlete_id, ...viewed('no_month') };
}

/**
 * El estado de programación de N atletas en UNA consulta (subconsultas
 * correlacionadas en una sola ida y vuelta). Sustituye al bucle `for … await`
 * de 1–5 consultas por atleta que costaba ≈310 consultas en serie a 100 atletas
 * (auditoría del panel, informe B §2.5). Misma clasificación
 * (`classifyProgrammingStatus`) y mismos hechos que `loadPlanFacts`.
 */
export async function loadProgrammingStatusMap(params: {
  athlete_ids: Array<number | bigint>;
  on_date?: Date;
  client: Sql;
}): Promise<Map<string, AthleteProgrammingStatus>> {
  const map = new Map<string, AthleteProgrammingStatus>();
  const ids = [...new Set(params.athlete_ids.map((id) => Number(id)))];
  if (ids.length === 0) return map;

  const today = startOfDayInBox(params.on_date ?? new Date());
  const todayIso = isoDateString(today);
  const weekStart = isoDateString(mondayOfWeek(today));
  const weekEnd = isoDateString(addDays(mondayOfWeek(today), 6));
  const nextWeekEnd = isoDateString(addDays(mondayOfWeek(today), 13));

  try {
    const rows = await params.client<
      Array<{
        athlete_id: string;
        n_months: number;
        last_end: string | null;
        pending_month: boolean;
        pending_week: boolean;
        week_sessions: number;
        upcoming: number;
        last_coach_session: string | null;
        next_start: string | null;
        has_current: boolean;
      }>
    >`
      select
        a.id::text as athlete_id,
        (select count(*) from athlete_month_assignments m where m.athlete_id = a.id)::int as n_months,
        (
          select to_char(max(m.end_date), 'YYYY-MM-DD')
          from athlete_month_assignments m where m.athlete_id = a.id
        ) as last_end,
        exists (
          select 1 from monthly_block_proposals p
          where p.athlete_id = a.id and p.status = 'pending'
        ) as pending_month,
        exists (
          select 1 from week_adjustment_proposals p
          where p.athlete_id = a.id and p.status = 'pending' and p.verdict = 'needs_adjustment'
        ) as pending_week,
        (
          select count(*) from workout_assignments w
          where w.athlete_id = a.id
            and w.scheduled_for >= ${weekStart}::date
            and w.scheduled_for <= ${weekEnd}::date
        )::int as week_sessions,
        (
          select count(*) from workout_assignments w
          where w.athlete_id = a.id
            and w.origin = 'coach'
            and w.scheduled_for >= ${weekStart}::date
        )::int as upcoming,
        (
          select to_char(max(w.scheduled_for), 'YYYY-MM-DD') from workout_assignments w
          where w.athlete_id = a.id and w.origin = 'coach' and w.scheduled_for < ${weekStart}::date
        ) as last_coach_session,
        (
          select to_char(least(
            (select min(m.start_date) from athlete_month_assignments m
              where m.athlete_id = a.id and m.start_date > ${weekEnd}::date),
            (select min(w.scheduled_for) from workout_assignments w
              where w.athlete_id = a.id and w.origin = 'coach' and w.scheduled_for > ${weekEnd}::date)
          ), 'YYYY-MM-DD')
        ) as next_start,
        exists (
          select 1 from athlete_month_assignments m
          where m.athlete_id = a.id and ${todayIso}::date between m.start_date and m.end_date
        ) as has_current
      from athletes a
      where a.id = any(${ids}::bigint[])
    `;
    for (const r of rows) {
      map.set(r.athlete_id, {
        athlete_id: r.athlete_id,
        ...classifyProgrammingStatus({
          has_month_plan: r.n_months > 0,
          has_pending_month_proposal: r.pending_month,
          has_pending_week_proposal: r.pending_week,
          week_session_count: r.week_sessions,
          last_month_end: r.last_end,
          today: todayIso,
          upcoming_session_count: r.upcoming,
          last_coach_session: r.last_coach_session,
          next_start: r.next_start,
          next_week_end: nextWeekEnd,
          has_current_program: r.has_current,
        }),
      });
    }
  } catch (err) {
    if (
      isPgMissingRelation(err, 'athlete_month_assignments') ||
      isPgMissingRelation(err, 'monthly_block_proposals') ||
      isPgMissingRelation(err, 'week_adjustment_proposals')
    ) {
      for (const id of ids) map.set(String(id), { athlete_id: String(id), ...viewed('ok') });
      return map;
    }
    throw err;
  }
  return map;
}
