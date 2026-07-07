/**
 * Real-DB test for the 1:1 session report store (#14). No SQL mocked (Neon branch).
 * Covers: create for a lead (outcome + price), create for an athlete, follow-the-person
 * (a converted lead's sales call surfaces on the athlete card), edit, and soft-delete.
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import {
  createSessionReport,
  updateSessionReport,
  deleteSessionReport,
  listSessionReportsForLead,
  listSessionReportsForAthlete,
} from '@/lib/coach/session-reports';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

describeWithDb('session reports (#14, real DB)', () => {
  const sql = getTestSql();
  const emails: string[] = [];
  const coachIds: number[] = [];
  const leadIds: number[] = [];
  const athleteIds: number[] = [];
  const userIds: number[] = [];

  function email(tag: string) {
    const e = `sr-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
    emails.push(e);
    return e;
  }

  async function seedCoach(): Promise<number> {
    const u = await sql<{ id: string }[]>`insert into users (email, role) values (${email('coach')}, 'coach') returning id::text as id`;
    userIds.push(Number(u[0]!.id));
    const c = await sql<{ id: string }[]>`insert into coaches (user_id, full_name) values (${Number(u[0]!.id)}, 'SR Coach') returning id::text as id`;
    coachIds.push(Number(c[0]!.id));
    return Number(c[0]!.id);
  }
  async function seedLead(convertedAthleteId?: number): Promise<number> {
    const r = await sql<{ id: string }[]>`
      insert into leads (email, nombre, status, source, converted_athlete_id)
      values (${email('lead')}, 'SR Lead', 'agendado', 'onboarding_web', ${convertedAthleteId ?? null})
      returning id::text as id`;
    leadIds.push(Number(r[0]!.id));
    return Number(r[0]!.id);
  }
  async function seedAthlete(coachId: number): Promise<number> {
    const u = await sql<{ id: string }[]>`insert into users (email, role) values (${email('ath')}, 'athlete') returning id::text as id`;
    userIds.push(Number(u[0]!.id));
    const a = await sql<{ id: string }[]>`insert into athletes (user_id, full_name, coach_id) values (${Number(u[0]!.id)}, 'SR Ath', ${coachId}) returning id::text as id`;
    athleteIds.push(Number(a[0]!.id));
    return Number(a[0]!.id);
  }

  beforeAll(async () => { await sql`select 1 as ok`; });
  afterEach(async () => {
    if (leadIds.length) await sql`delete from session_reports where lead_id in ${sql(leadIds)}`;
    if (athleteIds.length) await sql`delete from session_reports where athlete_id in ${sql(athleteIds)}`;
    if (leadIds.length) await sql`delete from leads where id in ${sql(leadIds)}`;
    if (athleteIds.length) await sql`delete from athletes where id in ${sql(athleteIds)}`;
    if (coachIds.length) await sql`delete from coaches where id in ${sql(coachIds)}`;
    if (userIds.length) await sql`delete from users where id in ${sql(userIds)}`;
    emails.length = coachIds.length = leadIds.length = athleteIds.length = userIds.length = 0;
  });
  afterAll(async () => { await closeTestSql(); });

  test('lead sales call: create with outcome + price, appears in lead history', async () => {
    const coachId = await seedCoach();
    const leadId = await seedLead();
    const rep = await createSessionReport({
      coach_id: coachId,
      input: {
        lead_id: leadId,
        notes: 'Hablamos de sus objetivos HYROX.',
        next_steps: 'Mando el alta hoy.',
        outcome: 'quiere_empezar',
        quoted_price_eur: 120,
      },
    });
    expect(rep.outcome).toBe('quiere_empezar');
    expect(rep.quoted_price_eur).toBe(120);
    expect(rep.from_lead).toBe(true);

    const hist = await listSessionReportsForLead(BigInt(leadId));
    expect(hist).toHaveLength(1);
    expect(hist[0]!.notes).toContain('HYROX');
  });

  test('athlete 1:1: create without sales fields, appears in athlete history', async () => {
    const coachId = await seedCoach();
    const athId = await seedAthlete(coachId);
    await createSessionReport({
      coach_id: coachId,
      input: { athlete_id: athId, notes: 'Revisamos la semana.', next_steps: 'Subir volumen de carrera.' },
    });
    const hist = await listSessionReportsForAthlete(BigInt(athId));
    expect(hist).toHaveLength(1);
    expect(hist[0]!.outcome).toBeNull();
    expect(hist[0]!.from_lead).toBe(false);
  });

  test('follow-the-person: a converted lead sales call surfaces on the athlete card', async () => {
    const coachId = await seedCoach();
    const athId = await seedAthlete(coachId);
    const leadId = await seedLead(athId); // lead already converted into this athlete
    await createSessionReport({ coach_id: coachId, input: { lead_id: leadId, outcome: 'quiere_empezar', quoted_price_eur: 99, notes: 'Llamada de venta.' } });
    await createSessionReport({ coach_id: coachId, input: { athlete_id: athId, notes: 'Primer 1:1 tras el alta.' } });

    const hist = await listSessionReportsForAthlete(BigInt(athId));
    expect(hist).toHaveLength(2); // the sales call (via lead) + the athlete 1:1
    expect(hist.some((h) => h.from_lead && h.quoted_price_eur === 99)).toBe(true);
  });

  test('edit + soft-delete', async () => {
    const coachId = await seedCoach();
    const leadId = await seedLead();
    const rep = await createSessionReport({ coach_id: coachId, input: { lead_id: leadId, outcome: 'pensandoselo', notes: 'A' } });

    const upd = await updateSessionReport({ id: BigInt(rep.id), coach_id: coachId, input: { outcome: 'quiere_empezar', notes: 'B' } });
    expect(upd.outcome).toBe('quiere_empezar');
    expect(upd.notes).toBe('B');

    await deleteSessionReport({ id: BigInt(rep.id), coach_id: coachId });
    const hist = await listSessionReportsForLead(BigInt(leadId));
    expect(hist).toHaveLength(0);
  });
});
