/**
 * Multi-tenancy of the coach funnel surfaces (real Neon branch, no mocks).
 *
 * THE rule under test — `coachOwnsLead` (lib/leads/store.ts):
 *   • own lead (leads.coach_id = coach)      → actionable
 *   • another club's lead                    → invisible (null / not_found 404)
 *   • unassigned lead (coach_id NULL, 0147)  → actionable by any club (fail-open,
 *     single-club today; see the rule's doc-comment)
 *
 * Appointments carry no coach_id (0093) — they scope THROUGH their lead's owner.
 * Skipped when TEST_DATABASE_URL is unset (describeWithDb, never false-green).
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import { coachOwnsLead, transitionLeadStatus, LeadTransitionError } from '@/lib/leads/store';
import { getLeadDetail } from '@/lib/dashboard/coach/leads';
import { actOnAppointment, setAppointmentMeetLink, CitasError } from '@/lib/citas/store';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

describeWithDb('tenancy: leads + citas scoped by the lead\'s coach (real DB)', () => {
  const sql = getTestSql();

  let coachAUserId = 0;
  let coachBUserId = 0;
  let coachA = BigInt(0);
  let coachB = BigInt(0);
  let leadA = BigInt(0); // owned by coach A
  let leadB = BigInt(0); // owned by coach B
  let leadNull = BigInt(0); // «sin asignar» (coach_id NULL)
  let apptA = BigInt(0); // aceptada, on leadA
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function seedCoach(tag: string): Promise<{ userId: number; coachId: bigint }> {
    const u = await sql<{ id: string }[]>`
      insert into users (email, role) values (${`tenancy-${tag}-${stamp}@test.local`}, 'coach')
      returning id::text as id
    `;
    const c = await sql<{ id: string }[]>`
      insert into coaches (user_id, full_name) values (${Number(u[0]!.id)}, ${`Club ${tag}`})
      returning id::text as id
    `;
    return { userId: Number(u[0]!.id), coachId: BigInt(c[0]!.id) };
  }

  async function seedLead(tag: string, coachId: bigint | null): Promise<bigint> {
    const r = await sql<{ id: string }[]>`
      insert into leads (email, nombre, status, source, coach_id)
      values (${`tenancy-lead-${tag}-${stamp}@test.local`}, ${`Lead ${tag}`}, 'nuevo', 'onboarding_web',
              ${coachId === null ? null : Number(coachId)})
      returning id::text as id
    `;
    return BigInt(r[0]!.id);
  }

  beforeAll(async () => {
    const a = await seedCoach('a');
    const b = await seedCoach('b');
    coachAUserId = a.userId;
    coachBUserId = b.userId;
    coachA = a.coachId;
    coachB = b.coachId;
    leadA = await seedLead('a', coachA);
    leadB = await seedLead('b', coachB);
    leadNull = await seedLead('null', null);

    const appt = await sql<{ id: string }[]>`
      insert into appointments (lead_id, requested_start, duration_minutes, status, modality)
      values (${Number(leadA)}, now() + interval '2 days', 30, 'aceptada', 'video')
      returning id::text as id
    `;
    apptA = BigInt(appt[0]!.id);
  });

  afterAll(async () => {
    const leadIds = [Number(leadA), Number(leadB), Number(leadNull)].filter((n) => n > 0);
    if (leadIds.length) {
      await sql`delete from appointments where lead_id in ${sql(leadIds)}`;
      await sql`delete from lead_status_events where lead_id in ${sql(leadIds)}`;
      await sql`delete from audit_log where entity_type = 'leads' and entity_id in ${sql(leadIds)}`;
      await sql`delete from leads where id in ${sql(leadIds)}`;
    }
    await sql`delete from coaches where id in (${Number(coachA)}, ${Number(coachB)})`;
    await sql`delete from users where id in (${coachAUserId}, ${coachBUserId})`;
    await closeTestSql();
  });

  // ── The rule itself ─────────────────────────────────────────────────────────────
  test('coachOwnsLead: own → true, alien → false, unassigned → true', async () => {
    expect(await coachOwnsLead(coachA, leadA)).toBe(true);
    expect(await coachOwnsLead(coachA, leadB)).toBe(false);
    expect(await coachOwnsLead(coachA, leadNull)).toBe(true);
  });

  // ── Lead ficha (GET detail) ─────────────────────────────────────────────────────
  test('getLeadDetail: own reads, alien reads as null, unassigned reads', async () => {
    expect((await getLeadDetail(leadA, coachA))?.id).toBe(String(leadA));
    expect(await getLeadDetail(leadB, coachA)).toBeNull();
    expect((await getLeadDetail(leadNull, coachA))?.id).toBe(String(leadNull));
  });

  // ── Lead pipeline transition (PATCH) ────────────────────────────────────────────
  test('transitionLeadStatus: alien lead → not_found 404, nothing written', async () => {
    await expect(
      transitionLeadStatus({
        id: leadB,
        to: 'contactado',
        coach_id: coachA,
        actor: { kind: 'coach', user_id: BigInt(coachAUserId) },
      }),
    ).rejects.toMatchObject({ name: 'LeadTransitionError', code: 'not_found', status: 404 });

    const row = await sql<{ status: string }[]>`
      select status::text as status from leads where id = ${Number(leadB)}
    `;
    expect(row[0]!.status).toBe('nuevo'); // untouched
  });

  test('transitionLeadStatus: own lead transitions normally', async () => {
    const res = await transitionLeadStatus({
      id: leadA,
      to: 'contactado',
      coach_id: coachA,
      actor: { kind: 'coach', user_id: BigInt(coachAUserId) },
    });
    expect(res.status).toBe('contactado');
  });

  // ── Citas: scope THROUGH the lead's owner ───────────────────────────────────────
  test('actOnAppointment: alien coach → not_found 404, status untouched', async () => {
    await expect(
      actOnAppointment({ id: apptA, coach_id: coachB, action: 'completar' }),
    ).rejects.toMatchObject({ name: 'CitasError', code: 'not_found', status: 404 });

    const row = await sql<{ status: string }[]>`
      select status::text as status from appointments where id = ${Number(apptA)}
    `;
    expect(row[0]!.status).toBe('aceptada');
  });

  test('setAppointmentMeetLink: alien coach → 404; own coach and system (null) seal it', async () => {
    await expect(
      setAppointmentMeetLink({ id: apptA, coach_id: coachB, meet_link: 'https://meet.example/alien' }),
    ).rejects.toMatchObject({ name: 'CitasError', code: 'not_found', status: 404 });

    const own = await setAppointmentMeetLink({
      id: apptA,
      coach_id: coachA,
      meet_link: 'https://meet.example/own',
    });
    expect(own.meet_link).toBe('https://meet.example/own');

    // coach_id null = the trusted post-booking path (public route, no session).
    const system = await setAppointmentMeetLink({
      id: apptA,
      coach_id: null,
      meet_link: 'https://meet.example/system',
    });
    expect(system.meet_link).toBe('https://meet.example/system');
  });

  test('actOnAppointment: own coach acts normally (aceptada → completada)', async () => {
    const res = await actOnAppointment({ id: apptA, coach_id: coachA, action: 'completar' });
    expect(res.newStatus).toBe('completada');
    expect(res.appointment.status).toBe('completada');
  });

  // The imports keep the error classes referenced so a rename breaks THIS suite loudly.
  test('error classes stay exported', () => {
    expect(LeadTransitionError.name).toBe('LeadTransitionError');
    expect(CitasError.name).toBe('CitasError');
  });
});
