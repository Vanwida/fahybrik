// Unit tests for the account_deletion_jobs cron runner.
//
// The runner is pure — we stub `sql` with a tag that records every query.
// What we verify:
//   - loadDueJobs uses the claim-and-return pattern (UPDATE ... RETURNING)
//     so two cron invocations don't double-process.
//   - executeJob pre-deletes chat_messages (ON DELETE RESTRICT in 0001),
//     then DELETE FROM users, then UPDATE the job to completed.
//   - markJobFailed transitions status to 'failed' with the error message.
//   - runAccountDeletionRunner aggregates counts and surfaces per-row errors.

import { describe, expect, it } from 'vitest';
import {
  loadDueJobs,
  executeJob,
  markJobFailed,
  runAccountDeletionRunner,
  type DeletionJobRow,
} from '@/lib/cron/account-deletion-runner';
import type { Sql } from '@/lib/db';

type Call = { raw: string; values: unknown[] };

function makeFakeSql(scripted: Array<unknown[] | Error>): { sql: Sql; calls: Call[] } {
  const calls: Call[] = [];
  let cursor = 0;
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    const raw = strings.join('?');
    calls.push({ raw, values });
    const next = scripted[cursor++] ?? [];
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  };
  return { sql: tag as unknown as Sql, calls };
}

describe('loadDueJobs', () => {
  it('claims pending+due rows via UPDATE ... RETURNING (skip locked)', async () => {
    const due: DeletionJobRow[] = [
      { id: '1', user_id: '42', scheduled_for: '2026-05-01T00:00:00Z' },
    ];
    const { sql, calls } = makeFakeSql([due]);
    const out = await loadDueJobs({ client: sql, limit: 10, now: new Date('2026-05-26Z') });
    expect(out).toEqual(due);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.raw).toMatch(/update account_deletion_jobs/i);
    expect(calls[0]!.raw).toMatch(/status = 'processing'/);
    expect(calls[0]!.raw).toMatch(/for update skip locked/);
    expect(calls[0]!.raw).toMatch(/returning/i);
  });
});

describe('executeJob', () => {
  it('pre-deletes chat_messages, deletes the user, marks job completed', async () => {
    const { sql, calls } = makeFakeSql([
      [], // DELETE chat_messages
      [], // DELETE users
      [], // UPDATE account_deletion_jobs
    ]);
    await executeJob({
      client: sql,
      job: { id: '7', user_id: '42', scheduled_for: '2026-05-01T00:00:00Z' },
    });
    expect(calls).toHaveLength(3);
    expect(calls[0]!.raw).toMatch(/delete from chat_messages/i);
    expect(calls[0]!.raw).toMatch(/sender_user_id =/);
    expect(calls[1]!.raw).toMatch(/delete from users/i);
    expect(calls[1]!.values).toContain(BigInt(42));
    expect(calls[2]!.raw).toMatch(/update account_deletion_jobs/i);
    expect(calls[2]!.raw).toMatch(/status = 'completed'/);
  });
});

describe('markJobFailed', () => {
  it('sets status=failed with the error message', async () => {
    const { sql, calls } = makeFakeSql([[]]);
    await markJobFailed({ client: sql, job_id: '9', message: 'boom' });
    expect(calls[0]!.raw).toMatch(/status = 'failed'/);
    expect(calls[0]!.values).toContain('boom');
  });
});

describe('runAccountDeletionRunner', () => {
  it('processes every claimed job and aggregates counts', async () => {
    const due: DeletionJobRow[] = [
      { id: '1', user_id: '10', scheduled_for: '2026-05-01' },
      { id: '2', user_id: '11', scheduled_for: '2026-05-01' },
    ];
    const { sql } = makeFakeSql([
      due, // loadDueJobs
      [], [], [], // executeJob job 1
      [], [], [], // executeJob job 2
    ]);
    const result = await runAccountDeletionRunner({ client: sql });
    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('captures per-row failures without aborting the batch', async () => {
    const due: DeletionJobRow[] = [
      { id: '1', user_id: '10', scheduled_for: '2026-05-01' },
      { id: '2', user_id: '11', scheduled_for: '2026-05-01' },
    ];
    const { sql } = makeFakeSql([
      due, // loadDueJobs
      [], // DELETE chat_messages job 1
      new Error('users delete failed'), // DELETE users job 1 → throws
      [], // markJobFailed job 1
      [], [], [], // executeJob job 2 succeeds
    ]);
    const result = await runAccountDeletionRunner({ client: sql });
    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatchObject({ job_id: '1', user_id: '10' });
    expect(result.errors[0]!.message).toMatch(/users delete failed/);
  });
});
