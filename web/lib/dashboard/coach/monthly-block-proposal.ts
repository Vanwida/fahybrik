import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { buildAthleteContextPack } from './coach-ia-context';
import { proposeFirstMonthForIntake } from './intake-month-proposal';
import { instantiateMonthFromTemplate } from './instantiate-program';

export type MonthlyBlockProposal = {
  id: string;
  athlete_id: string;
  month_template_id: string;
  month_name: string;
  proposed_start_date: string;
  status: 'pending' | 'approved' | 'rejected';
  rationale: string | null;
};

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

/**
 * Coach-level list of every pending monthly-block proposal (one row per
 * athlete with a pending proposal). Feeds the Hoy unified inbox. Same data
 * shape as `loadPendingMonthlyBlock` plus the athlete name for the card.
 */
export async function listPendingMonthlyBlocksForCoach(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<Array<MonthlyBlockProposal & { athlete_name: string }>> {
  const client = params.client ?? defaultSql;
  const rows = await client<
    Array<{
      id: string;
      athlete_id: string;
      athlete_name: string;
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
      a.full_name as athlete_name,
      p.month_template_id::text,
      m.name as month_name,
      to_char(p.proposed_start_date, 'YYYY-MM-DD') as proposed_start_date,
      p.status::text,
      p.rationale
    from monthly_block_proposals p
    join athletes a on a.id = p.athlete_id
    join program_month_templates m on m.id = p.month_template_id
    where a.coach_id = ${params.coach_id as number}
      and p.status = 'pending'
    order by p.proposed_start_date asc, a.full_name asc
  `;
  return rows.map((r) => ({
    id: r.id,
    athlete_id: r.athlete_id,
    athlete_name: r.athlete_name,
    month_template_id: r.month_template_id,
    month_name: r.month_name,
    proposed_start_date: r.proposed_start_date,
    status: r.status as MonthlyBlockProposal['status'],
    rationale: r.rationale,
  }));
}

export async function proposeNextMonthlyBlock(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<MonthlyBlockProposal | null> {
  const client = params.client ?? defaultSql;

  // Verify the athlete belongs to this coach (auth guard).
  const ownership = await client<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${params.athlete_id as number}
      and coach_id = ${params.coach_id as number}
    limit 1
  `;
  if (!ownership[0]) throw new MonthlyBlockError('not_found', 'Athlete not found', 404);

  const lastMonth = await client<Array<{ end_date: string | null }>>`
    select to_char(max(end_date), 'YYYY-MM-DD') as end_date
    from athlete_month_assignments
    where athlete_id = ${params.athlete_id as number}
  `;
  if (!lastMonth[0]?.end_date) {
    throw new MonthlyBlockError(
      'no_previous_month',
      'El atleta no tiene mes previo. Asigna el primer mes desde el panel de intake.',
      409,
    );
  }

  const nextStart = isoDateString(
    mondayOfWeek(addDays(parseIsoDate(lastMonth[0].end_date), 1)),
  );

  // Nivel del atleta = fuente AGNÓSTICA única: athletes.level_id → athlete_levels
  // (por coach). Preferimos el nivel ASIGNADO por el coach (level_id) y, si no hay,
  // el SUGERIDO por el algoritmo (suggested_level_id). Las plantillas de microciclo
  // se seleccionan por ese mismo level_id.
  const levelRows = await client<Array<{ level_id: string | null }>>`
    select coalesce(a.level_id, a.suggested_level_id)::text as level_id
    from athletes a
    where a.id = ${params.athlete_id as number}
    limit 1
  `;
  const levelId = levelRows[0]?.level_id;
  if (levelId == null) {
    throw new MonthlyBlockError(
      'no_level',
      'El atleta no tiene nivel asignado. Asigna un nivel antes de proponer el siguiente microciclo.',
      409,
    );
  }

  const proposal = await proposeFirstMonthForIntake({
    coach_id: params.coach_id,
    athlete_id: params.athlete_id,
    level_id: Number(levelId),
    client,
  });
  if (!proposal) {
    throw new MonthlyBlockError(
      'no_template',
      `No hay mes plantilla para el nivel del atleta en este coach.`,
      409,
    );
  }

  const pack = await buildAthleteContextPack({
    athlete_id: params.athlete_id,
    client,
  });

  const rationale = `Fin microciclo · ${pack.summary}`;

  // Upsert pending proposal (idempotent — the unique index in DB enforces
  // one pending per athlete; this guarantees we update instead of error).
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

  // Best-effort coach inbox notification (mirrors the web/ trigger so the
  // bell still lights up regardless of which package generated the
  // proposal). Failure is non-fatal — the proposal row is the source of
  // truth and the dashboard already surfaces it via programming-status.
  try {
    const ownerRows = await client<Array<{ user_id: string; athlete_name: string }>>`
      select c.user_id::text as user_id, a.full_name as athlete_name
      from athletes a
      join coaches c on c.id = a.coach_id
      where a.id = ${params.athlete_id as number}
      limit 1
    `;
    const owner = ownerRows[0];
    if (owner) {
      const payload = {
        proposal_id: ins[0]!.id,
        athlete_id: String(params.athlete_id),
        athlete_name: owner.athlete_name,
        proposed_start_date: nextStart,
        month_template_id: String(proposal.month_template_id),
        deep_link: `/es/atletas/${params.athlete_id}/plan?focus=review`,
      };
      await client`
        insert into notifications (user_id, type, payload_json)
        values (
          ${Number(owner.user_id)},
          'monthly_block_pending'::notification_type,
          ${client.json(payload)}
        )
      `;
    }
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
}): Promise<{
  proposal: MonthlyBlockProposal;
  assign_result: Awaited<ReturnType<typeof instantiateMonthFromTemplate>>;
}> {
  const client = params.client ?? defaultSql;

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

export async function rejectMonthlyBlockProposal(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  proposal_id: number | bigint;
  client?: Sql;
}): Promise<{ rejected: true }> {
  const client = params.client ?? defaultSql;

  const result = await client<Array<{ id: string }>>`
    update monthly_block_proposals p
    set status = 'rejected',
        reviewed_by_coach_id = ${params.coach_id as number},
        reviewed_at = now()
    from athletes a
    where p.id = ${params.proposal_id as number}
      and p.athlete_id = ${params.athlete_id as number}
      and a.id = p.athlete_id
      and a.coach_id = ${params.coach_id as number}
      and p.status = 'pending'
    returning p.id::text
  `;
  if (!result[0]) throw new MonthlyBlockError('not_found', 'Proposal not found', 404);
  return { rejected: true };
}
