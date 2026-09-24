// El aviso «tienes plan nuevo a la vista», en UN solo sitio: la frase, la semana
// que nombra y el envío.
//
// Por qué existe este módulo: la misma frase estaba copiada verbatim en seis
// ficheros (dos rutas de assign, advance, dobles, publishWeek ×2 y el cron), y
// las seis decían «Pablo». Este software se vende a cualquier entrenador: el
// atleta tiene que leer el nombre de SU coach, no el de otro.
//
// El nombre es DATO del coach (`coaches.full_name`); la frase es MECANISMO
// nuestro. Por eso el nombre se resuelve en cada envío y la plantilla vive aquí.
//
// LA SEMANA (auditoría de la app del atleta, D-10): el aviso decía «para la
// próxima semana» también al publicar la semana en curso, «Nuevo microciclo … el
// siguiente bloque» (palabras que el panel ya no usa; para el atleta un «bloque»
// es un tramo de su sesión) y sin tildes. Y la app instalada abre la pestaña Plan
// en la semana EN CURSO, sin mirar `week_start`: si la semana avisada es otra, el
// único sitio donde el atleta lee cuál es, es la frase. Por eso toda frase nombra
// su semana, contada desde el «hoy» del ATLETA (lo lee él: DECISIONS 2026-09-23,
// «Qué día es en cada sitio»).
//
// CUÁNDO se avisa no se decide aquí salvo en un caso: tras asignar o avanzar un
// programa, solo si el atleta ya ve alguna semana (`notifyPlanAssignedIfVisible`);
// publicar una semana la hace visible por definición y quien publica decide.

import type { Sql } from '@/lib/db';
import {
  addDays,
  BOX_TIMEZONE,
  isoDateString,
  longDateEs,
  mondayOfWeek,
  parseIsoDate,
  zonedDayString,
} from '@fahybrid/shared/domain/dates';
import { athleteSeesItFromWeeklyStatus } from '@fahybrid/shared/domain/coach/athlete-week-chip';
import { loadAthleteLocalDay } from '@fahybrid/shared/domain/db/athlete-timezone';
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
  /** Se le acaba de asignar un programa (asignar, asignar a varios, dobles, MCP). */
  | 'assigned'
  /** Se le abrió una semana (o varias): el coach la publicó o llegó su día. */
  | 'weekly'
  /** Avanzó al siguiente programa de su cadena. */
  | 'next_block';

/** La semana que nombra el aviso, y desde qué «hoy» se cuenta. */
export interface PlanPublishedWeek {
  /** La semana a la que lleva el aviso (cualquier día; se lee su lunes). */
  week_start: string;
  /** Cuántas semanas abre este acto desde `week_start` (publicar un bloque). Defecto 1. */
  weeks?: number;
  /** El «hoy» del ATLETA, YYYY-MM-DD. */
  today: string;
}

function mondayIso(iso: string): string {
  return isoDateString(mondayOfWeek(parseIsoDate(iso)));
}

/**
 * La semana dicha como la entiende el atleta, desde SU hoy: «esta semana», «la
 * semana que viene» o «la semana del lunes 12 de octubre» (sin año: dentro de un
 * plan no aporta nada). Nunca «la próxima» para la que ya está en curso.
 */
export function weekPhrase(week_start: string, today: string): string {
  const target = mondayIso(week_start);
  const thisMonday = mondayIso(today);
  if (target === thisMonday) return 'esta semana';
  if (target === isoDateString(addDays(parseIsoDate(thisMonday), 7))) return 'la semana que viene';
  return `la semana del lunes ${longDateEs(target)}`;
}

/** «Empieza …» o, si esa semana ya pasó (una fecha de inicio atrasada), «Empezó …». */
function startsSentence(week: PlanPublishedWeek): string {
  const past = mondayIso(week.week_start) < mondayIso(week.today);
  return `${past ? 'Empezó' : 'Empieza'} ${weekPhrase(week.week_start, week.today)}.`;
}

/**
 * Título + cuerpo del aviso. Puro: el nombre del coach y la semana entran hechos.
 * Con el vocabulario del panel («programa», «semana»).
 */
export function planPublishedCopy(
  variant: PlanPublishedVariant,
  coach: string,
  week: PlanPublishedWeek,
): { title: string; body: string } {
  const when = weekPhrase(week.week_start, week.today);
  switch (variant) {
    case 'assigned':
      return {
        title: 'Tu plan está listo',
        body: `${coach} ha publicado tu plan de entrenamiento. ${startsSentence(week)}`,
      };
    case 'next_block':
      return {
        title: 'Nuevo programa listo',
        body: `${coach} ha publicado el siguiente programa de tu plan. ${startsSentence(week)}`,
      };
    case 'weekly':
      return (week.weeks ?? 1) > 1
        ? { title: 'Tu plan está listo', body: `${coach} ha publicado tu plan a partir de ${when}.` }
        : { title: 'Tu plan de la semana está listo', body: `${coach} ha publicado tu plan para ${when}.` };
    default: {
      const exhaustive: never = variant;
      return exhaustive;
    }
  }
}

/**
 * Título + cuerpo del push, ya con el nombre del coach de ESTE atleta.
 * Best-effort por diseño: si la consulta falla, se usa el sujeto neutro antes
 * que perder el aviso (el plan ya está; el aviso es cortesía).
 */
export async function planPublishedPush(
  sql: Sql,
  athlete_id: bigint,
  variant: PlanPublishedVariant,
  week: PlanPublishedWeek,
): Promise<{ title: string; body: string }> {
  let coach = COACH_FALLBACK_NAME;
  try {
    coach = await coachDisplayNameForAthlete(sql, athlete_id);
  } catch {
    // se queda el sujeto neutro
  }
  return planPublishedCopy(variant, coach, week);
}

/**
 * El «hoy» del ATLETA (lo lee él). Un huso guardado que no se puede usar no
 * tumba el aviso: cae al del producto.
 */
async function athleteToday(sql: Sql, athlete_id: bigint, now: Date): Promise<string> {
  try {
    return await loadAthleteLocalDay({ athlete_id, now, client: sql });
  } catch {
    return zonedDayString(now, BOX_TIMEZONE);
  }
}

/**
 * Avisa al atleta de que tiene plan a la vista desde `week_start`: la fila de la
 * bandeja y el push, con el mismo payload de siempre (`week_start`, `deep_link`;
 * la app enruta por `type`). Lanza si falla el envío: cada llamador decide si
 * es cortesía (todos lo son hoy).
 */
export async function notifyPlanPublished(params: {
  sql: Sql;
  athlete_id: bigint | number;
  variant: PlanPublishedVariant;
  week_start: string;
  /** Semanas que abre este acto desde `week_start` (publicar un bloque). */
  weeks?: number;
  now?: Date;
}): Promise<{ id: string } | null> {
  const { sql, week_start } = params;
  const athlete = BigInt(params.athlete_id);
  const today = await athleteToday(sql, athlete, params.now ?? new Date());
  const push = await planPublishedPush(sql, athlete, params.variant, {
    week_start,
    weeks: params.weeks,
    today,
  });
  return notifyAthlete({
    sql,
    athlete_id: athlete,
    type: 'plan_published',
    payload: { athlete_id: String(athlete), week_start, deep_link: `/plan?week=${week_start}` },
    push: { ...push, deeplink: { screen: 'plan', week_start } },
  });
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
 * «Tu plan está listo» (o «Nuevo programa listo» al avanzar la cadena) — SOLO si
 * el atleta ya ve alguna semana de lo asignado, y nombrando esa semana. Un
 * programa que empieza dentro de tres semanas se abre solo N días antes (y ese
 * día avisa el cron de publicación): avisar hoy era mandarle a una pantalla
 * vacía. Best-effort: el plan ya está; un aviso fallido no lo deshace.
 * Devuelve la semana avisada (o null).
 */
export async function notifyPlanAssignedIfVisible(params: {
  sql: Sql;
  athlete_id: bigint | number;
  start_date: string;
  week_count: number;
  /** `next_block` al avanzar al siguiente programa de la cadena. Defecto `assigned`. */
  variant?: Extract<PlanPublishedVariant, 'assigned' | 'next_block'>;
  now?: Date;
}): Promise<string | null> {
  const { sql } = params;
  try {
    const week = await firstVisibleWeek(sql, params.athlete_id, params.start_date, params.week_count);
    if (!week) return null;
    await notifyPlanPublished({
      sql,
      athlete_id: params.athlete_id,
      variant: params.variant ?? 'assigned',
      week_start: week,
      now: params.now,
    });
    return week;
  } catch {
    return null;
  }
}
