import 'server-only';

// Carga batched del chip de semana calendario. Lee las mismas tablas que
// `getAthleteProgrammingStatus` (existencia) y la misma puerta que el MCP
// (`weekly_plans.status='draft'` esconde; sin fila se ve). Una consulta
// por tabla, no N+1. No publica.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  addDays,
  isoDateString,
  mondayOfWeek,
  startOfDayInBox,
} from '@fahybrid/shared/domain/dates';
import {
  athleteSeesItFromWeeklyStatus,
  athleteWeekChip,
  SIN_PLAN_CHIP,
  type AthleteWeekChip,
} from '@fahybrid/shared/domain/coach/athlete-week-chip';

export type { AthleteWeekChip };

/**
 * Un mapa con entrada para CADA id pedido (default: Sin plan). `on_date` es el
 * día de caja, igual que `getAthleteProgrammingStatus`.
 */
export async function loadAthleteWeekChipMap(params: {
  athlete_ids: Array<number | bigint>;
  on_date?: Date;
  client?: Sql;
}): Promise<Map<string, AthleteWeekChip>> {
  const client = params.client ?? defaultSql;
  const map = new Map<string, AthleteWeekChip>();
  const ids = [...new Set(params.athlete_ids.map((id) => Number(id)))];
  for (const id of ids) map.set(String(id), SIN_PLAN_CHIP);
  if (ids.length === 0) return map;

  const today = startOfDayInBox(params.on_date ?? new Date());
  const todayIso = isoDateString(today);
  const weekStart = isoDateString(mondayOfWeek(today));
  const weekEnd = isoDateString(addDays(mondayOfWeek(today), 6));

  const [months, sessions, plans] = await Promise.all([
    client<Array<{ athlete_id: string; n: number; end_date: string | null }>>`
      select athlete_id::text as athlete_id,
             count(*)::int as n,
             to_char(max(end_date), 'YYYY-MM-DD') as end_date
      from athlete_month_assignments
      where athlete_id = any(${ids}::bigint[])
      group by athlete_id
    `,
    client<Array<{ athlete_id: string; n: number }>>`
      select athlete_id::text as athlete_id,
             count(*)::int as n
      from workout_assignments
      where athlete_id = any(${ids}::bigint[])
        and scheduled_for >= ${weekStart}::date
        and scheduled_for <= ${weekEnd}::date
      group by athlete_id
    `,
    client<Array<{ athlete_id: string; status: string }>>`
      select athlete_id::text as athlete_id,
             status::text as status
      from weekly_plans
      where athlete_id = any(${ids}::bigint[])
        and week_start = ${weekStart}::date
    `,
  ]);

  const monthBy = new Map(months.map((r) => [r.athlete_id, r]));
  const sessionsBy = new Map(sessions.map((r) => [r.athlete_id, r.n]));
  const planBy = new Map(plans.map((r) => [r.athlete_id, r.status]));

  for (const id of ids) {
    const key = String(id);
    const month = monthBy.get(key);
    const sees = athleteSeesItFromWeeklyStatus(planBy.get(key));
    map.set(
      key,
      athleteWeekChip({
        has_month_assignment: (month?.n ?? 0) > 0,
        last_assignment_end: month?.end_date ?? null,
        session_count_this_week: sessionsBy.get(key) ?? 0,
        athlete_sees_it: sees,
        today: todayIso,
      }),
    );
  }

  return map;
}
