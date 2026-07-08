/**
 * Real-DB tests for lead nurturing (#10). No SQL mocked (Neon test branch, describeWithDb).
 *
 * Covers, against a pinned clock:
 *   • the candidate selector for EACH branch — parcial_t1/t3, nuevo_t1/t4, noshow_rebook
 *     (both the session_report and appointment sources), pensandoselo_t3
 *   • the hard exclusions — descartado, convertido, no_contactar are never selected
 *   • idempotency — a touch already in lead_nurture_log is not re-selected
 *   • the cron: dryRun returns candidates but sends/logs nothing; a live run claims + logs
 *     each touch once and a second run skips them all (end-to-end idempotency)
 *
 * Written for tsc; SKIPPED unless TEST_DATABASE_URL is set (egress may be blocked).
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { selectNurtureCandidates, type NurtureCandidate } from '@/lib/leads/nurture';
import { runNurture } from '@/lib/leads/nurture-run';
import type { NurtureTouchType } from '@fahybrid/shared/domain/leads/nurture';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

// Pinned "now" — every seed timestamp is expressed relative to this so the due-date math
// is deterministic regardless of when the suite runs.
const NOW = new Date('2026-07-01T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysBeforeNow = (n: number): Date => new Date(NOW.getTime() - n * DAY_MS);

describeWithDb('lead nurturing (#10, real DB)', () => {
  const sql = getTestSql();
  const emails: string[] = [];
  const leadIds: number[] = [];
  const coachIds: number[] = [];
  const userIds: number[] = [];

  function email(tag: string): string {
    const e = `nurt-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
    emails.push(e);
    return e;
  }

  async function seedCoach(): Promise<number> {
    const u = await sql<{ id: string }[]>`
      insert into users (email, role) values (${email('coach')}, 'coach') returning id::text as id
    `;
    userIds.push(Number(u[0]!.id));
    const c = await sql<{ id: string }[]>`
      insert into coaches (user_id, full_name) values (${Number(u[0]!.id)}, 'Nurture Coach') returning id::text as id
    `;
    coachIds.push(Number(c[0]!.id));
    return Number(c[0]!.id);
  }

  interface SeededLead {
    id: number;
    unsubscribe_token: string;
    token: string;
  }

  async function seedLead(opts: {
    status: string;
    createdAt?: Date;
    submittedAt?: Date | null;
    noContactar?: boolean;
  }): Promise<SeededLead> {
    const rows = await sql<{ id: string; unsubscribe_token: string; token: string }[]>`
      insert into leads (email, nombre, status, source, created_at, submitted_at, no_contactar)
      values (
        ${email('lead')}, 'Nurture Lead', ${opts.status}::lead_status, 'onboarding_web',
        ${(opts.createdAt ?? NOW).toISOString()}::timestamptz,
        ${opts.submittedAt ? opts.submittedAt.toISOString() : null},
        ${opts.noContactar ?? false}
      )
      returning id::text as id, unsubscribe_token, token
    `;
    const id = Number(rows[0]!.id);
    leadIds.push(id);
    return { id, unsubscribe_token: rows[0]!.unsubscribe_token, token: rows[0]!.token };
  }

  async function seedSessionReport(
    leadId: number,
    coachId: number,
    outcome: 'no_asistio' | 'pensandoselo',
    occurredAt: Date,
  ): Promise<void> {
    await sql`
      insert into session_reports (lead_id, coach_id, occurred_at, outcome)
      values (${leadId}, ${coachId}, ${occurredAt.toISOString()}::timestamptz, ${outcome}::session_report_outcome)
    `;
  }

  async function seedNoShowAppointment(leadId: number, requestedStart: Date): Promise<void> {
    await sql`
      insert into appointments (lead_id, requested_start, status)
      values (${leadId}, ${requestedStart.toISOString()}::timestamptz, 'no_show'::appointment_status)
    `;
  }

  async function logTouch(leadId: number, touch: NurtureTouchType): Promise<void> {
    await sql`insert into lead_nurture_log (lead_id, touch_type) values (${leadId}, ${touch})`;
  }

  /** Selector output restricted to leads THIS suite seeded (the branch is shared). */
  async function selectMine(): Promise<NurtureCandidate[]> {
    const all = await selectNurtureCandidates(NOW, sql);
    return all.filter((c) => leadIds.includes(Number(c.lead.id)));
  }

  function touchesFor(cands: NurtureCandidate[], leadId: number): NurtureTouchType[] {
    return cands.filter((c) => Number(c.lead.id) === leadId).map((c) => c.touch_type).sort();
  }

  async function nurtureLogCount(): Promise<number> {
    if (leadIds.length === 0) return 0;
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from lead_nurture_log where lead_id in ${sql(leadIds)}
    `;
    return rows[0]?.n ?? 0;
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });

  afterEach(async () => {
    if (leadIds.length) {
      await sql`delete from lead_nurture_log where lead_id in ${sql(leadIds)}`;
      await sql`delete from session_reports where lead_id in ${sql(leadIds)}`;
      await sql`delete from appointments where lead_id in ${sql(leadIds)}`;
      await sql`delete from leads where id in ${sql(leadIds)}`;
    }
    if (coachIds.length) await sql`delete from coaches where id in ${sql(coachIds)}`;
    if (userIds.length) await sql`delete from users where id in ${sql(userIds)}`;
    emails.length = 0;
    leadIds.length = 0;
    coachIds.length = 0;
    userIds.length = 0;
  });

  afterAll(async () => {
    await closeTestSql();
  });

  // Windows (from NURTURE_TOUCHES): parcial_t1 [1,4)d, parcial_t3 [3,7)d, nuevo_t1 [1,4)d,
  // nuevo_t4 [4,8)d, noshow_rebook [0,7)d, pensandoselo_t3 [3,10)d. A touch fires only inside
  // its window, so an old/stale lead is NOT retroactively blasted (first-run safety + hygiene).
  test('(A) parcial: window governs which touches fire; a stale lead is not chased', async () => {
    const overlap = await seedLead({ status: 'parcial', createdAt: daysBeforeNow(3.5) }); // in both windows
    const recent = await seedLead({ status: 'parcial', createdAt: daysBeforeNow(2) }); // t1 only
    const fresh = await seedLead({ status: 'parcial', createdAt: daysBeforeNow(0.5) }); // none yet
    const t1Expired = await seedLead({ status: 'parcial', createdAt: daysBeforeNow(5) }); // t3 only
    const stale = await seedLead({ status: 'parcial', createdAt: daysBeforeNow(10) }); // both expired

    const cands = await selectMine();
    expect(touchesFor(cands, overlap.id)).toEqual(['parcial_t1', 'parcial_t3']); // 3.5d ∈ [1,4)∩[3,7)
    expect(touchesFor(cands, recent.id)).toEqual(['parcial_t1']); // 2d ∈ [1,4), < 3d
    expect(touchesFor(cands, fresh.id)).toEqual([]); // 0.5d < 1d
    expect(touchesFor(cands, t1Expired.id)).toEqual(['parcial_t3']); // 5d ≥ 4d (t1 gone), ∈ [3,7)
    expect(touchesFor(cands, stale.id)).toEqual([]); // 10d past both windows — never chased

    // parcial links to /es/empieza, so carries NO cita token.
    const p1 = cands.find((c) => c.touch_type === 'parcial_t1' && Number(c.lead.id) === overlap.id);
    expect(p1?.cita_token).toBeNull();
    expect(p1?.unsubscribe_token).toBe(overlap.unsubscribe_token);
  });

  test('(B) nuevo: t1 then t4 off submitted_at; each within its window, stale excluded', async () => {
    const inT1 = await seedLead({ status: 'nuevo', submittedAt: daysBeforeNow(2) }); // [1,4)
    const inT4 = await seedLead({ status: 'nuevo', submittedAt: daysBeforeNow(5) }); // [4,8)
    const stale = await seedLead({ status: 'nuevo', submittedAt: daysBeforeNow(10) }); // past both

    const cands = await selectMine();
    expect(touchesFor(cands, inT1.id)).toEqual(['nuevo_t1']); // 2d ∈ [1,4)
    expect(touchesFor(cands, inT4.id)).toEqual(['nuevo_t4']); // 5d ∈ [4,8)
    expect(touchesFor(cands, stale.id)).toEqual([]); // 10d past both windows

    // nuevo touches carry the lead's booking token for the /es/cita/<token> link.
    const n1 = cands.find((c) => c.touch_type === 'nuevo_t1' && Number(c.lead.id) === inT1.id);
    expect(n1?.cita_token).toBe(inT1.token);
  });

  test('(C) noshow_rebook: from a no_asistio session_report OR a no_show appointment', async () => {
    const coachId = await seedCoach();
    const viaReport = await seedLead({ status: 'agendado', createdAt: daysBeforeNow(10) });
    await seedSessionReport(viaReport.id, coachId, 'no_asistio', daysBeforeNow(1));

    const viaAppt = await seedLead({ status: 'agendado', createdAt: daysBeforeNow(10) });
    await seedNoShowAppointment(viaAppt.id, daysBeforeNow(1));

    // A no_show whose slot is still in the FUTURE must not fire yet.
    const future = await seedLead({ status: 'agendado', createdAt: daysBeforeNow(10) });
    await seedNoShowAppointment(future.id, new Date(NOW.getTime() + 2 * DAY_MS));

    // A miss older than the [0,7)d window is stale — not chased.
    const stale = await seedLead({ status: 'agendado', createdAt: daysBeforeNow(20) });
    await seedNoShowAppointment(stale.id, daysBeforeNow(10));

    const cands = await selectMine();
    expect(touchesFor(cands, viaReport.id)).toEqual(['noshow_rebook']);
    expect(touchesFor(cands, viaAppt.id)).toEqual(['noshow_rebook']);
    expect(touchesFor(cands, future.id)).toEqual([]);
    expect(touchesFor(cands, stale.id)).toEqual([]); // missed 10d ago, past the 7d window

    const c = cands.find((x) => Number(x.lead.id) === viaReport.id);
    expect(c?.cita_token).toBe(viaReport.token);
  });

  test('(D) pensandoselo_t3: due 3 days after the call, within its window', async () => {
    const coachId = await seedCoach();
    const due = await seedLead({ status: 'contactado', createdAt: daysBeforeNow(10) });
    await seedSessionReport(due.id, coachId, 'pensandoselo', daysBeforeNow(4)); // ∈ [3,10)

    const notYet = await seedLead({ status: 'contactado', createdAt: daysBeforeNow(10) });
    await seedSessionReport(notYet.id, coachId, 'pensandoselo', daysBeforeNow(1)); // < 3d

    const stale = await seedLead({ status: 'contactado', createdAt: daysBeforeNow(20) });
    await seedSessionReport(stale.id, coachId, 'pensandoselo', daysBeforeNow(15)); // ≥ 10d, past window

    const cands = await selectMine();
    expect(touchesFor(cands, due.id)).toEqual(['pensandoselo_t3']);
    expect(touchesFor(cands, notYet.id)).toEqual([]);
    expect(touchesFor(cands, stale.id)).toEqual([]);
  });

  test('exclusions: descartado, convertido and no_contactar are never selected', async () => {
    const descartado = await seedLead({ status: 'descartado', createdAt: daysBeforeNow(5) });
    const convertido = await seedLead({ status: 'convertido', createdAt: daysBeforeNow(5) });
    const optedOut = await seedLead({ status: 'parcial', createdAt: daysBeforeNow(5), noContactar: true });

    const cands = await selectMine();
    expect(touchesFor(cands, descartado.id)).toEqual([]);
    expect(touchesFor(cands, convertido.id)).toEqual([]);
    expect(touchesFor(cands, optedOut.id)).toEqual([]);
  });

  test('idempotency: an already-logged touch is not re-selected (its sibling still is)', async () => {
    // 3.5d ⇒ both t1 and t3 are within their windows; logging t1 must leave t3 (proves the
    // suppression is the log, not window expiry).
    const lead = await seedLead({ status: 'parcial', createdAt: daysBeforeNow(3.5) });
    await logTouch(lead.id, 'parcial_t1');

    const cands = await selectMine();
    expect(touchesFor(cands, lead.id)).toEqual(['parcial_t3']); // t1 suppressed, t3 still due
  });

  test('cron dryRun: returns candidates, sends nothing, logs nothing', async () => {
    await seedLead({ status: 'parcial', createdAt: daysBeforeNow(3.5) }); // t1 + t3 both due
    let sendCount = 0;
    const send = async (): Promise<{ sent: boolean }> => {
      sendCount += 1;
      return { sent: true };
    };

    const result = await runNurture({ now: NOW, client: sql, dryRun: true, send });

    expect(result.dry_run).toBe(true);
    expect(result.candidates).toBeGreaterThanOrEqual(2); // parcial_t1 + parcial_t3
    expect(result.sent).toBe(0);
    expect(sendCount).toBe(0);
    expect(await nurtureLogCount()).toBe(0); // nothing claimed
  });

  test('cron live run: claims + logs each touch once; a second run skips them all', async () => {
    // 3.5d parcial ⇒ two touches due in one run (t1 + t3, both in-window), so we can prove the
    // claim + second-run-skip for multiple touches on one lead.
    const lead = await seedLead({ status: 'parcial', createdAt: daysBeforeNow(3.5) });
    const sent: NurtureTouchType[] = [];
    const send = async (c: NurtureCandidate): Promise<{ sent: boolean }> => {
      sent.push(c.touch_type);
      return { sent: true };
    };

    const first = await runNurture({ now: NOW, client: sql, send });
    expect(first.sent).toBeGreaterThanOrEqual(2); // parcial_t1 + parcial_t3
    expect(sent.sort()).toEqual(expect.arrayContaining(['parcial_t1', 'parcial_t3']));

    // Log now has one row per claimed touch for this lead.
    const afterFirst = await sql<{ n: number }[]>`
      select count(*)::int as n from lead_nurture_log where lead_id = ${lead.id}
    `;
    expect(afterFirst[0]!.n).toBe(2);

    // Second run: everything is logged → selector returns nothing new for this lead.
    sent.length = 0;
    const second = await runNurture({ now: NOW, client: sql, send });
    expect(sent.filter((t) => t === 'parcial_t1' || t === 'parcial_t3')).toEqual([]);
    // No duplicate rows were written.
    const afterSecond = await sql<{ n: number }[]>`
      select count(*)::int as n from lead_nurture_log where lead_id = ${lead.id}
    `;
    expect(afterSecond[0]!.n).toBe(2);
    void second;
  });
});
