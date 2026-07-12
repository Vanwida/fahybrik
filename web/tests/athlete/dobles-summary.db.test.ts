/**
 * Real-DB coverage for the Dobles joint-summary + pair-streak (#56 wow). No SQL
 * mocked (Neon branch). The DB-backed cases drive the INJECTABLE builders
 * (buildJointSummary / computeDoublesStreak / loadLastJoint) with the test branch
 * client threaded in — the route is a thin composition root that just wires auth +
 * the query id onto buildJointSummary, so its DB-free guards (401 / 400) are the
 * only bits tested through the handler. Covers:
 *   • buildJointSummary — both sides present (times/RPE/tonnage/pr_count), the
 *     partner side honest-null, not_joint (no partner link), no_partner (no pair).
 *   • computeDoublesStreak / loadLastJoint — month + consecutive-weeks counts, the
 *     zero case, the latest joint with the partner's same-day time.
 *   • consecutiveWeeksStreak — the pure streak walk (always runs, no DB).
 *   • route guards — 401 (no bearer) and 400 (bad id) short-circuit before any DB.
 *
 * WRITE, do NOT run here (TCP egress blocked; Alex runs the suite against a branch).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  computeDoublesStreak,
  consecutiveWeeksStreak,
  loadLastJoint,
} from '@/lib/athlete/dobles-streak';
import { buildJointSummary } from '@/lib/athlete/dobles-joint-summary';
import { addDays, isoDateString, mondayOfWeekInBox, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

// The athlete bearer the route guards read — swapped per test. Only the DB-free
// 401/400 paths exercise the handler, so the DB tests never depend on this.
let session: { athlete_id: bigint; full_name: string | null } | null = null;
vi.mock('@/lib/auth/athlete-session', () => ({
  getAthleteSessionFromBearer: async () => session,
}));

const { GET } = await import('@/app/api/athlete/dobles/joint-summary/route');

function summaryRequest(assignmentId: number | string | null): Request {
  const base = 'http://localhost/api/athlete/dobles/joint-summary';
  const url = assignmentId === null ? base : `${base}?assignment_id=${assignmentId}`;
  return new Request(url, { headers: { authorization: 'Bearer test' } });
}

// ── Pure streak walk — deterministic, no DB (always runs) ────────────────────
describe('consecutiveWeeksStreak (pure)', () => {
  const now = new Date('2026-07-15T12:00:00Z');
  const wk0 = isoDateString(mondayOfWeekInBox(now)); // current Madrid week's Monday
  const wk1 = isoDateString(addDays(mondayOfWeekInBox(now), -7));
  const wk2 = isoDateString(addDays(mondayOfWeekInBox(now), -14));

  it('counts consecutive weeks back from the current week', () => {
    expect(consecutiveWeeksStreak(new Set([wk0, wk1, wk2]), now)).toBe(3);
    expect(consecutiveWeeksStreak(new Set([wk0]), now)).toBe(1);
  });
  it('the current week not yet done starts the count at the previous week', () => {
    expect(consecutiveWeeksStreak(new Set([wk1, wk2]), now)).toBe(2);
  });
  it('a gap breaks the streak; an empty set is 0', () => {
    expect(consecutiveWeeksStreak(new Set([wk0, wk2]), now)).toBe(1); // wk1 missing
    expect(consecutiveWeeksStreak(new Set(), now)).toBe(0);
  });
});

// ── Route guards — DB-free short-circuits through the handler ─────────────────
describe('joint-summary route guards (no DB)', () => {
  afterEach(() => {
    session = null;
    vi.clearAllMocks();
  });
  it('401 without a bearer', async () => {
    session = null;
    expect((await GET(summaryRequest(1))).status).toBe(401);
  });
  it('400 with a missing / invalid assignment id', async () => {
    session = { athlete_id: BigInt(1), full_name: 'X' };
    expect((await GET(summaryRequest(null))).status).toBe(400);
    expect((await GET(summaryRequest('abc'))).status).toBe(400);
  });
});

describeWithDb('dobles joint-summary + streak (real DB)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let coachId = 0;
  let athleteA = 0; // the reader (fixture athlete)
  let athleteB = 0; // the partner
  let userB = 0;
  let pairId = 0;
  let templateId = 0;
  // Madrid "today" — buildJointSummary computes the streak with the real clock, so
  // the both-sides / partner-null cases date their executions relative to today
  // (a fixed date could land in a different ISO week and skew weeks_streak).
  let todayIso = '';

  async function assignment(athleteId: number, dateIso: string): Promise<number> {
    const rows = await sql<Array<{ id: string }>>`
      insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${athleteId}, ${dateIso}::date, ${templateId}, 1, 'completed'::assignment_status)
      returning id::text
    `;
    return Number(rows[0]!.id);
  }

  /** One execution. `partnerId` set = a JOINT log (0074 link). */
  async function execution(params: {
    athleteId: number;
    assignmentId: number;
    startedAt: string;
    partnerId?: number | null;
    totalSeconds?: number | null;
    rpe?: number | null;
  }): Promise<number> {
    const rows = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at,
        total_duration_seconds, perceived_exertion, partner_athlete_id
      )
      values (
        ${params.assignmentId}, ${params.athleteId},
        ${params.startedAt}::timestamptz, ${params.startedAt}::timestamptz,
        ${params.totalSeconds ?? null}, ${params.rpe ?? null}, ${params.partnerId ?? null}
      )
      returning id::text
    `;
    return Number(rows[0]!.id);
  }

  async function strengthSegment(executionId: number, weightKg: number, reps: number, position: number) {
    await sql`
      insert into segment_executions (execution_id, position, weight_used_kg, reps_completed)
      values (${executionId}, ${position}, ${weightKg}, ${reps})
    `;
  }

  async function runSegment(executionId: number, distanceM: number, paceSPerKm: number, position: number) {
    await sql`
      insert into segment_executions (execution_id, position, distance_meters, modality, avg_pace_s_per_km)
      values (${executionId}, ${position}, ${distanceM}, 'run', ${paceSPerKm})
    `;
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
    todayIso = isoDateString(startOfDayInBox(new Date()));
    fx = await makeCoachAndAthlete(sql);
    coachId = fx.coachId;
    athleteA = fx.athleteId;

    const ub = await sql<Array<{ id: string }>>`
      insert into users (email, role) values (${`dbl-b-${Date.now()}@test.local`}, 'athlete')
      returning id::text
    `;
    userB = Number(ub[0]!.id);
    const ab = await sql<Array<{ id: string }>>`
      insert into athletes (user_id, coach_id, full_name)
      values (${userB}, ${coachId}, 'Berta Partner')
      returning id::text
    `;
    athleteB = Number(ab[0]!.id);

    const pair = await sql<Array<{ id: string }>>`
      insert into doubles_pairs (coach_id, athlete_a_id, athlete_b_id, status)
      values (${coachId}, ${athleteA}, ${athleteB}, 'active')
      returning id::text
    `;
    pairId = Number(pair[0]!.id);

    templateId = await makeTemplate({ fx, name: 'Sim Dobles', format: 'hyrox_sim' });
  });

  afterEach(async () => {
    await sql`delete from workout_executions where athlete_id in (${athleteA}, ${athleteB})`;
    await sql`delete from workout_assignments where athlete_id in (${athleteA}, ${athleteB})`;
  });

  afterAll(async () => {
    if (pairId) await sql`delete from doubles_pairs where id = ${pairId}`;
    if (athleteB) await sql`delete from athletes where id = ${athleteB}`;
    if (userB) await sql`delete from users where id = ${userB}`;
    await fx.cleanup();
    await closeTestSql();
  });

  it('buildJointSummary: both sides present — times/RPE, tonnage, a first-ever PR', async () => {
    const startedAt = `${todayIso}T12:00:00Z`;
    const aAssign = await assignment(athleteA, todayIso);
    const aExec = await execution({
      athleteId: athleteA, assignmentId: aAssign, startedAt,
      partnerId: athleteB, totalSeconds: 1700, rpe: 7,
    });
    await strengthSegment(aExec, 100, 5, 0); // 500 kg moved
    await runSegment(aExec, 1000, 240, 1); // first-ever 1k mark → 1 PR

    const bAssign = await assignment(athleteB, todayIso);
    await execution({
      athleteId: athleteB, assignmentId: bAssign, startedAt,
      partnerId: athleteA, totalSeconds: 1800, rpe: 8,
    });

    const res = await buildJointSummary(
      { selfAthleteId: BigInt(athleteA), fullName: 'Ana Atleta', assignmentId: aAssign },
      sql,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const b = res.dto;

    expect(b.self.name).toBe('Ana');
    expect(b.self.total_time_s).toBe(1700);
    expect(b.self.rpe).toBe(7);
    expect(b.self.tonnage_kg).toBe(500);
    expect(b.self.pr_count).toBe(1);

    expect(b.partner).not.toBeNull();
    expect(b.partner!.name).toBe('Berta');
    expect(b.partner!.total_time_s).toBe(1800);
    expect(b.partner!.rpe).toBe(8);
    expect(b.partner!.tonnage_kg).toBeNull(); // partner logged no strength load
    expect(b.partner!.pr_count).toBe(0);

    expect(b.joint_this_month).toBe(1);
    expect(b.weeks_streak).toBe(1);
  });

  it('buildJointSummary: partner side honest-null when the partner has not logged', async () => {
    const aAssign = await assignment(athleteA, todayIso);
    await execution({
      athleteId: athleteA, assignmentId: aAssign, startedAt: `${todayIso}T12:00:00Z`,
      partnerId: athleteB, totalSeconds: 1650, rpe: 6,
    });

    const res = await buildJointSummary(
      { selfAthleteId: BigInt(athleteA), fullName: 'Ana Atleta', assignmentId: aAssign },
      sql,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.dto.self.total_time_s).toBe(1650);
    expect(res.dto.partner).toBeNull();
    expect(res.dto.joint_this_month).toBe(1);
    expect(res.dto.weeks_streak).toBe(1);
  });

  it('buildJointSummary: not_joint when the execution carries no partner link (solo)', async () => {
    const aAssign = await assignment(athleteA, todayIso);
    await execution({
      athleteId: athleteA, assignmentId: aAssign, startedAt: `${todayIso}T12:00:00Z`,
      partnerId: null, totalSeconds: 1500,
    });

    const res = await buildJointSummary(
      { selfAthleteId: BigInt(athleteA), fullName: 'Ana Atleta', assignmentId: aAssign },
      sql,
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('not_joint');
  });

  it('buildJointSummary: no_partner for an athlete without an active pair', async () => {
    const res = await buildJointSummary(
      { selfAthleteId: BigInt(2_000_000_000), fullName: 'Sin Pareja', assignmentId: 1 },
      sql,
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('no_partner');
  });

  it('computeDoublesStreak: two joints, consecutive weeks → month 2, streak 2', async () => {
    const now = new Date('2026-07-15T12:00:00Z');
    const thisWeek = await assignment(athleteA, '2026-07-15');
    await execution({ athleteId: athleteA, assignmentId: thisWeek, startedAt: '2026-07-15T12:00:00Z', partnerId: athleteB });
    const lastWeek = await assignment(athleteA, '2026-07-08');
    await execution({ athleteId: athleteA, assignmentId: lastWeek, startedAt: '2026-07-08T12:00:00Z', partnerId: athleteB });

    const counts = await computeDoublesStreak({ athleteId: athleteA, now }, sql);
    expect(counts.joint_this_month).toBe(2);
    expect(counts.weeks_streak).toBe(2);
  });

  it('computeDoublesStreak: no joints → 0/0; loadLastJoint → null', async () => {
    const now = new Date('2026-07-15T12:00:00Z');
    const counts = await computeDoublesStreak({ athleteId: athleteA, now }, sql);
    expect(counts.joint_this_month).toBe(0);
    expect(counts.weeks_streak).toBe(0);
    expect(await loadLastJoint({ athleteId: athleteA, partnerAthleteId: athleteB }, sql)).toBeNull();
  });

  it('loadLastJoint: latest joint with title + both times (partner honest-null when absent)', async () => {
    const aAssign = await assignment(athleteA, '2026-07-15');
    await execution({ athleteId: athleteA, assignmentId: aAssign, startedAt: '2026-07-15T12:00:00Z', partnerId: athleteB, totalSeconds: 1700 });
    const bAssign = await assignment(athleteB, '2026-07-15');
    await execution({ athleteId: athleteB, assignmentId: bAssign, startedAt: '2026-07-15T12:00:00Z', partnerId: athleteA, totalSeconds: 1800 });

    const last = await loadLastJoint({ athleteId: athleteA, partnerAthleteId: athleteB }, sql);
    expect(last).not.toBeNull();
    expect(last!.date).toBe('2026-07-15');
    expect(last!.title).toBe('Sim Dobles');
    expect(last!.self_time_s).toBe(1700);
    expect(last!.partner_time_s).toBe(1800);
  });
});
