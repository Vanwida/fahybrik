/**
 * Real-DB closed-loop test for the lead alta (#5). No SQL mocked (Neon test branch).
 *
 * Verifies the whole loop: altaLeadAsAthlete creates the athlete carrying the lead's
 * onboarding (sex, dob, days/week, level, coach notes), mints a claim invite stamped
 * with the lead, marks the alta sent WITHOUT converting the lead — and only when the
 * invite is REDEEMED does the lead flip to `convertido` + point at the athlete.
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { altaLeadAsAthlete, AltaError } from '@/lib/leads/alta';
import { redeemAthleteInvitation } from '@/lib/athlete/invitations';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

describeWithDb('lead alta → athlete (real DB, closed loop)', () => {
  const sql = getTestSql();
  const emails: string[] = [];
  const coachIds: number[] = [];
  const coachUserIds: number[] = [];
  const leadIds: number[] = [];

  function uniqueEmail(tag: string): string {
    const e = `alta-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
    emails.push(e);
    return e;
  }

  async function seedCoach(): Promise<{ coachId: number; levelId: number }> {
    const cu = await sql<Array<{ id: string }>>`
      insert into users (email, role) values (${uniqueEmail('coach')}, 'coach') returning id::text as id
    `;
    const coachUserId = Number(cu[0]!.id);
    coachUserIds.push(coachUserId);
    const c = await sql<Array<{ id: string }>>`
      insert into coaches (user_id, full_name) values (${coachUserId}, 'Alta Coach') returning id::text as id
    `;
    const coachId = Number(c[0]!.id);
    coachIds.push(coachId);
    const lvl = await sql<Array<{ id: string }>>`
      insert into athlete_levels (coach_id, name, label, sort_order)
      values (${coachId}, 'N2', 'Desarrollo', 2) returning id::text as id
    `;
    return { coachId, levelId: Number(lvl[0]!.id) };
  }

  async function seedLead(email: string, status: string): Promise<number> {
    const r = await sql<Array<{ id: string }>>`
      insert into leads (email, nombre, nivel, sexo, edad, dias_semana, dobles_pareja, objetivo, nota_libre, status, source)
      values (${email}, 'Marc Test', 'intermedio', 'hombre', 30, 'd3_4', 'si_plan_compartido',
              'mejorar_marca', 'quiere bajar de 1:20', ${status}::lead_status, 'onboarding_web')
      returning id::text as id
    `;
    const id = Number(r[0]!.id);
    leadIds.push(id);
    return id;
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });

  afterEach(async () => {
    // FK-safe teardown of everything these tests touch, keyed by the test emails/ids.
    if (emails.length) {
      const users = await sql<Array<{ id: string }>>`select id::text as id from users where email in ${sql(emails)}`;
      const uids = users.map((u) => BigInt(u.id));
      if (uids.length) {
        const aths = await sql<Array<{ id: string }>>`select id::text as id from athletes where user_id in ${sql(uids)}`;
        const aids = aths.map((a) => BigInt(a.id));
        if (aids.length) {
          await sql`delete from athlete_invitations where athlete_id in ${sql(aids)}`;
          await sql`delete from athletes where id in ${sql(aids)}`;
        }
        await sql`delete from subscriptions where user_id in ${sql(uids)}`;
      }
    }
    if (leadIds.length) {
      await sql`delete from athlete_invitations where lead_id in ${sql(leadIds)}`;
      await sql`delete from leads where id in ${sql(leadIds)}`;
    }
    if (coachIds.length) await sql`delete from athlete_levels where coach_id in ${sql(coachIds)}`;
    if (coachIds.length) await sql`delete from coaches where id in ${sql(coachIds)}`;
    if (emails.length) await sql`delete from users where email in ${sql(emails)}`;
    emails.length = 0;
    coachIds.length = 0;
    coachUserIds.length = 0;
    leadIds.length = 0;
  });

  afterAll(async () => {
    await closeTestSql();
  });

  test('alta carries the onboarding data, stamps the invite with the lead, and does NOT convert until redeem', async () => {
    const { coachId, levelId } = await seedCoach();
    const athleteEmail = uniqueEmail('athlete');
    const leadId = await seedLead(athleteEmail, 'agendado');

    const res = await altaLeadAsAthlete({
      lead_id: BigInt(leadId),
      coach_id: BigInt(coachId),
      input: {
        full_name: 'Marc Test',
        email: athleteEmail,
        edad: 30,
        sex: 'male',
        training_days_per_week: 4,
        level_id: levelId,
        modality: 'dobles',
        notes: 'Interesado en DOBLES con pareja — quiere plan compartido.',
      },
    });

    // Athlete created with the carried profile.
    const ath = await sql<
      Array<{
        id: string;
        sex: string | null;
        dob: string | null;
        training_days_per_week: number | null;
        level_id: string | null;
        level_source: string | null;
        intake_notes_json: Record<string, unknown>;
      }>
    >`
      select id::text as id, sex, dob::text as dob, training_days_per_week,
             level_id::text as level_id, level_source, intake_notes_json
      from athletes where id = ${Number(res.athlete_id)}
    `;
    expect(ath).toHaveLength(1);
    expect(ath[0]!.sex).toBe('male');
    expect(ath[0]!.training_days_per_week).toBe(4);
    expect(ath[0]!.level_id).toBe(String(levelId));
    expect(ath[0]!.level_source).toBe('self_reported');
    expect(ath[0]!.dob).toMatch(/^\d{4}-01-01$/); // edad → approximate Jan-1 dob
    expect(String((ath[0]!.intake_notes_json as { alta_notes?: string }).alta_notes)).toContain('DOBLES');

    // Lead: alta stamped, but NOT converted yet.
    const beforeRedeem = await sql<Array<{ status: string; alta_sent_at: string | null; converted: string | null }>>`
      select status::text as status, alta_sent_at::text as alta_sent_at, converted_athlete_id::text as converted
      from leads where id = ${leadId}
    `;
    expect(beforeRedeem[0]!.status).toBe('agendado');
    expect(beforeRedeem[0]!.alta_sent_at).not.toBeNull();
    expect(beforeRedeem[0]!.converted).toBeNull();

    // Invite is pending and stamped with the lead.
    const inv = await sql<Array<{ status: string; lead_id: string }>>`
      select status, lead_id::text as lead_id from athlete_invitations where lead_id = ${leadId}
    `;
    expect(inv).toHaveLength(1);
    expect(inv[0]!.status).toBe('pending');

    // Redeem the invite (the athlete claims via Apple) → the loop closes.
    const token = res.invite_url.split('/invite/')[1]!;
    const redeem = await redeemAthleteInvitation({
      token,
      apple_identity: { apple_user_id: `apple_alta_${Date.now()}` },
    });
    expect(redeem.ok).toBe(true);

    const afterRedeem = await sql<Array<{ status: string; converted: string | null }>>`
      select status::text as status, converted_athlete_id::text as converted from leads where id = ${leadId}
    `;
    expect(afterRedeem[0]!.status).toBe('convertido');
    expect(afterRedeem[0]!.converted).toBe(res.athlete_id);
  });

  test('alta on a convertido / descartado lead is rejected', async () => {
    const { coachId } = await seedCoach();
    const leadId = await seedLead(uniqueEmail('done'), 'convertido');

    await expect(
      altaLeadAsAthlete({
        lead_id: BigInt(leadId),
        coach_id: BigInt(coachId),
        input: { full_name: 'X', email: uniqueEmail('x2'), modality: 'individual' },
      }),
    ).rejects.toBeInstanceOf(AltaError);
  });
});
