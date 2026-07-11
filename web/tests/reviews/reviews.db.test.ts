/**
 * Real-DB test for the recurring 1:1 review store (#21). No SQL mocked (Neon branch).
 * Requires migration 0107 applied. Covers:
 *   • proposeReview inserts a notification and is anti-spam (recent proposal → no dup);
 *   • bookAthleteReview creates a kind='revision' aceptada appointment and the
 *     one-active-per-athlete index blocks a second booking;
 *   • getAthleteReviewState computes `due` correctly at the mensual cadence boundary,
 *     and an upcoming booked review clears it;
 *   • a PAUSED athlete (#13) is excluded from the signal batch → never gets the due signal.
 *
 * WRITE, do NOT run (TCP egress is blocked; Alex runs the suite against a branch).
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import {
  proposeReview,
  bookAthleteReview,
  getAthleteReviewState,
} from '@/lib/citas/reviews';
import { computeSlots, CitasError } from '@/lib/citas/store';
import { loadBatch } from '@/lib/coach/attention/recompute-batch';
import type { ReviewCadence } from '@fahybrid/shared/domain/coach/reviews';
import type { AthleteLifecycleStatus } from '@fahybrid/shared/domain/coach/athlete-lifecycle';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

const DAY_MS = 86_400_000;

describeWithDb('recurring 1:1 reviews (#21, real DB)', () => {
  const sql = getTestSql();
  const emails: string[] = [];
  const coachIds: number[] = [];
  const athleteIds: number[] = [];
  const userIds: number[] = [];
  const availIds: number[] = [];

  function email(tag: string) {
    const e = `rev-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
    emails.push(e);
    return e;
  }

  async function seedCoach(): Promise<number> {
    const u = await sql<{ id: string }[]>`insert into users (email, role) values (${email('coach')}, 'coach') returning id::text as id`;
    userIds.push(Number(u[0]!.id));
    const c = await sql<{ id: string }[]>`insert into coaches (user_id, full_name) values (${Number(u[0]!.id)}, 'Rev Coach') returning id::text as id`;
    coachIds.push(Number(c[0]!.id));
    return Number(c[0]!.id);
  }

  async function seedAthlete(
    coachId: number,
    opts: { review_cadence?: ReviewCadence; lifecycle_status?: AthleteLifecycleStatus } = {},
  ): Promise<{ athlete_id: number; user_id: number }> {
    const u = await sql<{ id: string }[]>`insert into users (email, role) values (${email('ath')}, 'athlete') returning id::text as id`;
    const userId = Number(u[0]!.id);
    userIds.push(userId);
    const a = await sql<{ id: string }[]>`
      insert into athletes (user_id, full_name, coach_id, review_cadence, lifecycle_status)
      values (${userId}, 'Rev Ath', ${coachId}, ${opts.review_cadence ?? 'ninguna'}, ${opts.lifecycle_status ?? 'activo'})
      returning id::text as id`;
    const athleteId = Number(a[0]!.id);
    athleteIds.push(athleteId);
    return { athlete_id: athleteId, user_id: userId };
  }

  /** Offered slot start ISOs (already excludes busy/blocked). */
  async function offeredSlots(now: Date): Promise<string[]> {
    const days = await computeSlots('video', now);
    return days.flatMap((d) => d.slots.map((s) => s.start));
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
    // Broad availability every weekday 08:00–20:00 so slots are offered in the next 14 days.
    for (let wd = 0; wd <= 6; wd++) {
      const r = await sql<{ id: string }[]>`
        insert into coach_availability (weekday, start_time, end_time, activo)
        values (${wd}, '08:00', '20:00', true) returning id::text as id`;
      availIds.push(Number(r[0]!.id));
    }
  });

  afterEach(async () => {
    if (athleteIds.length) {
      await sql`delete from appointments where athlete_id in ${sql(athleteIds)}`;
      await sql`delete from session_reports where athlete_id in ${sql(athleteIds)}`;
    }
    if (userIds.length) await sql`delete from notifications where user_id in ${sql(userIds)}`;
    if (athleteIds.length) await sql`delete from athletes where id in ${sql(athleteIds)}`;
    if (coachIds.length) await sql`delete from coaches where id in ${sql(coachIds)}`;
    if (userIds.length) await sql`delete from users where id in ${sql(userIds)}`;
    emails.length = coachIds.length = athleteIds.length = userIds.length = 0;
  });

  afterAll(async () => {
    if (availIds.length) await sql`delete from coach_availability where id in ${sql(availIds)}`;
    await closeTestSql();
  });

  test('proposeReview inserts a notification and is anti-spam', async () => {
    const coachId = await seedCoach();
    const { athlete_id, user_id } = await seedAthlete(coachId);

    const r1 = await proposeReview({ coach_id: coachId, athlete_id });
    expect(r1.proposed).toBe(true);

    const notifs = await sql<{ id: string }[]>`
      select id::text as id from notifications
      where user_id = ${user_id} and type = 'system' and payload_json->>'kind' = 'review_proposed'`;
    expect(notifs).toHaveLength(1);

    // Second proposal within the dedupe window → no duplicate notification.
    const r2 = await proposeReview({ coach_id: coachId, athlete_id });
    expect(r2.proposed).toBe(false);
    expect(r2.reason).toBe('recent_proposal');

    const after = await sql<{ id: string }[]>`
      select id::text as id from notifications
      where user_id = ${user_id} and payload_json->>'kind' = 'review_proposed'`;
    expect(after).toHaveLength(1);
  });

  test('bookAthleteReview creates a revision aceptada + one-active guard blocks a second', async () => {
    const coachId = await seedCoach();
    const { athlete_id } = await seedAthlete(coachId);
    const now = new Date();
    const slots = await offeredSlots(now);
    expect(slots.length).toBeGreaterThan(1);

    const res = await bookAthleteReview({ athlete_id, requested_start: slots[0]!, now });
    expect(res.appointment.status).toBe('aceptada');

    const appt = await sql<{ kind: string; status: string; lead_id: string | null }[]>`
      select kind, status::text as status, lead_id::text as lead_id
      from appointments where id = ${Number(res.appointment.id)}`;
    expect(appt[0]!.kind).toBe('revision');
    expect(appt[0]!.status).toBe('aceptada');
    expect(appt[0]!.lead_id).toBeNull();

    // A second booking (different slot) is blocked by appointments_one_active_per_athlete.
    await expect(
      bookAthleteReview({ athlete_id, requested_start: slots[1]!, now }),
    ).rejects.toBeInstanceOf(CitasError);

    const active = await sql<{ n: number }[]>`
      select count(*)::int as n from appointments
      where athlete_id = ${athlete_id} and status in ('pendiente', 'aceptada')`;
    expect(active[0]!.n).toBe(1);
  });

  test('getAthleteReviewState computes due at the mensual cadence boundary', async () => {
    const coachId = await seedCoach();
    const { athlete_id } = await seedAthlete(coachId, { review_cadence: 'mensual' });

    // Last 1:1 review (athlete-subject session report) at a fixed instant.
    const occurred = new Date('2026-06-01T10:00:00.000Z');
    await sql`
      insert into session_reports (athlete_id, coach_id, occurred_at, duration_minutes, outcome)
      values (${athlete_id}, ${coachId}, ${occurred.toISOString()}, 30, 'seguimiento')`;

    // 31 days later (> 30) → due.
    const s31 = await getAthleteReviewState({
      athlete_id,
      now: new Date(occurred.getTime() + 31 * DAY_MS),
    });
    expect(s31.cadence).toBe('mensual');
    expect(s31.last_review_at).toBe(occurred.toISOString());
    expect(s31.next_review).toBeNull();
    expect(s31.due).toBe(true);

    // 29 days later (< 30) → not due.
    const s29 = await getAthleteReviewState({
      athlete_id,
      now: new Date(occurred.getTime() + 29 * DAY_MS),
    });
    expect(s29.due).toBe(false);

    // An upcoming booked review clears `due` even past the threshold.
    const now31 = new Date(occurred.getTime() + 31 * DAY_MS);
    await sql`
      insert into appointments (athlete_id, requested_start, duration_minutes, status, kind)
      values (${athlete_id}, ${new Date(now31.getTime() + 2 * DAY_MS).toISOString()}, 30, 'aceptada', 'revision')`;
    const sUpcoming = await getAthleteReviewState({ athlete_id, now: now31 });
    expect(sUpcoming.due).toBe(false);
    expect(sUpcoming.next_review).not.toBeNull();
  });

  test('a PAUSED athlete is excluded from the signal batch (#13 silence)', async () => {
    const coachId = await seedCoach();
    const active = await seedAthlete(coachId, { review_cadence: 'mensual' });
    const paused = await seedAthlete(coachId, {
      review_cadence: 'mensual',
      lifecycle_status: 'pausado',
    });

    // Both long overdue (a 1:1 six months ago) — only lifecycle should differentiate them.
    const occurred = new Date('2026-01-01T10:00:00.000Z');
    for (const a of [active, paused]) {
      await sql`
        insert into session_reports (athlete_id, coach_id, occurred_at, duration_minutes)
        values (${a.athlete_id}, ${coachId}, ${occurred.toISOString()}, 30)`;
    }

    const now = new Date('2026-07-01T10:00:00.000Z');
    const rows = await loadBatch(sql, coachId, now, null);
    const ids = rows.map((r) => r.athlete_id);

    // Active athlete is present with the review facts; paused athlete is silenced.
    expect(ids).toContain(String(active.athlete_id));
    expect(ids).not.toContain(String(paused.athlete_id));

    const activeRow = rows.find((r) => r.athlete_id === String(active.athlete_id))!;
    expect(activeRow.review_cadence).toBe('mensual');
    expect(activeRow.has_upcoming_review).toBe(false);
  });
});
