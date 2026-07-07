/**
 * Real-DB test for auto-accept booking (#2/#4 redesign). A reservation is the confirmed
 * cita: bookAppointment creates it `aceptada` and advances the lead to `agendado`, with no
 * coach approval step. Also proves the race guard: two leads hitting the SAME hueco
 * concurrently → exactly one wins (per-slot advisory lock + transactional overlap re-check).
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { bookAppointment, computeSlots, CitasError } from '@/lib/citas/store';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

describeWithDb('auto-accept booking (real DB)', () => {
  const sql = getTestSql();
  const leadIds: number[] = [];
  const availIds: number[] = [];
  const emails: string[] = [];

  async function seedLead(): Promise<{ id: number; token: string }> {
    const email = `qa-book-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
    emails.push(email);
    const token = `bk-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const r = await sql<{ id: string }[]>`
      insert into leads (email, nombre, token, status, source)
      values (${email}, 'QA Book', ${token}, 'nuevo', 'onboarding_web')
      returning id::text as id`;
    const id = Number(r[0]!.id);
    leadIds.push(id);
    return { id, token };
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
    // Broad availability every weekday 08:00–20:00 so slots are offered in the next 14 days.
    // weekday 0=Sun … 6=Sat (coach_availability check constraint).
    for (let wd = 0; wd <= 6; wd++) {
      const r = await sql<{ id: string }[]>`
        insert into coach_availability (weekday, start_time, end_time, activo)
        values (${wd}, '08:00', '20:00', true) returning id::text as id`;
      availIds.push(Number(r[0]!.id));
    }
  });

  afterEach(async () => {
    if (leadIds.length) {
      await sql`delete from appointments where lead_id in ${sql(leadIds)}`;
      await sql`delete from leads where id in ${sql(leadIds)}`;
    }
    leadIds.length = 0;
    emails.length = 0;
  });

  afterAll(async () => {
    if (availIds.length) await sql`delete from coach_availability where id in ${sql(availIds)}`;
    await closeTestSql();
  });

  async function firstOfferedSlotIso(now: Date): Promise<string> {
    // computeSlots already excludes busy/blocked, so every slot in DaySlots.slots is offered.
    const days = await computeSlots(now);
    for (const d of days) {
      if (d.slots.length > 0) return d.slots[0]!.start;
    }
    throw new Error('no offered slot — availability seed failed');
  }

  test('booking creates an ACCEPTED cita and advances the lead to agendado', async () => {
    const now = new Date();
    const lead = await seedLead();
    const startIso = await firstOfferedSlotIso(now);

    const res = await bookAppointment({ token: lead.token, startIso, now });
    expect(res.appointment.status).toBe('aceptada');

    const appt = await sql<{ status: string }[]>`select status::text as status from appointments where id = ${Number(res.appointment.id)}`;
    expect(appt[0]!.status).toBe('aceptada');
    const l = await sql<{ status: string }[]>`select status::text as status from leads where id = ${lead.id}`;
    expect(l[0]!.status).toBe('agendado');
  });

  test('race: two leads booking the SAME slot → exactly one wins', async () => {
    const now = new Date();
    const a = await seedLead();
    const b = await seedLead();
    const startIso = await firstOfferedSlotIso(now);

    const results = await Promise.allSettled([
      bookAppointment({ token: a.token, startIso, now }),
      bookAppointment({ token: b.token, startIso, now }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser failed with a clean CitasError (slot taken), not a raw crash.
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(CitasError);

    // Exactly one ACTIVE appointment sits on that slot.
    const active = await sql<{ n: number }[]>`
      select count(*)::int as n from appointments
      where requested_start = ${startIso}::timestamptz and status in ('pendiente', 'aceptada')`;
    expect(active[0]!.n).toBe(1);
  });
});
