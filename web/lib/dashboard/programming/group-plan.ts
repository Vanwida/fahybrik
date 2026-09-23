import 'server-only';

// Lo que la página de un grupo añade al detalle del grupo (lib/coach/groups):
// el VOLUMEN PLANIFICADO de cada semana de cada programa de su plan (derivado de
// la prescripción; un hecho de la receta, no una previsión) y las carreras que
// vienen de sus miembros. Dos consultas, las tenga el grupo como las tenga.

import { sql as defaultSql, type Sql } from '@/lib/db';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import { parseWeekSlotsFromDb } from '@/lib/dashboard/coach/program-week-slots';
import { volumeParts, weekVolume, type Volume } from './week-volume';

export interface PlanWeekVolume {
  minutes: number;
  open: boolean;
  sessions: number;
  parts: Array<{ key: 'fuerza' | 'carrera' | 'ergo'; label: string }>;
}

export interface GroupRace {
  name: string;
  date: string;
  athletes: number;
}

function compact(v: Volume): PlanWeekVolume {
  return { minutes: v.minutes, open: v.open_sessions > 0, sessions: v.sessions, parts: volumeParts(v) };
}

export async function loadGroupPlanExtras(params: {
  coach_id: number | bigint;
  program_ids: string[];
  member_ids: string[];
  client?: Sql;
}): Promise<{ volumes: Record<string, PlanWeekVolume[]>; races: GroupRace[] }> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const programIds = [...new Set(params.program_ids.map(Number))];
  const memberIds = params.member_ids.map(Number);
  const [weeks, races] = await Promise.all([
    programIds.length
      ? client<Array<{ program_id: string; position: number; slots_json: unknown }>>`
          select mw.month_template_id::text as program_id, mw.position, w.slots_json
          from program_month_weeks mw
          join program_month_templates m on m.id = mw.month_template_id and m.coach_id = ${coachId}
          join program_week_templates w on w.id = mw.week_template_id
          where mw.month_template_id = any(${programIds}::bigint[])
          order by mw.month_template_id, mw.position
        `
      : Promise.resolve([]),
    memberIds.length
      ? client<Array<{ name: string; date: string; athletes: number }>>`
          select r.name, r.race_date::text as date, count(distinct r.athlete_id)::int as athletes
          from races r
          join athletes a on a.id = r.athlete_id and a.coach_id = ${coachId}
          where r.athlete_id = any(${memberIds}::bigint[]) and r.race_date >= current_date
          group by r.name, r.race_date
          order by r.race_date, athletes desc
          limit 8
        `
      : Promise.resolve([]),
  ]);
  const volumes: Record<string, PlanWeekVolume[]> = {};
  for (const w of weeks) {
    const days = parseWeekSlotsFromDb(w.slots_json).days as WeekDay[];
    (volumes[w.program_id] ??= []).push(compact(weekVolume(days)));
  }
  return { volumes, races };
}
