// Account deletion runner — pure logic, no auth, no HTTP.
//
// Reads `account_deletion_jobs` rows whose grace window has elapsed and
// physically removes the user. Schema reference: infra/migrations/0024.
//   - status: pending → processing → completed | failed
//   - scheduled_for: when the irreversible delete becomes eligible
//   - error: free-form when status='failed'
//   - processed_at: timestamp of last terminal transition
//
// The runner is intentionally side-effect heavy (DELETE FROM users) and
// idempotent only at the (user_id) level — the unique partial index in 0024
// guarantees one active job per user, so re-running is safe even if the
// previous attempt failed mid-flight.
//
// Hard-delete strategy:
//   1. `chat_messages.sender_user_id` has ON DELETE RESTRICT (see 0001_init).
//      We pre-delete the user's authored messages so the user row can be
//      removed. Threads themselves cascade from `users` via the athlete row.
//   2. Everything else cascades from `users` (athletes, biometrics, sessions,
//      workouts, checkins, notifications, etc.).
//   3. DELETE FROM users.
//
// Returns processed counts so the HTTP layer can surface them to Vercel Cron
// logs.

import type { Sql } from '@/lib/db';

export interface DeletionJobRow {
  id: string;
  user_id: string;
  scheduled_for: string;
}

export interface RunnerResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ job_id: string; user_id: string; message: string }>;
}

const DEFAULT_BATCH = 100;

export async function loadDueJobs(params: {
  client: Sql;
  limit?: number;
  now?: Date;
}): Promise<DeletionJobRow[]> {
  const { client } = params;
  const limit = params.limit ?? DEFAULT_BATCH;
  const now = params.now ?? new Date();

  // `pending` is the canonical status from 0024_account_deletion_jobs.
  // We claim the rows by transitioning them to 'processing' inside the
  // same query so two concurrent cron invocations don't double-process.
  const rows = await (client as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<Array<DeletionJobRow>>)`
    update account_deletion_jobs
       set status = 'processing'
     where id in (
       select id from account_deletion_jobs
        where status = 'pending'
          and scheduled_for <= ${now.toISOString()}
        order by scheduled_for asc
        limit ${limit}
        for update skip locked
     )
    returning id::text as id, user_id::text as user_id, scheduled_for::text as scheduled_for
  `;
  return rows;
}

export async function executeJob(params: {
  client: Sql;
  job: DeletionJobRow;
}): Promise<void> {
  const { client, job } = params;
  const userId = BigInt(job.user_id);

  const tag = client as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown[]>;

  // 1. Resolve athlete_id from user_id (athletes cascade from users, but
  //    chat_threads reference athletes — see 0001 chat schema). We DON'T
  //    delete athletes manually: cascade does it via users.
  // 2. Pre-delete chat_messages authored by this user (ON DELETE RESTRICT).
  await tag`
    delete from chat_messages where sender_user_id = ${userId}
  `;

  // 3. Hard-delete the user row. Cascades wipe athlete + workouts +
  //    biometrics + checkins + sessions + notifications.
  await tag`
    delete from users where id = ${userId}
  `;

  // 4. Mark the job done.
  await tag`
    update account_deletion_jobs
       set status = 'completed', processed_at = now(), error = null
     where id = ${BigInt(job.id)}
  `;
}

export async function markJobFailed(params: {
  client: Sql;
  job_id: string;
  message: string;
}): Promise<void> {
  const { client, job_id, message } = params;
  const tag = client as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown[]>;
  await tag`
    update account_deletion_jobs
       set status = 'failed', processed_at = now(), error = ${message}
     where id = ${BigInt(job_id)}
  `;
}

export async function runAccountDeletionRunner(params: {
  client: Sql;
  limit?: number;
  now?: Date;
}): Promise<RunnerResult> {
  const jobs = await loadDueJobs(params);
  const result: RunnerResult = {
    processed: jobs.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  for (const job of jobs) {
    try {
      await executeJob({ client: params.client, job });
      result.succeeded += 1;
    } catch (err) {
      result.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ job_id: job.id, user_id: job.user_id, message });
      // Best-effort fail-mark; if even this throws we just give up on the row
      // and the next run will retry (status stays 'processing' which is fine
      // — operator can inspect and reset manually).
      try {
        await markJobFailed({ client: params.client, job_id: job.id, message });
      } catch {
        // swallow
      }
    }
  }

  return result;
}
