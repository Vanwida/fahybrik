import 'server-only';

// El foco de UNA semana del atleta (migración 0180) — el override que manda
// sobre el defecto heredado de `program_week_templates.focus` (ver
// `lib/athlete/week-plan.ts`). Lo escriben dos superficies: el panel (la
// cabecera de la semana en la ficha del atleta) y el conector MCP
// (`set_week_focus`), y las dos pasan por AQUÍ — ni un segundo camino de
// escritura sobre `weekly_plans`.
//
// EL GOTCHA QUE ESTO EVITA: `weekly_plans.status` nace `draft` por DEFAULT en
// el esquema (migración 0021). Si esta fila no existiera todavía y el upsert
// insertara sin decir `status`, poner un simple foco convertiría de golpe una
// semana VISIBLE («sin fila, SE VE» — docs/DECISIONS.md 2026-08-10) en una
// semana OCULTA para el atleta, como efecto secundario de tocar un campo que no
// tiene nada que ver con publicar. Por eso el INSERT fija `status = 'published'`
// EXPLÍCITO — el equivalente exacto de «sin fila» — y el UPDATE (fila ya
// existente, sea el estado que sea) toca `focus` en solitario y deja `status`
// tal cual estaba: escribir el foco nunca publica ni esconde nada por su cuenta.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { assertCoachOwnsAthlete } from './publish-week';

export interface SetWeekFocusResult {
  /** weekly_plans.id de la fila tocada — para quien auditore la escritura. */
  weekly_plan_id: string;
  athlete_id: string;
  week_start: string;
  focus: string | null;
}

/**
 * Fija (o borra, con `focus: null`) el foco de la semana de UN atleta. Ownership-
 * scoped (lanza si el atleta no es de `coach_id`, igual que el resto de
 * escritores de `weekly_plans`). Idempotente: repetir la misma llamada re-estampa
 * `updated_at` sin más efecto.
 */
export async function setWeekFocus(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  week_start: string;
  focus: string | null;
  client?: Sql;
}): Promise<SetWeekFocusResult> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const athleteId = Number(params.athlete_id);

  await assertCoachOwnsAthlete(client, coachId, athleteId);

  const rows = await client<Array<{ id: string }>>`
    insert into weekly_plans (athlete_id, week_start, status, focus, updated_at)
    values (${athleteId}, ${params.week_start}::date, 'published', ${params.focus}, now())
    on conflict (athlete_id, week_start)
    do update set focus = excluded.focus, updated_at = now()
    returning id::text
  `;

  return {
    weekly_plan_id: rows[0]!.id,
    athlete_id: String(athleteId),
    week_start: params.week_start,
    focus: params.focus,
  };
}
