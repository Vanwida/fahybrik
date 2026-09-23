// El huso del coach desde la base (`coaches.timezone`, mig 0241), ya con su
// defecto (`effectiveCoachTimezone`). Una consulta por índice primario.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { effectiveCoachTimezone } from '@fahybrid/shared/domain/coach/coach-timezone';

export async function loadCoachTimezone(coach_id: bigint | number, client: Sql = defaultSql): Promise<string> {
  const rows = await client<Array<{ tz: string | null }>>`
    -- to_jsonb: tolera un entorno sin la columna (mig 0241) → defecto.
    select to_jsonb(c) ->> 'timezone' as tz from coaches c where c.id = ${Number(coach_id)} limit 1
  `;
  return effectiveCoachTimezone(rows[0]?.tz ?? null);
}
