// Cómo se resuelve UNA sesión del día antes de tocarla.
//
// Lo usan `move_session`, `delete_session` y el día ambiguo de `edit_day`: el
// coach habla en fechas, el plan puede tener dos sesiones el mismo día, y
// equivocarse de una es el fallo más caro. La regla es una sola: si no está
// claro cuál, se lista y NO SE TOCA NADA.

import { z } from 'zod';
import { buildAthletePlan, type PlanSession } from '@/lib/dashboard/coach/athlete-plan';
import { sql } from '@/lib/db';
import { ok } from './runtime';

export const sessionIdArg = z
  .number()
  .int()
  .positive()
  .describe('El session_id que devuelve get_plan (el assignment_id de esa sesión).');

/** Cómo se avisa de que una sesión con dos candidatas no se ha tocado. */
export function ambiguousDay(params: {
  athlete_name: string;
  iso_date: string;
  sessions: PlanSession[];
  what: string;
}) {
  return ok(
    {
      touched: false,
      iso_date: params.iso_date,
      sessions: params.sessions.map((s) => ({
        session_id: s.assignment_id,
        title: s.title,
        status: s.status,
      })),
    },
    `${params.athlete_name} tiene ${params.sessions.length} sesiones el ${params.iso_date}: ` +
      `dime cuál con session_id y ${params.what}. No he tocado nada.`,
  );
}

/** Las sesiones de un día, por el mismo camino que las lee `get_session`. */
export async function sessionsOnDate(params: {
  coach_id: bigint;
  athlete_id: number;
  iso_date: string;
}): Promise<PlanSession[]> {
  const plan = await buildAthletePlan({
    coach_id: params.coach_id,
    athlete_id: params.athlete_id,
    view_mode: 'week',
    anchor_iso: params.iso_date,
  });
  return plan.weeks[0]?.days.find((d) => d.iso_date === params.iso_date)?.sessions ?? [];
}

/**
 * Una sesión por id, con su fecha y su nombre. Scoped al atleta Y al coach: la
 * de otro club se responde igual que una que no existe.
 */
export async function findSessionById(params: {
  coach_id: bigint;
  athlete_id: number;
  assignment_id: number;
}): Promise<PlanSession | undefined> {
  const rows = await sql<
    Array<{ id: string; iso: string; title: string; status: string; format: string | null }>
  >`
    select wa.id::text as id,
           to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso,
           t.name as title,
           wa.status::text as status,
           t.format::text as format
    from workout_assignments wa
    join athletes a on a.id = wa.athlete_id
    left join templates t on t.id = wa.template_id
    where wa.id = ${params.assignment_id}
      and wa.athlete_id = ${params.athlete_id}
      and a.coach_id = ${Number(params.coach_id)}
    limit 1
  `;
  const row = rows[0];
  if (!row) return undefined;
  return {
    assignment_id: row.id,
    iso_date: row.iso,
    title: row.title ?? 'Entreno',
    dose_lines: [],
    dose_more: 0,
    status: row.status as PlanSession['status'],
    duration_min: null,
    format: row.format,
    rpe: null,
    modality: null,
  };
}

export function isPendingSession(session: PlanSession): boolean {
  return session.status === 'scheduled';
}
