import 'server-only';

import { sql as defaultSql, type Sql } from '@/lib/db';
import { resyncWeekTemplateAssignments } from '@/lib/dashboard/coach/instantiate-program';

export interface ProgramDelivery {
  status: 'complete' | 'partial';
  updated_athletes: number;
  failed_athlete_ids: string[];
  pending_week_ids: string[];
  incomplete_week_ids: string[];
}

/** Una entrega fallida nunca revierte ni finge el guardado de la plantilla. */
export async function deliverProgramWeeks(params: {
  coach_id: number | bigint;
  program_id: number;
  week_ids: string[];
  client?: Sql;
}): Promise<ProgramDelivery> {
  const client = params.client ?? defaultSql;
  const updated = new Set<string>();
  const failed = new Set<string>();
  const pending = new Set<string>();
  const incomplete = new Set<string>();
  for (const id of [...new Set(params.week_ids)]) {
    try {
      const r = await resyncWeekTemplateAssignments({ coach_id: params.coach_id, week_template_id: Number(id), client });
      r.athletes_updated.forEach((athlete) => updated.add(athlete));
      r.athletes_failed.forEach((athlete) => failed.add(athlete));
      if (r.athletes_failed.length > 0) pending.add(id);
      if (r.athletes_incomplete.length > 0) incomplete.add(id);
    } catch {
      pending.add(id);
    }
  }
  failed.forEach((id) => updated.delete(id));
  return { status: pending.size ? 'partial' : 'complete', updated_athletes: updated.size,
    failed_athlete_ids: [...failed], pending_week_ids: [...pending], incomplete_week_ids: [...incomplete] };
}

/** Valida linaje y dueño antes de reintentar; no vuelve a escribir la plantilla. */
export async function retryProgramDelivery(params: {
  coach_id: number | bigint;
  program_id: number;
  week_ids: string[];
  client?: Sql;
}): Promise<ProgramDelivery | null> {
  const client = params.client ?? defaultSql;
  const ids = [...new Set(params.week_ids)];
  const rows = await client<Array<{ id: string }>>`
    select w.id::text
    from program_month_templates m
    join program_month_weeks mw on mw.month_template_id = m.id
    join program_week_templates w on w.id = mw.week_template_id and w.coach_id = ${Number(params.coach_id)}
    where m.id = ${params.program_id} and m.coach_id = ${Number(params.coach_id)}
      and w.id = any(${ids.map(Number)}::bigint[])
      and (m.athlete_id is null or exists (
        select 1 from athletes a where a.id = m.athlete_id and a.coach_id = ${Number(params.coach_id)}
      ))
  `;
  if (rows.length !== ids.length) return null;
  return deliverProgramWeeks({ ...params, week_ids: ids, client });
}
