import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/atr/dates';
import { buildAthleteContextPack } from './pablo-ia-context';
import { proposeFirstMonthForIntake } from './intake-month-proposal';
import type { ProgramLevel } from '@fahybrid/shared/schema/program-templates';
import { intakeLevelToProgramLevel } from './athlete-training-level';
import { notifyCoach } from '@/lib/notifications/dispatch';

export type MonthlyBlockProposal = {
  id: string;
  athlete_id: string;
  month_template_id: string;
  month_name: string;
  proposed_start_date: string;
  status: 'pending' | 'approved' | 'rejected';
  rationale: string | null;
};

export async function loadPendingMonthlyBlock(params: {
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<MonthlyBlockProposal | null> {
  const client = params.client ?? defaultSql;
  const rows = await client<Array<{ id: string }>>`
    select id::text from monthly_block_proposals
    where athlete_id = ${params.athlete_id as number} and status = 'pending'
    order by created_at desc limit 1
  `;
  if (!rows[0]) return null;
  return loadProposal(client, rows[0].id);
}

export async function proposeNextMonthlyBlock(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<MonthlyBlockProposal | null> {
  const client = params.client ?? defaultSql;

  const lastMonth = await client<Array<{ end_date: string }>>`
    select to_char(max(end_date), 'YYYY-MM-DD') as end_date
    from athlete_month_assignments
    where athlete_id = ${params.athlete_id as number}
  `;
  if (!lastMonth[0]?.end_date) return null;

  const nextStart = isoDateString(
    mondayOfWeek(addDays(parseIsoDate(lastMonth[0].end_date), 1)),
  );

  const levelRows = await client<Array<{ level: number | null }>>`
    select (intake_notes_json ->> 'level')::int as level
    from athletes where id = ${params.athlete_id as number} limit 1
  `;
  const rawLevel = levelRows[0]?.level;
  const programLevel: ProgramLevel =
    rawLevel != null && rawLevel >= 1 && rawLevel <= 4
      ? intakeLevelToProgramLevel(rawLevel as 1 | 2 | 3 | 4)
      : 'intermediate';

  const proposal = await proposeFirstMonthForIntake({
    coach_id: params.coach_id,
    athlete_id: params.athlete_id,
    level: programLevel,
    client,
  });
  if (!proposal) return null;

  const pack = await buildAthleteContextPack({
    athlete_id: params.athlete_id,
    client,
  });

  const rationale = `Fin microciclo · ${pack.summary}`;

  const existing = await client<Array<{ id: string }>>`
    select id::text from monthly_block_proposals
    where athlete_id = ${params.athlete_id as number} and status = 'pending'
    limit 1
  `;
  if (existing[0]) {
    await client`
      update monthly_block_proposals set
        month_template_id = ${Number(proposal.month_template_id)},
        proposed_start_date = ${nextStart}::date,
        rationale = ${rationale},
        context_pack_json = ${JSON.stringify(pack)}::jsonb,
        updated_at = now()
      where id = ${Number(existing[0].id)}
    `;
    return loadProposal(client, existing[0].id);
  }

  const ins = await client<Array<{ id: string }>>`
    insert into monthly_block_proposals (
      athlete_id, month_template_id, proposed_start_date, rationale, context_pack_json
    )
    values (
      ${params.athlete_id as number},
      ${Number(proposal.month_template_id)},
      ${nextStart}::date,
      ${rationale},
      ${JSON.stringify(pack)}::jsonb
    )
    returning id::text
  `;

  const athleteRows = await client<Array<{ full_name: string }>>`
    select full_name from athletes where id = ${params.athlete_id as number} limit 1
  `;
  const athleteName = athleteRows[0]?.full_name ?? 'Atleta';
  try {
    await notifyCoach({
      sql: client,
      athlete_id: BigInt(params.athlete_id as number),
      type: 'monthly_block_pending',
      payload: {
        proposal_id: ins[0]!.id,
        athlete_id: String(params.athlete_id),
        athlete_name: athleteName,
        proposed_start_date: nextStart,
        month_template_id: String(proposal.month_template_id),
        deep_link: `/es/atletas/${params.athlete_id}/plan?focus=review`,
      },
    });
  } catch {
    // inbox-best-effort
  }

  return loadProposal(client, ins[0]!.id);
}

async function loadProposal(client: Sql, id: string): Promise<MonthlyBlockProposal | null> {
  const rows = await client<
    Array<{
      id: string;
      athlete_id: string;
      month_template_id: string;
      month_name: string;
      proposed_start_date: string;
      status: string;
      rationale: string | null;
    }>
  >`
    select
      p.id::text,
      p.athlete_id::text,
      p.month_template_id::text,
      m.name as month_name,
      to_char(p.proposed_start_date, 'YYYY-MM-DD') as proposed_start_date,
      p.status::text,
      p.rationale
    from monthly_block_proposals p
    join program_month_templates m on m.id = p.month_template_id
    where p.id = ${Number(id)}
    limit 1
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    athlete_id: r.athlete_id,
    month_template_id: r.month_template_id,
    month_name: r.month_name,
    proposed_start_date: r.proposed_start_date,
    status: r.status as MonthlyBlockProposal['status'],
    rationale: r.rationale,
  };
}

export async function approveMonthlyBlockProposal(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  proposal_id: number | bigint;
  client?: Sql;
}): Promise<{ proposal: MonthlyBlockProposal; assign_result: Awaited<ReturnType<typeof import('./instantiate-program').instantiateMonthFromTemplate>> }> {
  const client = params.client ?? defaultSql;
  const { instantiateMonthFromTemplate } = await import('./instantiate-program');

  const rows = await client<
    Array<{ month_template_id: string; proposed_start_date: string; athlete_id: string }>
  >`
    select
      p.month_template_id::text,
      to_char(p.proposed_start_date, 'YYYY-MM-DD') as proposed_start_date,
      p.athlete_id::text
    from monthly_block_proposals p
    join athletes a on a.id = p.athlete_id
    where p.id = ${params.proposal_id as number}
      and p.athlete_id = ${params.athlete_id as number}
      and a.coach_id = ${params.coach_id as number}
      and p.status = 'pending'
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new MonthlyBlockError('not_found', 'Proposal not found', 404);

  const assignResult = await instantiateMonthFromTemplate({
    coach_id: params.coach_id,
    athlete_id: params.athlete_id,
    month_template_id: Number(row.month_template_id),
    start_date: row.proposed_start_date,
    client,
  });

  await client`
    update monthly_block_proposals
    set status = 'approved', reviewed_by_coach_id = ${params.coach_id as number}, reviewed_at = now()
    where id = ${params.proposal_id as number}
  `;

  const proposal = await loadProposal(client, String(params.proposal_id));
  if (!proposal) throw new MonthlyBlockError('not_found', 'Proposal not found after approve', 500);

  return { proposal, assign_result: assignResult };
}

export class MonthlyBlockError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'MonthlyBlockError';
  }
}
