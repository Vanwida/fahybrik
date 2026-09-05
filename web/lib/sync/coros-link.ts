// Persist the «¿esto es el entreno?» answer. Without an answer the planned
// assignment stays scheduled. Yes attaches COROS stats and closes the plan.
// No leaves historial only. Never auto-matches.

import type { Sql } from '@/lib/db';
import { markAssignmentDoneFromDevice } from '@/lib/sync/assignment-status';

export const COROS_PROVIDER = 'coros' as const;

export type LinkAnswer = 'yes' | 'no';

export type PendingCorosLink = {
  confirmation_id: string;
  provider: typeof COROS_PROVIDER;
  source_workout_ref: string;
  execution_id: string;
  assignment_id: string;
  started_at: string | null;
  name: string | null;
};

export async function enqueueCorosLinkPrompt(args: {
  sql: Sql;
  athlete_id: bigint;
  sourceWorkoutRef: string;
  executionId: string;
  assignmentId: string;
}): Promise<boolean> {
  const { sql, athlete_id } = args;
  const rows = await sql<{ id: string }[]>`
    insert into wearable_activity_confirmations (
      athlete_id, provider, source_workout_ref, execution_id, assignment_id, status
    ) values (
      ${athlete_id as unknown as number},
      ${COROS_PROVIDER},
      ${args.sourceWorkoutRef},
      ${args.executionId}::bigint,
      ${args.assignmentId}::bigint,
      'pending'
    )
    on conflict (athlete_id, provider, source_workout_ref) do nothing
    returning id::text
  `;
  return rows[0] != null;
}

export async function listPendingCorosLinks(args: {
  sql: Sql;
  athlete_id: bigint;
}): Promise<PendingCorosLink[]> {
  const rows = await args.sql<
    {
      confirmation_id: string;
      source_workout_ref: string;
      execution_id: string;
      assignment_id: string;
      started_at: Date | null;
    }[]
  >`
    select
      c.id::text as confirmation_id,
      c.source_workout_ref,
      c.execution_id::text as execution_id,
      c.assignment_id::text as assignment_id,
      we.started_at
    from wearable_activity_confirmations c
    join workout_executions we on we.id = c.execution_id
    where c.athlete_id = ${args.athlete_id as unknown as number}
      and c.provider = ${COROS_PROVIDER}
      and c.status = 'pending'
    order by we.started_at desc nulls last, c.id desc
  `;
  return rows.map((row) => ({
    confirmation_id: row.confirmation_id,
    provider: COROS_PROVIDER,
    source_workout_ref: row.source_workout_ref,
    execution_id: row.execution_id,
    assignment_id: row.assignment_id,
    started_at: row.started_at ? row.started_at.toISOString() : null,
    name: null,
  }));
}

export type ConfirmLinkResult =
  | { ok: true; answer: LinkAnswer }
  | { ok: false; error: 'not_found' | 'already_answered' };

export async function confirmCorosLink(args: {
  sql: Sql;
  athlete_id: bigint;
  confirmationId: string;
  answer: LinkAnswer;
}): Promise<ConfirmLinkResult> {
  const { sql, athlete_id, confirmationId, answer } = args;
  const rows = await sql<
    { id: string; status: string; execution_id: string; assignment_id: string }[]
  >`
    select
      id::text as id,
      status,
      execution_id::text as execution_id,
      assignment_id::text as assignment_id
    from wearable_activity_confirmations
    where id = ${confirmationId}::bigint
      and athlete_id = ${athlete_id as unknown as number}
      and provider = ${COROS_PROVIDER}
    limit 1
  `;
  const row = rows[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status !== 'pending') return { ok: false, error: 'already_answered' };

  if (answer === 'yes') {
    await sql`
      update workout_executions
      set assignment_id = ${row.assignment_id}::bigint, updated_at = now()
      where id = ${row.execution_id}::bigint
        and athlete_id = ${athlete_id as unknown as number}
        and assignment_id is null
        and not exists (
          select 1 from workout_executions
          where assignment_id = ${row.assignment_id}::bigint
        )
    `;
    await markAssignmentDoneFromDevice(sql, row.assignment_id, athlete_id);
    await sql`
      update wearable_activity_confirmations
      set status = 'no', answered_at = now()
      where assignment_id = ${row.assignment_id}::bigint
        and athlete_id = ${athlete_id as unknown as number}
        and id <> ${row.id}::bigint
        and status = 'pending'
    `;
  }

  await sql`
    update wearable_activity_confirmations
    set status = ${answer}, answered_at = now()
    where id = ${row.id}::bigint
      and athlete_id = ${athlete_id as unknown as number}
      and status = 'pending'
  `;

  return { ok: true, answer };
}
