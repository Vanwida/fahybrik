/**
 * Real-DB verification of the DOUBLES gap loader + coach guidance + the goal
 * mirror. No SQL is mocked. A pair of fixture athletes (same coach) each get a
 * complete singles race (their solo-prediction basis) and are linked as an active
 * doubles pair with an authored simulation (the reparto). Then buildDoblesRaceGap
 * runs against the Neon test branch and the WIRE TYPES are pinned (numbers are
 * numbers, arrays present) — a real bug once came from an id crossing an agent
 * boundary as a string. Also covers resolveCoachTips defaults→custom and the
 * doubles goal mirror.
 *
 * SKIPPED unless TEST_DATABASE_URL is set (describeWithDb). Requires migrations
 * through 0123 (coach_guidance) + the exercises catalog on the branch.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildDoblesRaceGap } from '@/lib/athlete/dobles-gap';
import { getCoachGuidance, resolveCoachTips, upsertCoachGuidance } from '@/lib/coach/guidance';
import { mirrorDoublesGoalToPartner } from '@/lib/races/target-race-write';
import { DEFAULT_COACH_TIPS } from '@fahybrid/shared/domain/coach-guidance';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const RUN_TOTAL = 1800;
const STATIONS: Array<{ index: number; seconds: number }> = [
  { index: 2, seconds: 240 },
  { index: 4, seconds: 150 },
  { index: 6, seconds: 200 },
  { index: 8, seconds: 230 },
  { index: 10, seconds: 230 },
  { index: 12, seconds: 120 },
  { index: 14, seconds: 190 },
  { index: 16, seconds: 280 },
];
const ROXZONE = 160;
const RESULT = RUN_TOTAL + STATIONS.reduce((a, s) => a + s.seconds, 0) + ROXZONE; // 3600
const GOAL = 3900;

function stationSplitsJson(): Array<{ index: number; seconds: number; rank: null }> {
  return STATIONS.map((s) => ({ index: s.index, seconds: s.seconds, rank: null }));
}

/** The coach-authored reparto (A-centric): a mix of full-carry + split. */
function repartoJson() {
  return [
    { station_index: 2, assigned_to: 'a', self_share: 1 },
    { station_index: 4, assigned_to: 'b', self_share: 0 },
    { station_index: 6, assigned_to: 'split', self_share: 0.5 },
    { station_index: 8, assigned_to: 'split', self_share: 0.6 },
    { station_index: 10, assigned_to: 'split', self_share: 0.5 },
    { station_index: 12, assigned_to: 'a', self_share: 1 },
    { station_index: 14, assigned_to: 'split', self_share: 0.4 },
    { station_index: 16, assigned_to: 'split', self_share: 0.5 },
  ];
}

describeWithDb('dobles-gap (real DB)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];
  // Extra rows created outside the fixture helper (partner athlete/user, pair,
  // sim, races, event) — cleaned in FK-safe order before the fixtures.
  let coachId = 0;
  let athleteA = 0;
  let userA = 0;
  let athleteB = 0;
  let userB = 0;
  let pairId = 0;
  let eventId = 0;

  beforeAll(async () => {
    await sql`select 1 as ok`;
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    coachId = fx.coachId;
    athleteA = fx.athleteId;
    userA = fx.athleteUserId;

    // Partner athlete B under the SAME coach.
    const ub = await sql<Array<{ id: string }>>`
      insert into users (email, role) values (${`ath-b-${Date.now()}@test.local`}, 'athlete')
      returning id::text
    `;
    userB = Number(ub[0]!.id);
    const ab = await sql<Array<{ id: string }>>`
      insert into athletes (user_id, coach_id, full_name)
      values (${userB}, ${coachId}, 'Partner Athlete')
      returning id::text
    `;
    athleteB = Number(ab[0]!.id);

    // Active doubles pair (A, B).
    const pair = await sql<Array<{ id: string }>>`
      insert into doubles_pairs (coach_id, athlete_a_id, athlete_b_id, status)
      values (${coachId}, ${athleteA}, ${athleteB}, 'active')
      returning id::text
    `;
    pairId = Number(pair[0]!.id);

    // A recent complete singles race for EACH athlete (solo-prediction basis).
    for (const athleteId of [athleteA, athleteB]) {
      await sql`
        insert into races (athlete_id, name, event_type, format, division, gender_category, priority,
          race_date, result_time_seconds, run_total_seconds, roxzone_seconds,
          run_splits_json, station_splits_json, status, source)
        values (${athleteId}, 'HYROX Reciente', 'hyrox', 'singles', 'open', 'men', 'tune_up',
          (current_date - 20), ${RESULT}, ${RUN_TOTAL}, ${ROXZONE},
          ${sql.json([225, 225, 225, 225, 225, 225, 225, 225])}, ${sql.json(stationSplitsJson())},
          'completed', 'hyrox_import')
      `;
    }

    // The coach's authored reparto for the pair.
    await sql`
      insert into dobles_simulations
        (athlete_a_user_id, athlete_b_user_id, station_splits, created_by_coach_id,
         last_edited_by_kind, last_edited_by_user_id)
      values (${userA}, ${userB}, ${sql.json(repartoJson())}, ${coachId}, 'coach', null)
    `;
  });

  afterAll(async () => {
    // FK-safe: our rows first (sim RESTRICTs the coach), then the fixtures.
    await sql`delete from dobles_simulations where athlete_a_user_id = ${userA} and athlete_b_user_id = ${userB}`;
    await sql`delete from coach_guidance where coach_id = ${coachId}`;
    await sql`delete from races where athlete_id in (${athleteA}, ${athleteB})`;
    if (pairId) await sql`delete from doubles_pairs where id = ${pairId}`;
    if (eventId) await sql`delete from events where id = ${eventId}`;
    if (athleteB) await sql`delete from athletes where id = ${athleteB}`;
    if (userB) await sql`delete from users where id = ${userB}`;
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  test('race-gap: pair predicted, wire TYPES pinned (numbers are numbers)', async () => {
    const board = await buildDoblesRaceGap(
      {
        self_athlete_id: BigInt(athleteA),
        self_user_id: BigInt(userA),
        race: {
          race_id: 999999,
          name: 'HYROX Test Dobles',
          race_date: '2026-09-26',
          division: 'open',
          gender_category: 'men',
          goal_time_seconds: GOAL,
        },
      },
      sql,
    );

    // Both athletes have data + an active pair → never no_pair / no_data.
    expect(board.availability === 'ok' || board.availability === 'partial').toBe(true);
    expect(typeof board.goal_s).toBe('number');
    expect(board.goal_s).toBe(GOAL);
    expect(typeof board.goal_label).toBe('string');
    expect(typeof board.predicted_total_s).toBe('number');
    expect(typeof board.partner_name).toBe('string');
    expect(board.partner_name).toBe('Partner');
    expect(typeof board.strategy_last_edited_by).toBe('string'); // coach author
    expect(Array.isArray(board.coach_tips)).toBe(true);
    expect(board.coach_tips.length).toBeGreaterThan(0);
    expect(typeof board.coach_tips[0]).toBe('string');

    // 10 segments; budgets close EXACTLY to the goal.
    expect(board.segments).toHaveLength(10);
    const sumBudget = board.segments.reduce((a, s) => a + s.budget_s, 0);
    expect(sumBudget).toBe(GOAL);

    for (const s of board.segments) {
      expect(typeof s.key).toBe('string');
      expect(typeof s.budget_s).toBe('number');
      expect(typeof s.pair_predicted_s).toBe('number');
      expect(Number.isInteger(s.budget_s)).toBe(true);
      expect(['together', 'self', 'partner', 'split']).toContain(s.carrier);
      expect(['observado', 'estimado', 'sin_datos']).toContain(s.tier);
      expect(s.self_share === null || typeof s.self_share === 'number').toBe(true);
      expect(s.self_solo_s === null || typeof s.self_solo_s === 'number').toBe(true);
      expect(s.partner_solo_s === null || typeof s.partner_solo_s === 'number').toBe(true);
    }

    // The runs go together (slower governs); station_index null there.
    const run = board.segments.find((s) => s.kind === 'run')!;
    expect(run.carrier).toBe('together');
    expect(run.self_share).toBeNull();
    expect(run.station_index).toBeNull();

    // Station 2 is fully the reader's (assigned_to 'a', reader is A) → carrier self.
    const st2 = board.segments.find((s) => s.station_index === 2)!;
    expect(st2.carrier).toBe('self');
    expect(st2.self_share).toBe(1);
  });

  test('coach guidance: defaults until authored, then the coach edit wins', async () => {
    const before = await resolveCoachTips(coachId, 'race_doubles', sql);
    expect(before).toEqual(DEFAULT_COACH_TIPS.race_doubles);

    const custom = ['Salid conservadores en los runs.', 'Cantad el relevo antes de la estación.'];
    const saved = await upsertCoachGuidance(coachId, 'race_doubles', custom, sql);
    expect(saved.is_custom).toBe(true);
    expect(saved.items).toEqual(custom);

    const after = await resolveCoachTips(coachId, 'race_doubles', sql);
    expect(after).toEqual(custom);
    const read = await getCoachGuidance(coachId, 'race_doubles', sql);
    expect(read.is_custom).toBe(true);
    expect(typeof read.updated_at).toBe('string');
    // sim_doubles untouched → still defaults.
    const sim = await getCoachGuidance(coachId, 'sim_doubles', sql);
    expect(sim.is_custom).toBe(false);
    expect(sim.items).toEqual(DEFAULT_COACH_TIPS.sim_doubles);
  });

  test('goal mirror: a doubles goal propagates to the partner in one tx', async () => {
    const ev = await sql<Array<{ id: string }>>`
      insert into events (slug, name, type, start_date, is_visible_to_athletes)
      values (${`ev-mirror-${Date.now()}`}, 'Mirror Event', 'hyrox', '2026-10-10', true)
      returning id::text
    `;
    eventId = Number(ev[0]!.id);

    for (const athleteId of [athleteA, athleteB]) {
      await sql`
        insert into races (athlete_id, event_id, name, event_type, format, division,
          gender_category, priority, race_date, goal_time_seconds, status, source)
        values (${athleteId}, ${eventId}, 'Mirror Dobles', 'hyrox', 'doubles', 'open', 'men',
          'secondary', '2026-10-10', null, 'registered', 'manual')
      `;
    }

    await sql.begin(async (tx) => {
      await mirrorDoublesGoalToPartner(tx, {
        athlete_id: athleteA,
        format: 'doubles',
        event_id: eventId,
        race_date: '2026-10-10',
        goal: 4200,
      });
    });

    const partnerRace = await sql<Array<{ goal: number | null }>>`
      select goal_time_seconds as goal from races
      where athlete_id = ${athleteB} and event_id = ${eventId} and format = 'doubles'
      limit 1
    `;
    expect(partnerRace[0]!.goal).toBe(4200);

    // A singles goal must NOT mirror (guarded by format).
    await sql.begin(async (tx) => {
      await mirrorDoublesGoalToPartner(tx, {
        athlete_id: athleteA,
        format: 'singles',
        event_id: eventId,
        race_date: '2026-10-10',
        goal: 9999,
      });
    });
    const stillPartner = await sql<Array<{ goal: number | null }>>`
      select goal_time_seconds as goal from races
      where athlete_id = ${athleteB} and event_id = ${eventId} and format = 'doubles'
      limit 1
    `;
    expect(stillPartner[0]!.goal).toBe(4200);
  });
});
