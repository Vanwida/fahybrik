/**
 * Real-DB test for the COLD layer of the authorship registry (migration 0114 +
 * lib/audit/record-edit.ts): recordAudit appends a permanent audit_log row, and
 * the actor is (kind, user_id?) where user_id is null for a non-person actor.
 *
 * Runs against a real Neon branch so the audit_action + actor_kind enums and the
 * users FK are live. Skipped explicitly when TEST_DATABASE_URL is unset.
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { recordAudit } from '@/lib/audit/record-edit';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

describeWithDb('recordAudit — permanent authorship log (real DB)', () => {
  const sql = getTestSql();
  const entityType = `_audit_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let actorUserId = BigInt(0);
  const actorEmail = `audit-actor-${Date.now()}@test.local`;

  beforeAll(async () => {
    const u = await sql<Array<{ id: string }>>`
      insert into users (email, role) values (${actorEmail}, 'coach') returning id::text as id
    `;
    actorUserId = BigInt(u[0]!.id);
  });

  afterEach(async () => {
    await sql`delete from audit_log where entity_type = ${entityType}`;
  });

  afterAll(async () => {
    await sql`delete from users where email = ${actorEmail}`;
    await closeTestSql();
  });

  test('coach actor: records user_id + kind + action + diff', async () => {
    await recordAudit(sql, {
      entity_type: entityType,
      entity_id: BigInt(101),
      action: 'update',
      actor: { kind: 'coach', user_id: actorUserId },
      diff: { field: 'title', from: 'a', to: 'b' },
    });

    const rows = await sql<
      Array<{ actor_user_id: string | null; actor_kind: string | null; action: string; diff_json: unknown }>
    >`
      select actor_user_id::text as actor_user_id, actor_kind, action, diff_json
      from audit_log where entity_type = ${entityType} and entity_id = 101
    `;
    expect(rows).toHaveLength(1);
    expect(BigInt(rows[0]!.actor_user_id!)).toBe(actorUserId);
    expect(rows[0]!.actor_kind).toBe('coach');
    expect(rows[0]!.action).toBe('update');
    const diff = rows[0]!.diff_json;
    const parsed = typeof diff === 'string' ? JSON.parse(diff) : diff;
    expect(parsed).toMatchObject({ field: 'title', to: 'b' });
  });

  test('ai actor: records kind with a NULL user_id (non-person actor)', async () => {
    await recordAudit(sql, {
      entity_type: entityType,
      entity_id: BigInt(202),
      action: 'create',
      actor: { kind: 'ai', user_id: null },
    });

    const rows = await sql<Array<{ actor_user_id: string | null; actor_kind: string | null }>>`
      select actor_user_id::text as actor_user_id, actor_kind
      from audit_log where entity_type = ${entityType} and entity_id = 202
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor_user_id).toBeNull();
    expect(rows[0]!.actor_kind).toBe('ai');
  });
});
