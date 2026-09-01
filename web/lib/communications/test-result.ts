import 'server-only';

import type { Sql } from '@/lib/db';
import type { CmjReport } from '@fahybrid/shared/domain/test-report/cmj';
import type { CommunicationItemDTO } from '@fahybrid/shared/domain/coach-communications';
import { loadBatteryStatus } from '@/lib/coach/battery-status';

/** Resuelve los informes de las secciones test_result con los datos de ESTE atleta. */
export async function resolveTestResults(args: {
  items: CommunicationItemDTO[];
  athlete_id: number;
  sql: Sql;
}): Promise<Map<string, CmjReport>> {
  const ids = new Set(
    args.items
      .map((i) => i.test_result?.assignment_id)
      .filter((id): id is string => !!id),
  );
  if (ids.size === 0) return new Map();
  const status = await loadBatteryStatus(args.athlete_id, args.sql);
  const out = new Map<string, CmjReport>();
  for (const t of status.tests) {
    if (ids.has(t.assignment_id) && t.jump_report) out.set(t.assignment_id, t.jump_report);
  }
  return out;
}
