/**
 * Real-DB test for the funnel metrics aggregator (#20). No SQL mocked (Neon
 * branch, per CLAUDE.md).
 *
 * ISOLATION: the funnel is a global cohort aggregate (all leads whose created_at
 * is in the window), so a shared branch's pre-existing rows would pollute exact
 * counts. We seed the cohort in a FAR-FUTURE window (year 2999) and query with a
 * matching `now`, so `since = now − 30d` excludes every real/pre-existing lead
 * and the assertions are deterministic.
 *
 * The weekly series is hard-wired to the real "last 8 weeks" (no injectable now),
 * so it is verified with a baseline→seed→delta comparison instead.
 *
 * WRITTEN but not run here (DB egress blocked); it must compile under tsc and be
 * correct when executed against a throwaway TEST_DATABASE_URL branch.
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import {
  loadFunnelSnapshot,
  loadCallOutcomes,
  loadByObjetivo,
  loadWeeklySeries,
} from '@/lib/dashboard/coach/metrics';
import type { SessionOutcome } from '@fahybrid/shared/domain/sessions/outcome';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

describeWithDb('funnel metrics aggregator (#20, real DB)', () => {
  const sql = getTestSql();

  // Far-future isolation window: FUTURE_NOW − 30d < lead created_at < FUTURE_NOW.
  const FUTURE_NOW = new Date('2999-02-01T00:00:00Z');
  const FUTURE_LEAD_AT = new Date('2999-01-15T12:00:00Z');
  const FUTURE_OCCURRED = new Date('2999-01-16T12:00:00Z');
  const FUTURE_APPT_AT = new Date('2999-01-16T10:00:00Z');

  const leadIds: number[] = [];
  const coachIds: number[] = [];
  const athleteIds: number[] = [];
  const userIds: number[] = [];
  const invitationIds: number[] = [];
  const emails: string[] = [];

  function email(tag: string): string {
    const e = `fn-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
    emails.push(e);
    return e;
  }

  async function seedCoach(): Promise<number> {
    const u = await sql<{ id: string }[]>`
      insert into users (email, role) values (${email('coach')}, 'coach') returning id::text as id`;
    userIds.push(Number(u[0]!.id));
    const c = await sql<{ id: string }[]>`
      insert into coaches (user_id, full_name) values (${Number(u[0]!.id)}, 'FN Coach') returning id::text as id`;
    coachIds.push(Number(c[0]!.id));
    return Number(c[0]!.id);
  }

  async function seedAthlete(coachId: number): Promise<number> {
    const u = await sql<{ id: string }[]>`
      insert into users (email, role) values (${email('ath')}, 'athlete') returning id::text as id`;
    userIds.push(Number(u[0]!.id));
    const a = await sql<{ id: string }[]>`
      insert into athletes (user_id, full_name, coach_id)
      values (${Number(u[0]!.id)}, 'FN Ath', ${coachId}) returning id::text as id`;
    athleteIds.push(Number(a[0]!.id));
    return Number(a[0]!.id);
  }

  interface LeadSeed {
    status: string;
    objetivo: string;
    submitted?: boolean;
    createdAt?: Date;
    submittedAt?: Date;
    altaSentAt?: Date | null;
    convertedAthleteId?: number | null;
  }
  async function seedLead(s: LeadSeed): Promise<number> {
    const created = s.createdAt ?? FUTURE_LEAD_AT;
    const submitted = s.submitted ? (s.submittedAt ?? created) : null;
    const r = await sql<{ id: string }[]>`
      insert into leads (email, nombre, status, source, objetivo, created_at, submitted_at, alta_sent_at, converted_athlete_id)
      values (${email('lead')}, 'FN Lead', ${s.status}, 'onboarding_web', ${s.objetivo},
              ${created}, ${submitted}, ${s.altaSentAt ?? null}, ${s.convertedAthleteId ?? null})
      returning id::text as id`;
    leadIds.push(Number(r[0]!.id));
    return Number(r[0]!.id);
  }

  async function seedAppointment(leadId: number, status: string, createdAt?: Date): Promise<void> {
    if (createdAt) {
      await sql`
        insert into appointments (lead_id, requested_start, status, created_at)
        values (${leadId}, ${FUTURE_APPT_AT}, ${status}, ${createdAt})`;
    } else {
      await sql`
        insert into appointments (lead_id, requested_start, status)
        values (${leadId}, ${FUTURE_APPT_AT}, ${status})`;
    }
  }

  async function seedReport(
    leadId: number,
    coachId: number,
    opts: { outcome: SessionOutcome; price?: number | null; occurredAt?: Date },
  ): Promise<void> {
    await sql`
      insert into session_reports (lead_id, coach_id, occurred_at, outcome, quoted_price_eur, notes)
      values (${leadId}, ${coachId}, ${opts.occurredAt ?? FUTURE_OCCURRED}, ${opts.outcome},
              ${opts.price ?? null}, 'parte')`;
  }

  async function seedInvitation(opts: {
    leadId: number;
    athleteId: number;
    userId: number;
    coachId: number;
    redeemedAt: Date;
  }): Promise<void> {
    const token = `tok-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const inv = await sql<{ id: string }[]>`
      insert into athlete_invitations
        (athlete_id, target_user_id, created_by_coach_id, token_sha256, status, expires_at, redeemed_at, lead_id)
      values (${opts.athleteId}, ${opts.userId}, ${opts.coachId}, ${token}, 'redeemed',
              ${new Date(opts.redeemedAt.getTime() + 14 * 86_400_000)}, ${opts.redeemedAt}, ${opts.leadId})
      returning id::text as id`;
    invitationIds.push(Number(inv[0]!.id));
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });

  afterEach(async () => {
    if (invitationIds.length) await sql`delete from athlete_invitations where id in ${sql(invitationIds)}`;
    if (leadIds.length) await sql`delete from session_reports where lead_id in ${sql(leadIds)}`;
    if (leadIds.length) await sql`delete from appointments where lead_id in ${sql(leadIds)}`;
    if (leadIds.length) await sql`delete from leads where id in ${sql(leadIds)}`;
    if (athleteIds.length) await sql`delete from athletes where id in ${sql(athleteIds)}`;
    if (coachIds.length) await sql`delete from coaches where id in ${sql(coachIds)}`;
    if (userIds.length) await sql`delete from users where id in ${sql(userIds)}`;
    leadIds.length =
      coachIds.length =
      athleteIds.length =
      userIds.length =
      invitationIds.length =
      emails.length =
        0;
  });

  afterAll(async () => {
    await closeTestSql();
  });

  // ── Funnel snapshot + conversions + side-exits (isolated future cohort) ────────────
  test('funnel stages, conversions and side-exits are counted per the model', async () => {
    const coachId = await seedCoach();
    const athleteId = await seedAthlete(coachId);

    // L1 — onboarding iniciado only (parcial, never submitted).
    await seedLead({ status: 'parcial', objetivo: 'primer_hyrox', submitted: false });
    // L2 — completado.
    await seedLead({ status: 'nuevo', objetivo: 'primer_hyrox', submitted: true });
    // L3 — cita reservada (appointment aceptada, no report).
    const l3 = await seedLead({ status: 'agendado', objetivo: 'mejorar_marca', submitted: true });
    await seedAppointment(l3, 'aceptada');
    // L4 — llamada realizada (report quiere_empezar, price 100).
    const l4 = await seedLead({ status: 'agendado', objetivo: 'mejorar_marca', submitted: true });
    await seedAppointment(l4, 'aceptada');
    await seedReport(l4, coachId, { outcome: 'quiere_empezar', price: 100 });
    // L5 — alta enviada (appointment completada + report, price 150).
    const l5 = await seedLead({
      status: 'agendado',
      objetivo: 'podio',
      submitted: true,
      altaSentAt: FUTURE_OCCURRED,
    });
    await seedAppointment(l5, 'completada');
    await seedReport(l5, coachId, { outcome: 'quiere_empezar', price: 150 });
    // L6 — convertido (all stages; converted_athlete_id set, price 200).
    const l6 = await seedLead({
      status: 'convertido',
      objetivo: 'podio',
      submitted: true,
      altaSentAt: FUTURE_OCCURRED,
      convertedAthleteId: athleteId,
    });
    await seedAppointment(l6, 'completada');
    await seedReport(l6, coachId, { outcome: 'quiere_empezar', price: 200 });
    // L7 — descartado side-exit.
    await seedLead({ status: 'descartado', objetivo: 'hibrido_general', submitted: true });
    // L8 — no-show via appointment (still counts as cita).
    const l8 = await seedLead({ status: 'agendado', objetivo: 'hibrido_general', submitted: true });
    await seedAppointment(l8, 'no_show');
    // L9 — se lo piensan (report pensandoselo → counts as llamada; no price).
    const l9 = await seedLead({ status: 'agendado', objetivo: 'otro', submitted: true });
    await seedAppointment(l9, 'aceptada');
    await seedReport(l9, coachId, { outcome: 'pensandoselo' });
    // L10 — no_asistio report (NOT a llamada; counts as no-show side-exit).
    const l10 = await seedLead({ status: 'agendado', objetivo: 'otro', submitted: true });
    await seedAppointment(l10, 'aceptada');
    await seedReport(l10, coachId, { outcome: 'no_asistio' });

    const snap = await loadFunnelSnapshot('30d', FUTURE_NOW);

    expect(snap.stages).toEqual({
      iniciado: 10,
      completado: 9,
      cita: 7,
      llamada: 4,
      alta_enviada: 2,
      convertido: 1,
    });
    expect(snap.side_exits).toEqual({ descartados: 1, no_show: 2, pensandoselo: 1 });

    expect(snap.conversions.completado).toBeCloseTo(9 / 10, 5);
    expect(snap.conversions.cita).toBeCloseTo(7 / 9, 5);
    expect(snap.conversions.llamada).toBeCloseTo(4 / 7, 5);
    expect(snap.conversions.alta_enviada).toBeCloseTo(2 / 4, 5);
    expect(snap.conversions.convertido).toBeCloseTo(1 / 2, 5);
    expect(snap.conversions.onboarding_to_alta).toBeCloseTo(1 / 9, 5);

    // Bounded range → deltas object present; no prior-window seeds → each null (no base).
    expect(snap.deltas).not.toBeNull();
    expect(snap.deltas?.completado).toBeNull();
    expect(snap.deltas?.convertido).toBeNull();
  });

  // ── Call outcomes + average quoted price ─────────────────────────────────────────
  test('call outcomes breakdown and average quoted price', async () => {
    const coachId = await seedCoach();
    const a = await seedLead({ status: 'agendado', objetivo: 'primer_hyrox', submitted: true });
    const b = await seedLead({ status: 'agendado', objetivo: 'mejorar_marca', submitted: true });
    const c = await seedLead({ status: 'agendado', objetivo: 'podio', submitted: true });
    await seedReport(a, coachId, { outcome: 'quiere_empezar', price: 100 });
    await seedReport(b, coachId, { outcome: 'pensandoselo', price: 200 });
    await seedReport(c, coachId, { outcome: 'no_asistio' }); // no price → not in avg

    const out = await loadCallOutcomes('30d', FUTURE_NOW);

    expect(out.counts).toEqual({
      quiere_empezar: 1,
      pensandoselo: 1,
      no_interesado: 0,
      seguimiento: 0,
      no_asistio: 1,
    });
    expect(out.priced_call_count).toBe(2);
    expect(out.avg_price_eur).toBeCloseTo(150, 5); // (100 + 200) / 2
  });

  // ── By-objetivo segmentation ─────────────────────────────────────────────────────
  test('by-objetivo segmentation with per-objetivo conversion', async () => {
    const coachId = await seedCoach();
    const athleteId = await seedAthlete(coachId);

    // primer_hyrox: 2 onboardings, 1 cita, 0 altas.
    const p1 = await seedLead({ status: 'agendado', objetivo: 'primer_hyrox', submitted: true });
    await seedAppointment(p1, 'aceptada');
    await seedLead({ status: 'nuevo', objetivo: 'primer_hyrox', submitted: true });
    // podio: 2 onboardings, 2 citas, 1 alta (convertido).
    const q1 = await seedLead({ status: 'agendado', objetivo: 'podio', submitted: true });
    await seedAppointment(q1, 'aceptada');
    const q2 = await seedLead({
      status: 'convertido',
      objetivo: 'podio',
      submitted: true,
      convertedAthleteId: athleteId,
    });
    await seedAppointment(q2, 'completada');

    const rows = await loadByObjetivo('30d', FUTURE_NOW);
    const byCode = new Map(rows.map((r) => [r.objetivo, r]));

    const ph = byCode.get('primer_hyrox');
    expect(ph).toMatchObject({ onboardings: 2, citas: 1, altas: 0 });
    expect(ph?.conversion).toBeCloseTo(0, 5);

    const po = byCode.get('podio');
    expect(po).toMatchObject({ onboardings: 2, citas: 2, altas: 1 });
    expect(po?.conversion).toBeCloseTo(1 / 2, 5);
  });

  // ── Weekly series (baseline → seed → delta; runs against real "now") ──────────────
  test('weekly series increments the current week for onboardings, citas and altas', async () => {
    const coachId = await seedCoach();
    const athleteId = await seedAthlete(coachId);
    const userId = userIds[userIds.length - 1]!; // the athlete's user

    const baseline = await loadWeeklySeries();
    const last = baseline.length - 1;

    const now = new Date();
    // 2 onboardings completados this week.
    await seedLead({ status: 'nuevo', objetivo: 'primer_hyrox', submitted: true, createdAt: now });
    const w2 = await seedLead({
      status: 'agendado',
      objetivo: 'podio',
      submitted: true,
      createdAt: now,
    });
    // 1 cita booked this week (appointment created_at = now).
    await seedAppointment(w2, 'aceptada', now);
    // 1 alta redeemed this week.
    await seedInvitation({ leadId: w2, athleteId, userId, coachId, redeemedAt: now });

    const after = await loadWeeklySeries();

    expect(after[last]!.onboardings - baseline[last]!.onboardings).toBe(2);
    expect(after[last]!.citas - baseline[last]!.citas).toBe(1);
    expect(after[last]!.altas - baseline[last]!.altas).toBe(1);
  });
});
