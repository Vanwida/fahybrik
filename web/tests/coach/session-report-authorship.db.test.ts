/**
 * Real-DB test for 1:1 session-report authorship (#43): creating a parte stamps
 * WHO wrote it (created_by_user_id + kind) and appends a create audit_log row;
 * editing stamps last_edited_by + an update audit row — atomically. The list read
 * then resolves the author's display name for the <AuthorStamp>.
 *
 * Real Neon branch (no mocks). Skipped when TEST_DATABASE_URL is unset.
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import {
  createSessionReport,
  updateSessionReport,
  listSessionReportsForLead,
} from '@/lib/coach/session-reports';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

describeWithDb('session report authorship (#43, real DB)', () => {
  const sql = getTestSql();
  const emails: string[] = [];
  const coachIds: number[] = [];
  const leadIds: number[] = [];
  const reportIds: number[] = [];
  const userIds: number[] = [];
  let authorUserId = BigInt(0);
  let coachId = BigInt(0);

  function email(tag: string): string {
    const e = `sr-auth-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`.toLowerCase();
    emails.push(e);
    return e;
  }

  beforeAll(async () => {
    const u = await sql<Array<{ id: string }>>`
      insert into users (email, role, full_name) values (${email('author')}, 'coach', 'SR Author')
      returning id::text as id
    `;
    authorUserId = BigInt(u[0]!.id);
    userIds.push(Number(u[0]!.id));
    const c = await sql<Array<{ id: string }>>`
      insert into coaches (user_id, full_name) values (${Number(authorUserId)}, 'SR Author Club')
      returning id::text as id
    `;
    coachId = BigInt(c[0]!.id);
    coachIds.push(Number(c[0]!.id));
  });

  afterEach(async () => {
    if (reportIds.length) {
      await sql`delete from audit_log where entity_type = 'session_reports' and entity_id in ${sql(reportIds)}`;
      await sql`delete from session_reports where id in ${sql(reportIds)}`;
    }
    if (leadIds.length) await sql`delete from leads where id in ${sql(leadIds)}`;
    reportIds.length = leadIds.length = 0;
  });

  afterAll(async () => {
    if (coachIds.length) await sql`delete from coaches where id in ${sql(coachIds)}`;
    if (userIds.length) await sql`delete from users where id in ${sql(userIds)}`;
    await closeTestSql();
  });

  async function seedLead(tag: string): Promise<number> {
    const lead = await sql<Array<{ id: string }>>`
      insert into leads (email, nombre, status) values (${email(tag)}, 'SR Lead', 'agendado'::lead_status)
      returning id::text as id
    `;
    const id = Number(lead[0]!.id);
    leadIds.push(id);
    return id;
  }

  test('create stamps created_by + a create audit row, and the list read resolves the author name', async () => {
    const leadId = await seedLead('lead');

    const rep = await createSessionReport({
      coach_id: coachId,
      input: { lead_id: leadId, outcome: 'quiere_empezar', quoted_price_eur: 120, notes: 'Llamada de venta.' },
      by_user_id: authorUserId,
    });
    reportIds.push(Number(rep.id));

    // The returned view already carries the resolved author; no edit yet.
    expect(rep.created_by_name).toBe('SR Author');
    expect(rep.last_edited_by_name).toBeNull();

    // Stamp written on the row (created_by set, last_edited left null until a real edit).
    const row = await sql<Array<{ by: string | null; kind: string | null; ed: string | null }>>`
      select created_by_user_id::text as by, created_by_kind::text as kind,
             last_edited_by_user_id::text as ed
      from session_reports where id = ${Number(rep.id)}
    `;
    expect(BigInt(row[0]!.by!)).toBe(authorUserId);
    expect(row[0]!.kind).toBe('coach');
    expect(row[0]!.ed).toBeNull();

    // Audit trail: exactly one create row, attributed to the coach.
    const audit = await sql<Array<{ action: string; kind: string | null; by: string | null }>>`
      select action::text as action, actor_kind::text as kind, actor_user_id::text as by
      from audit_log where entity_type = 'session_reports' and entity_id = ${Number(rep.id)}
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe('create');
    expect(audit[0]!.kind).toBe('coach');
    expect(BigInt(audit[0]!.by!)).toBe(authorUserId);

    // The list read resolves the author display name for the sello.
    const hist = await listSessionReportsForLead(BigInt(leadId));
    expect(hist).toHaveLength(1);
    expect(hist[0]!.created_by_name).toBe('SR Author');
    expect(hist[0]!.last_edited_by_name).toBeNull();
  });

  test('update stamps last_edited_by + appends an update audit row', async () => {
    const leadId = await seedLead('lead2');

    const rep = await createSessionReport({
      coach_id: coachId,
      input: { lead_id: leadId, outcome: 'pensandoselo', notes: 'A' },
      by_user_id: authorUserId,
    });
    reportIds.push(Number(rep.id));

    const upd = await updateSessionReport({
      id: BigInt(rep.id),
      coach_id: coachId,
      input: { outcome: 'quiere_empezar', notes: 'B' },
      by_user_id: authorUserId,
    });
    expect(upd.notes).toBe('B');
    expect(upd.created_by_name).toBe('SR Author');
    expect(upd.last_edited_by_name).toBe('SR Author');

    // last_edited_by now stamped.
    const row = await sql<Array<{ ed: string | null; kind: string | null }>>`
      select last_edited_by_user_id::text as ed, last_edited_by_kind::text as kind
      from session_reports where id = ${Number(rep.id)}
    `;
    expect(BigInt(row[0]!.ed!)).toBe(authorUserId);
    expect(row[0]!.kind).toBe('coach');

    // Audit trail: create then update, in order.
    const audit = await sql<Array<{ action: string }>>`
      select action::text as action from audit_log
      where entity_type = 'session_reports' and entity_id = ${Number(rep.id)}
      order by id
    `;
    expect(audit.map((a) => a.action)).toEqual(['create', 'update']);
  });
});
