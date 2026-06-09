import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

export {
  instantiateMonthFromTemplate as assignMonthToAthlete,
  InstantiateProgramError as AssignMonthError,
  type InstantiateMonthResult as AssignMonthResult,
} from '@/lib/dashboard/coach/instantiate-program';

export type MonthAssignmentRow = {
  id: string;
  month_template_id: string;
  month_name: string;
  level: string;
  start_date: string;
  end_date: string;
  assignment_count: number;
};

export async function listAthleteMonthAssignments(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<MonthAssignmentRow[]> {
  const client = params.client ?? defaultSql;
  return client<MonthAssignmentRow[]>`
    select
      ama.id::text,
      ama.month_template_id::text,
      m.name as month_name,
      m.level::text,
      to_char(ama.start_date, 'YYYY-MM-DD') as start_date,
      to_char(ama.end_date, 'YYYY-MM-DD') as end_date,
      ama.assignment_count
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    join athletes a on a.id = ama.athlete_id
    where ama.athlete_id = ${params.athlete_id}
      and a.coach_id = ${params.coach_id}
    order by ama.start_date desc
    limit 12
  `;
}
