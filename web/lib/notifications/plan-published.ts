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
    title: 'Nuevo ciclo listo',
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
