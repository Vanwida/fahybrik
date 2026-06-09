import type { Sql } from 'postgres';
import type { ProgramLevel } from '../../schema/program-templates';
import { mondayOfWeek, mondayOfWeekInBox, isoDateString, parseIsoDate } from '../atr/dates';

export type IntakeMonthProposal = {
  month_template_id: string;
  month_name: string;
  level: ProgramLevel;
  atr_block_hint: string | null;
  suggested_start_date: string;
  rationale: string;
};

export async function proposeFirstMonthForIntake(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  level: ProgramLevel;
  client: Sql;
}): Promise<IntakeMonthProposal | null> {
  const client = params.client;

  const rows = await client<
    Array<{ id: string; name: string; level: string; atr_block_hint: string | null }>
  >`
    select id::text, name, level::text, atr_block_hint::text
    from program_month_templates
    where coach_id = ${params.coach_id as number}
      and level = ${params.level}::program_level
    order by
      case when name ilike '%mes 1%' or name ilike '%month 1%' then 0 else 1 end,
      updated_at desc
    limit 1
  `;
  const tpl = rows[0];
  if (!tpl) return null;

  const macroRows = await client<Array<{ start_date: string }>>`
    select to_char(start_date, 'YYYY-MM-DD') as start_date
    from atr_macrocycles
    where athlete_id = ${params.athlete_id as number}
      and status in ('planned', 'active')
    order by start_date desc limit 1
  `;

  const start =
    macroRows[0]?.start_date ??
    isoDateString(mondayOfWeekInBox(new Date()));

  return {
    month_template_id: tpl.id,
    month_name: tpl.name,
    level: params.level,
    atr_block_hint: tpl.atr_block_hint,
    suggested_start_date: isoDateString(mondayOfWeek(parseIsoDate(start))),
    rationale: `Mes plantilla recomendado para nivel ${params.level}`,
  };
}
