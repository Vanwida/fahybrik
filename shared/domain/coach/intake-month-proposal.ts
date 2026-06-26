import type { Sql } from 'postgres';
import { addDays, mondayOfWeek, mondayOfWeekInBox, isoDateString, parseIsoDate } from '../dates';

export type IntakeMonthProposal = {
  month_template_id: string;
  month_name: string;
  level: string;
  suggested_start_date: string;
  rationale: string;
};

export async function proposeFirstMonthForIntake(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  level_id: number | bigint;
  client: Sql;
}): Promise<IntakeMonthProposal | null> {
  const client = params.client;

  const rows = await client<
    Array<{ id: string; name: string; level: string }>
  >`
    select m.id::text, m.name, coalesce(al.name, '') as level
    from program_month_templates m
    left join athlete_levels al on al.id = m.level_id
    where m.coach_id = ${params.coach_id as number}
      and m.level_id = ${params.level_id as number}
    order by
      case when m.name ilike '%mes 1%' or m.name ilike '%month 1%' then 0 else 1 end,
      m.updated_at desc
    limit 1
  `;
  const tpl = rows[0];
  if (!tpl) return null;

  // Suggested start (AGNOSTIC): the day after the athlete's last assigned
  // microciclo ends, or this week's Monday when they have no plan yet (the common
  // first-intake case).
  const lastRows = await client<Array<{ end_date: string | null }>>`
    select to_char(max(end_date), 'YYYY-MM-DD') as end_date
    from athlete_month_assignments
    where athlete_id = ${params.athlete_id as number}
  `;
  const start = lastRows[0]?.end_date
    ? isoDateString(addDays(parseIsoDate(lastRows[0].end_date), 1))
    : isoDateString(mondayOfWeekInBox(new Date()));

  return {
    month_template_id: tpl.id,
    month_name: tpl.name,
    level: tpl.level,
    suggested_start_date: isoDateString(mondayOfWeek(parseIsoDate(start))),
    rationale: `Mes plantilla recomendado para nivel ${tpl.level || 'del atleta'}`,
  };
}
