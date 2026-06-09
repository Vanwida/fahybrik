import 'server-only';

import type { AthleteContextPack } from './pablo-ia-context';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  evaluateAthleteWeek as _evaluateAthleteWeek,
  type WeeklyEvaluationResult,
  type WeeklyVerdict,
} from '@fahybrid/shared/domain/coach/weekly-evaluation';
import { notifyCoach } from '@/lib/notifications/dispatch';

export type { WeeklyVerdict, WeeklyEvaluationResult };
export { evaluateWeeklyVerdictFromContext } from '@fahybrid/shared/domain/coach/weekly-evaluation';

export function evaluateAthleteWeek(params: {
  athlete_id: number | bigint;
  week_start?: string;
  client?: Sql;
}): Promise<WeeklyEvaluationResult> {
  return _evaluateAthleteWeek({ ...params, client: params.client ?? defaultSql });
}

export async function persistWeeklyEvaluationSummary(params: {
  athlete_id: number | bigint;
  week_start: string;
  verdict: WeeklyVerdict;
  context_pack: AthleteContextPack;
  client?: Sql;
}): Promise<string> {
  const client = params.client ?? defaultSql;
  const rows = await client<Array<{ id: string }>>`
    insert into week_adjustment_proposals (
      athlete_id,
      week_start,
      status,
      verdict,
      context_pack_json,
      proposal_json
    )
    values (
      ${params.athlete_id as number},
      ${params.week_start}::date,
      ${params.verdict === 'ok' ? 'approved' : 'pending'},
      ${params.verdict === 'ok' ? 'ok' : 'needs_adjustment'},
      ${JSON.stringify(params.context_pack)}::jsonb,
      ${JSON.stringify({ recommendation: 'keep', rationale: 'Semana OK — sin cambios', slot_changes: [], coach_summary: params.context_pack.summary })}::jsonb
    )
    on conflict (athlete_id, week_start) where status = 'pending'
    do update set
      verdict = excluded.verdict,
      context_pack_json = excluded.context_pack_json,
      updated_at = now()
    returning id::text
  `;
  const proposalId = rows[0]?.id ?? '0';

  // Notify coach only when the proposal is pending (verdict !== 'ok'). 'ok'
  // verdicts auto-approve and don't need Pablo's attention.
  if (params.verdict !== 'ok' && proposalId !== '0') {
    const athleteRows = await client<Array<{ full_name: string }>>`
      select full_name from athletes where id = ${params.athlete_id as number} limit 1
    `;
    const athleteName = athleteRows[0]?.full_name ?? 'Atleta';
    try {
      await notifyCoach({
        sql: client,
        athlete_id: BigInt(params.athlete_id as number),
        type: 'week_adjustment_pending',
        payload: {
          proposal_id: proposalId,
          athlete_id: String(params.athlete_id),
          athlete_name: athleteName,
          week_start: params.week_start,
          verdict: 'needs_adjustment',
          deep_link: `/es/atletas/${params.athlete_id}/plan?focus=review`,
        },
      });
    } catch {
      // inbox-best-effort
    }
  }

  return proposalId;
}
