/**
 * Real-DB test for lead transition authorship (#43): moving a lead records WHO
 * moved it — a lead_status_events row (the timeline), the leads.last_edited stamp,
 * and an audit_log row — atomically. getLeadDetail then surfaces the timeline.
 *
 * Real Neon branch (no mocks). Skipped when TEST_DATABASE_URL is unset.
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { transitionLeadStatus } from '@/lib/leads/store';
import { getLeadDetail } from '@/lib/dashboard/coach/leads';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

describeWithDb('lead transition authorship (real DB)', () => {
  const sql = getTestSql();
  const emails: string[] = [];
  let actorUserId = BigInt(0);
  const actorEmail = `lead-actor-${Date.now()}@test.local`;

  function uniqueLeadEmail(): string {
    const e = `lead-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`.toLowerCase();
    emails.push(e);
    return e;
  }

  beforeAll(async () => {
    const u = await sql<Array<{ id: string }>>`
      insert into users (email, role, full_name) values (${actorEmail}, 'coach', 'Gerard Coach')
      returning id::text as id
    `;
    actorUserId = BigInt(u[0]!.id);
  });

  afterEach(async () => {
    if (emails.length === 0) return;
    const ids = (
      await sql<Array<{ id: string }>>`select id::text as id from leads where email in ${sql(emails)}`
    ).map((r) => BigInt(r.id));
    if (ids.length > 0) {
      await sql`delete from lead_status_events where lead_id in ${sql(ids)}`;
      await sql`delete from audit_log where entity_type = 'leads' and entity_id in ${sql(ids)}`;
    }
    await sql`delete from leads where email in ${sql(emails)}`;
    emails.length = 0;
  });

  afterAll(async () => {
    await sql`delete from users where email = ${actorEmail}`;
    await closeTestSql();
  });

  test('transition records event + last_edited stamp + audit, and the timeline reads it', async () => {
    const email = uniqueLeadEmail();
    const seeded = await sql<Array<{ id: string }>>`
      insert into leads (email, status) values (${email}, 'nuevo'::lead_status)
      returning id::text as id
    `;
    const leadId = BigInt(seeded[0]!.id);

    const res = await transitionLeadStatus({
      id: leadId,
      to: 'contactado',
      actor: { kind: 'coach', user_id: actorUserId },
    });
    expect(res.status).toBe('contactado');

    // last_edited stamp on the lead.
    const lead = await sql<Array<{ by: string | null; kind: string | null }>>`
      select last_edited_by_user_id::text as by, last_edited_by_kind::text as kind
      from leads where id = ${Number(leadId)}
    `;
    expect(BigInt(lead[0]!.by!)).toBe(actorUserId);
    expect(lead[0]!.kind).toBe('coach');

    // Timeline event.
    const events = await sql<Array<{ from_status: string | null; to_status: string; by: string | null; kind: string }>>`
      select from_status, to_status, changed_by_user_id::text as by, changed_by_kind::text as kind
      from lead_status_events where lead_id = ${Number(leadId)}
    `;
    expect(events).toHaveLength(1);
    expect(events[0]!.from_status).toBe('nuevo');
    expect(events[0]!.to_status).toBe('contactado');
    expect(BigInt(events[0]!.by!)).toBe(actorUserId);
    expect(events[0]!.kind).toBe('coach');

    // Audit trail.
    const audit = await sql<Array<{ action: string; kind: string | null }>>`
      select action::text as action, actor_kind::text as kind
      from audit_log where entity_type = 'leads' and entity_id = ${Number(leadId)}
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe('update');
    expect(audit[0]!.kind).toBe('coach');

    // The loader surfaces the timeline with the resolved changer name.
    const detail = await getLeadDetail(leadId);
    expect(detail?.timeline).toHaveLength(1);
    expect(detail?.timeline[0]!.to_status).toBe('contactado');
    expect(detail?.timeline[0]!.changed_by_name).toBe('Gerard Coach');
  });
});
