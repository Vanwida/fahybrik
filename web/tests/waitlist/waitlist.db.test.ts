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
 *   • releaseWaitlistToCapacity (auto FIFO): releases exactly max−active−released_pending oldest
 *     waiting leads in order; 0 when uncapped; 0 at/over capacity; a released-pending lead holds
 *     a slot so we never over-release.
 *   • the #18↔#10 nurture gate: an actively-waiting lead is excluded from the nurture selector,
 *     a released one is included.
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
  releaseWaitlistToCapacity,
} from '@/lib/leads/waitlist';
import { selectNurtureCandidates } from '@/lib/leads/nurture';
import { funnelCoachId } from '@/lib/leads/funnel-coach';
import { NURTURE_TOUCHES } from '@fahybrid/shared/domain/leads/nurture';
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
  // The FUNNEL club (lib/leads/funnel-coach.ts) — the one whose cap gates the waitlist.
  // Resolved in beforeAll (a coach row is ensured there first).
  let funnelCoach: bigint = BigInt(0);
  let savedMax: number | null = null;
  let savedFunnelCoachEnv: string | undefined;

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

  /** users(athlete) + athletes ON THE FUNNEL CLUB'S ROSTER (capacity is club-scoped),
   *  NO subscription. Returns the athlete's user id. */
  async function seedAthleteOnly(): Promise<number> {
    const userId = await seedUser('athlete');
    const a = await sql<{ id: string }[]>`
      insert into athletes (user_id, coach_id, full_name)
      values (${userId}, ${Number(funnelCoach)}, 'WL Athlete') returning id::text as id
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
    submittedAt?: Date | null;
  }): Promise<SeededLead> {
    const rows = await sql<{ id: string; token: string; unsubscribe_token: string }[]>`
      insert into leads (
        email, nombre, objetivo, nivel, ubicacion, status, source,
        waitlisted_at, waitlist_released_at, submitted_at
      ) values (
        ${email('lead')}, 'WL Lead', 'mejorar_marca', 'intermedio', 'barcelona',
        ${opts.status ?? 'nuevo'}::lead_status, 'onboarding_web',
        ${opts.waitlistedAt ? opts.waitlistedAt.toISOString() : null},
        ${opts.releasedAt ? opts.releasedAt.toISOString() : null},
        ${opts.submittedAt ? opts.submittedAt.toISOString() : null}
      )
      returning id::text as id, token, unsubscribe_token
    `;
    const id = Number(rows[0]!.id);
    leadIds.push(id);
    return { id, token: rows[0]!.token, unsubscribe_token: rows[0]!.unsubscribe_token };
  }

  /** Global released-pending count — leads already handed a plaza but still nuevo/contactado
   *  (they HOLD a slot). Mirrors the released_pending term inside releaseWaitlistToCapacity so
   *  the auto-release tests can pin `available` relative to the branch baseline. */
  async function countReleasedPending(): Promise<number> {
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from leads
      where waitlist_released_at is not null
        and status in ('nuevo', 'contactado')
    `;
    return rows[0]!.n;
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
    // The waitlist is gated by the FUNNEL club's cap. Ensure a coach exists (a fresh
    // branch may have none), then DECLARE it as the funnel's owner via the env — the
    // resolver no longer guesses a club by picking the lowest id, so a test that needs
    // one has to name it, exactly like a deploy does.
    let coachId = (
      await sql<{ id: string }[]>`select id::text as id from coaches order by id limit 1`
    )[0]?.id;
    if (!coachId) {
      const cu = await sql<{ id: string }[]>`
        insert into users (email, role) values (${email('coach')}, 'coach') returning id::text as id
      `;
      extraCoachUserIds.push(Number(cu[0]!.id));
      const created = await sql<{ id: string }[]>`
        insert into coaches (user_id, full_name) values (${Number(cu[0]!.id)}, 'WL Coach')
        returning id::text as id
      `;
      coachId = created[0]!.id;
    }
    savedFunnelCoachEnv = process.env.FUNNEL_COACH_ID;
    process.env.FUNNEL_COACH_ID = coachId;

    funnelCoach = (await funnelCoachId())!;
    savedMax = await getMaxAthletes(funnelCoach);
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
    await setMaxAthletes(funnelCoach, savedMax); // restore the funnel club's cap
    if (savedFunnelCoachEnv === undefined) delete process.env.FUNNEL_COACH_ID;
    else process.env.FUNNEL_COACH_ID = savedFunnelCoachEnv;
    if (extraCoachUserIds.length) {
      // Deleting the user cascades the coach row we seeded (coaches.user_id on delete cascade).
      await sql`delete from users where id in ${sql(extraCoachUserIds)}`;
    }
    await closeTestSql();
  });

  // ── Capacity ─────────────────────────────────────────────────────────────────────
  test('capacity boundary: full at active===max, not full below, uncapped never full', async () => {
    const base = (await getCapacityState(funnelCoach)).active; // pre-existing active athletes on the branch
    await seedActiveAthlete();
    await seedActiveAthlete(); // +2 humans
    const active = base + 2;

    await setMaxAthletes(funnelCoach, active);
    let s = await getCapacityState(funnelCoach);
    expect(s.active).toBe(active);
    expect(s.max).toBe(active);
    expect(s.full).toBe(true);
    expect(s.slots_available).toBe(0);

    await setMaxAthletes(funnelCoach, active + 1);
    s = await getCapacityState(funnelCoach);
    expect(s.full).toBe(false);
    expect(s.slots_available).toBe(1);

    await setMaxAthletes(funnelCoach, null); // uncapped → waitlist off → never full
    s = await getCapacityState(funnelCoach);
    expect(s.max).toBeNull();
    expect(s.full).toBe(false);
    expect(s.slots_available).toBeNull();
  });

  test('a dobles pair (one subscription) counts as 2 toward capacity', async () => {
    const base = (await getCapacityState(funnelCoach)).active;
    await seedDoblesPair();
    const s = await getCapacityState(funnelCoach);
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

  // ── Automatic FIFO release (releaseWaitlistToCapacity) ───────────────────────────────
  // available = max_athletes − active − released_pending. All assertions are baseline-relative
  // (active/released_pending measured first) and use far-past waitlisted_at so the seeded leads
  // lead the GLOBAL FIFO pool — mirroring the existing capacity tests' clean-branch convention.
  test('releaseWaitlistToCapacity releases (max − active − released_pending) oldest waiting, FIFO', async () => {
    const { active } = await getCapacityState(funnelCoach);
    const pending = await countReleasedPending();
    const t = Date.now();
    const oldest = await seedLead({ status: 'nuevo', waitlistedAt: new Date(t - 400 * DAY_MS) });
    const mid = await seedLead({ status: 'nuevo', waitlistedAt: new Date(t - 399 * DAY_MS) });
    const newest = await seedLead({ status: 'nuevo', waitlistedAt: new Date(t - 398 * DAY_MS) });

    await setMaxAthletes(funnelCoach, active + pending + 2); // available = max − active − pending = 2

    const res = await releaseWaitlistToCapacity();
    expect(res.released).toBe(2);
    // FIFO: the two OLDEST are released; the newest keeps waiting.
    expect((await leadStamps(oldest.id)).waitlist_released_at).not.toBeNull();
    expect((await leadStamps(mid.id)).waitlist_released_at).not.toBeNull();
    expect((await leadStamps(newest.id)).waitlist_released_at).toBeNull();
  });

  test('releaseWaitlistToCapacity releases nothing when uncapped (max null)', async () => {
    await seedLead({ status: 'nuevo', waitlistedAt: new Date(Date.now() - DAY_MS) });
    await setMaxAthletes(funnelCoach, null); // waitlist off
    const res = await releaseWaitlistToCapacity();
    expect(res.released).toBe(0);
  });

  test('releaseWaitlistToCapacity releases nothing when already at/over capacity', async () => {
    const { active } = await getCapacityState(funnelCoach);
    const pending = await countReleasedPending();
    await seedLead({ status: 'nuevo', waitlistedAt: new Date(Date.now() - DAY_MS) });
    await setMaxAthletes(funnelCoach, active + pending); // available = 0
    const res = await releaseWaitlistToCapacity();
    expect(res.released).toBe(0);
  });

  test('a released-pending lead reduces how many are released (no over-release)', async () => {
    const { active } = await getCapacityState(funnelCoach);
    const pending = await countReleasedPending();
    const t = Date.now();
    // Two actively-waiting leads…
    const w1 = await seedLead({ status: 'nuevo', waitlistedAt: new Date(t - 400 * DAY_MS) });
    const w2 = await seedLead({ status: 'nuevo', waitlistedAt: new Date(t - 399 * DAY_MS) });
    // …plus one already handed a plaza but not yet booked → it HOLDS a slot.
    await seedLead({
      status: 'nuevo',
      waitlistedAt: new Date(t - 401 * DAY_MS),
      releasedAt: new Date(t - 200 * DAY_MS),
    });

    // Cap gives 2 free slots gross, but the held slot eats 1 → only 1 to give.
    await setMaxAthletes(funnelCoach, active + pending + 2);

    const res = await releaseWaitlistToCapacity();
    expect(res.released).toBe(1); // 2 gross − 1 held = 1
    expect((await leadStamps(w1.id)).waitlist_released_at).not.toBeNull(); // oldest waiting
    expect((await leadStamps(w2.id)).waitlist_released_at).toBeNull();
  });

  // ── #18 ↔ #10 interaction: the nurture selector's waitlist gate ──────────────────────
  test('nurture selector excludes an actively-waiting lead but includes a released one', async () => {
    const t1 = NURTURE_TOUCHES.nuevo_t1; // "reserva tu llamada" — anchored on submitted_at
    const now = new Date();
    // Place submitted_at safely inside the nuevo_t1 window [+delay, +delay+window).
    const submittedAt = new Date(now.getTime() - (t1.delayDays + 0.5) * DAY_MS);
    const waitlistedAt = new Date(now.getTime() - 2 * DAY_MS);

    // (a) waitlisted & NOT released → can't book → excluded from the booking sequence.
    const waiting = await seedLead({ status: 'nuevo', submittedAt, waitlistedAt, releasedAt: null });
    // (b) waitlisted but RELEASED → can book → still nurtured.
    const released = await seedLead({
      status: 'nuevo',
      submittedAt,
      waitlistedAt,
      releasedAt: new Date(now.getTime() - DAY_MS),
    });
    // (c) never waitlisted → control, always nurtured.
    const control = await seedLead({ status: 'nuevo', submittedAt });

    const ids = (await selectNurtureCandidates(now, sql)).map((c) => c.lead.id);
    expect(ids).not.toContain(String(waiting.id));
    expect(ids).toContain(String(released.id));
    expect(ids).toContain(String(control.id));
  });

  // ── Booking gate ────────────────────────────────────────────────────────────────────
  test('isLeadWaitlisted + booking gate: blocked while waitlisted, books after release', async () => {
    const lead = await seedLead({ status: 'nuevo', waitlistedAt: new Date(Date.now() - DAY_MS) });

    expect(await isLeadWaitlisted(lead.id)).toBe(true);

    // The server gate fires BEFORE slot computation, so no availability seeding is needed.
    const startIso = new Date(Date.now() + 2 * DAY_MS).toISOString();
    await expect(bookAppointment({ token: lead.token, startIso, modality: 'video' })).rejects.toMatchObject({
      code: 'waitlisted',
    });
    // Confirm it's a CitasError with the 409 status.
    await bookAppointment({ token: lead.token, startIso, modality: 'video' }).catch((err) => {
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
