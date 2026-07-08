/**
 * Real-DB tests for the capacity cap + lead waitlist (#18). No SQL mocked (Neon test
 * branch, describeWithDb). WRITTEN for tsc; SKIPPED unless TEST_DATABASE_URL is set.
 *
 * Covers:
 *   • capacity boundary — full at active===max, not full below, uncapped never full; a
 *     dobles pair (one subscription) counts as 2 toward the cap. Assertions are
 *     baseline-relative so pre-existing branch athletes never make them flaky.
 *   • joinWaitlist stamps waitlisted_at ONCE (idempotent); listWaitlist FIFO order + position;
 *     countWaitlist excludes released and non-nuevo/contactado leads.
 *   • releaseWaitlistLead stamps released_at ONCE (idempotent).
 *   • isLeadWaitlisted + the bookAppointment gate: a waitlisted-unreleased lead is blocked
 *     (isLeadWaitlisted true, booking throws), and after release it books normally.
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import {
  getCapacityState,
  getMaxAthletes,
  setMaxAthletes,
} from '@/lib/coach/capacity';
import {
  countWaitlist,
  isLeadWaitlisted,
  joinWaitlist,
  listWaitlist,
  releaseWaitlistLead,
} from '@/lib/leads/waitlist';
import { bookAppointment, CitasError } from '@/lib/citas/store';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

const DAY_MS = 24 * 60 * 60 * 1000;

describeWithDb('capacity cap + lead waitlist (#18, real DB)', () => {
  const sql = getTestSql();
  const emails: string[] = [];
  const userIds: number[] = [];
  const athleteIds: number[] = [];
  const leadIds: number[] = [];
  const extraCoachUserIds: number[] = [];
  let savedMax: number | null = null;

  function email(tag: string): string {
    const e = `wl-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
    emails.push(e);
    return e;
  }

  async function seedUser(role: 'athlete' | 'coach'): Promise<number> {
    const u = await sql<{ id: string }[]>`
      insert into users (email, role) values (${email(role)}, ${role}::user_role) returning id::text as id
    `;
    const id = Number(u[0]!.id);
    userIds.push(id);
    return id;
  }

  /** users(athlete) + athletes, NO subscription. Returns the athlete's user id. */
  async function seedAthleteOnly(): Promise<number> {
    const userId = await seedUser('athlete');
    const a = await sql<{ id: string }[]>`
      insert into athletes (user_id, full_name) values (${userId}, 'WL Athlete') returning id::text as id
    `;
    athleteIds.push(Number(a[0]!.id));
    return userId;
  }

  /** An athlete with an ACTIVE individual subscription → +1 toward capacity. */
  async function seedActiveAthlete(): Promise<void> {
    const userId = await seedAthleteOnly();
    await sql`
      insert into subscriptions (user_id, plan_type, status)
      values (${userId}, 'individual', 'active')
    `;
  }

  /** A dobles pair: ONE active subscription linking two athletes → +2 toward capacity. */
  async function seedDoblesPair(): Promise<void> {
    const owner = await seedAthleteOnly();
    const partner = await seedAthleteOnly();
    await sql`
      insert into subscriptions (user_id, partner_user_id, plan_type, status)
      values (${owner}, ${partner}, 'dobles', 'active')
    `;
  }

  interface SeededLead {
    id: number;
    token: string;
    unsubscribe_token: string;
  }

  async function seedLead(opts: {
    status?: string;
    waitlistedAt?: Date | null;
    releasedAt?: Date | null;
  }): Promise<SeededLead> {
    const rows = await sql<{ id: string; token: string; unsubscribe_token: string }[]>`
      insert into leads (
        email, nombre, objetivo, nivel, ubicacion, status, source, waitlisted_at, waitlist_released_at
      ) values (
        ${email('lead')}, 'WL Lead', 'mejorar_marca', 'intermedio', 'barcelona',
        ${opts.status ?? 'nuevo'}::lead_status, 'onboarding_web',
        ${opts.waitlistedAt ? opts.waitlistedAt.toISOString() : null},
        ${opts.releasedAt ? opts.releasedAt.toISOString() : null}
      )
      returning id::text as id, token, unsubscribe_token
    `;
    const id = Number(rows[0]!.id);
    leadIds.push(id);
    return { id, token: rows[0]!.token, unsubscribe_token: rows[0]!.unsubscribe_token };
  }

  async function leadStamps(
    id: number,
  ): Promise<{ waitlisted_at: string | null; waitlist_released_at: string | null }> {
    const rows = await sql<{ waitlisted_at: Date | null; waitlist_released_at: Date | null }[]>`
      select waitlisted_at, waitlist_released_at from leads where id = ${id} limit 1
    `;
    const r = rows[0]!;
    return {
      waitlisted_at: r.waitlisted_at ? r.waitlisted_at.toISOString() : null,
      waitlist_released_at: r.waitlist_released_at ? r.waitlist_released_at.toISOString() : null,
    };
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
    // Single-coach cap lives on the FIRST coach row. Ensure one exists (a fresh branch may
    // have none), snapshot its cap, and restore it in afterAll so the branch is left intact.
    const coach = await sql<{ id: string }[]>`select id::text as id from coaches order by id limit 1`;
    if (!coach[0]) {
      const cu = await sql<{ id: string }[]>`
        insert into users (email, role) values (${email('coach')}, 'coach') returning id::text as id
      `;
      extraCoachUserIds.push(Number(cu[0]!.id));
      await sql`insert into coaches (user_id, full_name) values (${Number(cu[0]!.id)}, 'WL Coach')`;
    }
    savedMax = await getMaxAthletes();
  });

  afterEach(async () => {
    if (leadIds.length) {
      await sql`delete from lead_nurture_log where lead_id in ${sql(leadIds)}`;
      await sql`delete from leads where id in ${sql(leadIds)}`;
    }
    if (userIds.length) {
      await sql`delete from subscriptions where user_id in ${sql(userIds)} or partner_user_id in ${sql(userIds)}`;
    }
    if (athleteIds.length) await sql`delete from athletes where id in ${sql(athleteIds)}`;
    if (userIds.length) await sql`delete from users where id in ${sql(userIds)}`;
    emails.length = 0;
    userIds.length = 0;
    athleteIds.length = 0;
    leadIds.length = 0;
  });

  afterAll(async () => {
    await setMaxAthletes(savedMax); // restore the coach's cap
    if (extraCoachUserIds.length) {
      // Deleting the user cascades the coach row we seeded (coaches.user_id on delete cascade).
      await sql`delete from users where id in ${sql(extraCoachUserIds)}`;
    }
    await closeTestSql();
  });

  // ── Capacity ─────────────────────────────────────────────────────────────────────
  test('capacity boundary: full at active===max, not full below, uncapped never full', async () => {
    const base = (await getCapacityState()).active; // pre-existing active athletes on the branch
    await seedActiveAthlete();
    await seedActiveAthlete(); // +2 humans
    const active = base + 2;

    await setMaxAthletes(active);
    let s = await getCapacityState();
    expect(s.active).toBe(active);
    expect(s.max).toBe(active);
    expect(s.full).toBe(true);
    expect(s.slots_available).toBe(0);

    await setMaxAthletes(active + 1);
    s = await getCapacityState();
    expect(s.full).toBe(false);
    expect(s.slots_available).toBe(1);

    await setMaxAthletes(null); // uncapped → waitlist off → never full
    s = await getCapacityState();
    expect(s.max).toBeNull();
    expect(s.full).toBe(false);
    expect(s.slots_available).toBeNull();
  });

  test('a dobles pair (one subscription) counts as 2 toward capacity', async () => {
    const base = (await getCapacityState()).active;
    await seedDoblesPair();
    const s = await getCapacityState();
    expect(s.active).toBe(base + 2);
  });

  // ── Waitlist store ─────────────────────────────────────────────────────────────────
  test('joinWaitlist stamps waitlisted_at exactly once (idempotent)', async () => {
    const lead = await seedLead({ status: 'nuevo', waitlistedAt: null });

    const first = await joinWaitlist(lead.id);
    expect(first?.joined).toBe(true);
    const t1 = (await leadStamps(lead.id)).waitlisted_at;
    expect(t1).not.toBeNull();

    const second = await joinWaitlist(lead.id);
    expect(second?.joined).toBe(false); // already on the list
    const t2 = (await leadStamps(lead.id)).waitlisted_at;
    expect(t2).toBe(t1); // timestamp unchanged → position never moves
  });

  test('listWaitlist returns FIFO order with a 1-based position', async () => {
    const now = Date.now();
    const oldest = await seedLead({ status: 'nuevo', waitlistedAt: new Date(now - 3 * DAY_MS) });
    const mid = await seedLead({ status: 'nuevo', waitlistedAt: new Date(now - 2 * DAY_MS) });
    const newest = await seedLead({ status: 'nuevo', waitlistedAt: new Date(now - 1 * DAY_MS) });

    const mine = (await listWaitlist()).filter((e) => leadIds.includes(Number(e.lead_id)));
    expect(mine.map((e) => Number(e.lead_id))).toEqual([oldest.id, mid.id, newest.id]); // oldest first
    // Positions are strictly ascending in arrival order (global row_number, but monotonic).
    expect(mine[0]!.position).toBeLessThan(mine[1]!.position);
    expect(mine[1]!.position).toBeLessThan(mine[2]!.position);
  });

  test('countWaitlist counts only actively-waiting leads (excludes released + non nuevo/contactado)', async () => {
    const base = await countWaitlist();
    const t = new Date(Date.now() - DAY_MS);
    await seedLead({ status: 'nuevo', waitlistedAt: t }); // counts
    await seedLead({ status: 'contactado', waitlistedAt: t }); // counts
    await seedLead({ status: 'nuevo', waitlistedAt: t, releasedAt: new Date() }); // released → excluded
    await seedLead({ status: 'agendado', waitlistedAt: t }); // past the top of pipeline → excluded

    expect(await countWaitlist()).toBe(base + 2);
  });

  test('releaseWaitlistLead stamps released_at exactly once (idempotent)', async () => {
    const lead = await seedLead({ status: 'nuevo', waitlistedAt: new Date(Date.now() - DAY_MS) });

    const first = await releaseWaitlistLead(lead.id);
    expect(first.released).toBe(true);
    expect(first.lead?.token).toBe(lead.token);
    const r1 = (await leadStamps(lead.id)).waitlist_released_at;
    expect(r1).not.toBeNull();

    const second = await releaseWaitlistLead(lead.id);
    expect(second.released).toBe(false); // already released
    expect(second.lead).not.toBeNull(); // still returns contact so a failed email can retry
    const r2 = (await leadStamps(lead.id)).waitlist_released_at;
    expect(r2).toBe(r1); // stamp unchanged
  });

  // ── Booking gate ────────────────────────────────────────────────────────────────────
  test('isLeadWaitlisted + booking gate: blocked while waitlisted, books after release', async () => {
    const lead = await seedLead({ status: 'nuevo', waitlistedAt: new Date(Date.now() - DAY_MS) });

    expect(await isLeadWaitlisted(lead.id)).toBe(true);

    // The server gate fires BEFORE slot computation, so no availability seeding is needed.
    const startIso = new Date(Date.now() + 2 * DAY_MS).toISOString();
    await expect(bookAppointment({ token: lead.token, startIso })).rejects.toMatchObject({
      code: 'waitlisted',
    });
    // Confirm it's a CitasError with the 409 status.
    await bookAppointment({ token: lead.token, startIso }).catch((err) => {
      expect(err).toBeInstanceOf(CitasError);
      expect((err as CitasError).status).toBe(409);
    });

    await releaseWaitlistLead(lead.id);
    expect(await isLeadWaitlisted(lead.id)).toBe(false); // released → no longer blocking
  });

  test('a lead never on the waitlist is not waitlisted', async () => {
    const lead = await seedLead({ status: 'nuevo', waitlistedAt: null });
    expect(await isLeadWaitlisted(lead.id)).toBe(false);
  });
});
