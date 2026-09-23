// Copy de los avisos «tu plan está publicado», en UN solo sitio.
//
// Por qué existe este módulo: la misma frase estaba copiada verbatim en seis
// ficheros (dos rutas de assign, advance, dobles, publishWeek ×2 y el cron), y
// las seis decían «Pablo». Este software se vende a cualquier entrenador: el
// atleta tiene que leer el nombre de SU coach, no el de otro.
//
// El nombre es DATO del coach (`coaches.full_name`); la frase es MECANISMO
// nuestro. Por eso el nombre se resuelve en cada envío y la plantilla vive aquí.

import type { Sql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { athleteSeesItFromWeeklyStatus } from '@fahybrid/shared/domain/coach/athlete-week-chip';
import { notifyAthlete } from './dispatch';

/** Cómo se nombra al coach cuando su ficha aún no tiene nombre (alta recién
 *  creada desde Clerk sin perfil, `coaches.full_name` vacío). Sujeto neutro y
 *  honesto: no inventamos un nombre ni dejamos la frase coja. */
export const COACH_FALLBACK_NAME = 'Tu entrenador';

/**
 * El nombre con el que el coach de este atleta le habla en un aviso.
 * Vacío o ausente → `COACH_FALLBACK_NAME`.
 */
export async function coachDisplayNameForAthlete(
  sql: Sql,
  athlete_id: bigint,
): Promise<string> {
  const rows = await sql<{ coach_name: string | null }[]>`
    select c.full_name as coach_name
    from athletes a
    join coaches c on c.id = a.coach_id
    where a.id = ${athlete_id as unknown as number}
    limit 1
  `;
  const name = rows[0]?.coach_name?.trim();
  return name && name.length > 0 ? name : COACH_FALLBACK_NAME;
}

/** Las tres cosas distintas que se le publican a un atleta. */
export type PlanPublishedVariant =
  /** Se le acaba de asignar un plan (assign-sequence, assign-month, dobles). */
  | 'assigned'
  /** El cron soltó la semana que viene, o el coach la publicó a mano. */
  | 'weekly'
  /** Avanzó al siguiente microciclo de la secuencia. */
  | 'next_block';

const TEMPLATES: Record<PlanPublishedVariant, { title: string; body: (coach: string) => string }> = {
  assigned: {
    title: 'Tu plan esta listo',
    body: (coach) => `${coach} ha publicado tu plan de entrenamiento.`,
  },
  weekly: {
    title: 'Tu plan de la semana esta listo',
    body: (coach) => `${coach} ha publicado tu plan para la proxima semana.`,
  },
  next_block: {
    title: 'Nuevo microciclo listo',
    body: (coach) => `${coach} ha publicado el siguiente bloque de tu plan.`,
  },
};

/**
 * Título + cuerpo del push, ya con el nombre del coach de ESTE atleta.
 * Best-effort por diseño: si la consulta falla, se usa el sujeto neutro antes
 * que perder el aviso (el push es cortesía; la bandeja in-app es lo durable).
 */
export async function planPublishedPush(
  sql: Sql,
  athlete_id: bigint,
  variant: PlanPublishedVariant,
): Promise<{ title: string; body: string }> {
  const tpl = TEMPLATES[variant];
  let coach = COACH_FALLBACK_NAME;
  try {
    coach = await coachDisplayNameForAthlete(sql, athlete_id);
  } catch {
    // se queda el sujeto neutro
  }
  return { title: tpl.title, body: tpl.body(coach) };
}

/**
 * La primera semana VISIBLE al atleta de una asignación recién hecha (de
 * `start_date`, `week_count` semanas), o null si todas están ocultas. Misma puerta
 * que el móvil: solo un borrador esconde; sin fila se ve.
 */
export async function firstVisibleWeek(
  sql: Sql,
  athlete_id: bigint | number,
  start_date: string,
  week_count: number,
): Promise<string | null> {
  const monday = mondayOfWeek(parseIsoDate(start_date));
  const weeks = Array.from({ length: Math.max(0, week_count) }, (_, i) => isoDateString(addDays(monday, i * 7)));
  if (weeks.length === 0) return null;
  const rows = await sql<Array<{ week_start: string; status: string }>>`
    select to_char(week_start, 'YYYY-MM-DD') as week_start, status::text as status
    from weekly_plans
    where athlete_id = ${Number(athlete_id)} and week_start = any(${weeks}::date[])
  `;
  const status = new Map(rows.map((r) => [r.week_start, r.status]));
  return weeks.find((w) => athleteSeesItFromWeeklyStatus(status.get(w))) ?? null;
}

/**
 * «Tu plan está listo» tras asignar — SOLO si el atleta ya ve alguna semana de lo
 * asignado. Un programa que empieza dentro de tres semanas se abre solo N días
 * antes (y ese día avisa el cron de publicación): avisar hoy era mandarle a una
 * pantalla vacía. Best-effort: el plan ya está; un aviso fallido no lo deshace.
 * Devuelve la semana avisada (o null).
 */
export async function notifyPlanAssignedIfVisible(params: {
  sql: Sql;
  athlete_id: bigint | number;
  start_date: string;
  week_count: number;
}): Promise<string | null> {
  const { sql } = params;
  const athlete = BigInt(params.athlete_id);
  try {
    const week = await firstVisibleWeek(sql, athlete, params.start_date, params.week_count);
    if (!week) return null;
    await notifyAthlete({
      sql,
      athlete_id: athlete,
      type: 'plan_published',
      payload: { athlete_id: String(athlete), week_start: week, deep_link: `/plan?week=${week}` },
      push: {
        ...(await planPublishedPush(sql, athlete, 'assigned')),
        deeplink: { screen: 'plan', week_start: week },
      },
    });
    return week;
  } catch {
    return null;
  }
}
