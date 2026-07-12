// #65 — running PR detection at workout close.
//
// Two layers:
//   1. PURE: detectRunningPRs — eligibility, first mark, strict-improvement, tie.
//   2. REAL DB: detectExecutionRunningPRs against a Neon test branch, exercising
//      the real segment_executions → workout_executions join + band SQL, with the
//      response TYPES pinned (numbers as numbers).

import { afterAll, afterEach, beforeAll, describe, expect, it, test } from 'vitest';
import {
  RUN_PR_BANDS,
  detectRunningPRs,
  type RunningEffortSet,
} from '@fahybrid/shared/domain/running/best-efforts';
import { detectExecutionRunningPRs } from '@/lib/sync/running-prs';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

const NONE: RunningEffortSet = { run_1k: null, run_3k: null, run_5k: null };

// ── PURE ──────────────────────────────────────────────────────────────────────
describe('detectRunningPRs (pure)', () => {
  it('emits nothing when the session has no eligible effort', () => {
    expect(detectRunningPRs(NONE, NONE)).toEqual([]);
  });

  it('emits a first mark (prev null) when there is no prior best', () => {
    const prs = detectRunningPRs({ ...NONE, run_5k: 1440 }, NONE);
    expect(prs).toEqual([{ kind: 'run_5k', new_value_s: 1440, prev_value_s: null }]);
  });

  it('emits a PR with the prior best when the session is strictly faster', () => {
    const prs = detectRunningPRs({ ...NONE, run_3k: 780 }, { ...NONE, run_3k: 820 });
    expect(prs).toEqual([{ kind: 'run_3k', new_value_s: 780, prev_value_s: 820 }]);
  });

  it('does NOT emit when the session ties the prior best', () => {
    expect(detectRunningPRs({ ...NONE, run_1k: 240 }, { ...NONE, run_1k: 240 })).toEqual([]);
  });

  it('does NOT emit when the session is slower than the prior best', () => {
    expect(detectRunningPRs({ ...NONE, run_5k: 1500 }, { ...NONE, run_5k: 1440 })).toEqual([]);
  });

  it('emits multiple records in one session (1k + 5k), independently', () => {
    const prs = detectRunningPRs(
      { run_1k: 230, run_3k: null, run_5k: 1400 },
      { run_1k: 240, run_3k: null, run_5k: 1500 },
    );
    expect(prs).toEqual([
      { kind: 'run_1k', new_value_s: 230, prev_value_s: 240 },
      { kind: 'run_5k', new_value_s: 1400, prev_value_s: 1500 },
    ]);
  });

  it('ignores non-finite / non-positive values as not-eligible', () => {
    expect(detectRunningPRs({ ...NONE, run_5k: 0 }, NONE)).toEqual([]);
    expect(detectRunningPRs({ ...NONE, run_5k: Number.NaN }, NONE)).toEqual([]);
  });
});

// ── REAL DB ─────────────────────────────────────────────────────────────────
describeWithDb('detectExecutionRunningPRs (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  /** Insert a workout_execution + one run segment of `distanceM` over `durS`. */
  async function seedRunExecution(
    fx: Fixture,
    templateId: number,
    dayIso: string,
    distanceM: number,
    durS: number,
  ): Promise<number> {
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: dayIso });
    const start = `${dayIso}T08:00:00.000Z`;
    const end = new Date(new Date(start).getTime() + durS * 1000).toISOString();
    const exec = await sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source)
      values (${assignmentId}, ${fx.athleteId}, ${start}::timestamptz, ${end}::timestamptz, 'healthkit')
      returning id::text
    `;
    const executionId = Number(exec[0]!.id);
    await sql`
      insert into segment_executions (execution_id, position, started_at, ended_at, modality, distance_meters)
      values (${executionId}, 0, ${start}::timestamptz, ${end}::timestamptz, 'run', ${distanceM})
    `;
    return executionId;
  }

  test('a session that beats the athlete 5k → run_5k PR with the correct prev (typed numbers)', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tpl = await makeTemplate({ fx, name: 'run' });

    // Prior best 5k: 5000 m in 1500 s (25:00).
    await seedRunExecution(fx, tpl, '2026-05-01', 5000, 1500);
    // Current session: 5000 m in 1440 s (24:00) → a PR.
    const current = await seedRunExecution(fx, tpl, '2026-05-08', 5000, 1440);

    const prs = await detectExecutionRunningPRs({ sql, athleteId: fx.athleteId, executionId: current });
    expect(prs).toEqual([{ kind: 'run_5k', new_value_s: 1440, prev_value_s: 1500 }]);
    // Types are pinned — numbers, not strings.
    expect(typeof prs[0]!.new_value_s).toBe('number');
    expect(typeof prs[0]!.prev_value_s).toBe('number');
  });

  test('a session with no eligible run effort → prs empty', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tpl = await makeTemplate({ fx, name: 'run' });
    // 2000 m falls in NO band (not 1k/3k/5k).
    const current = await seedRunExecution(fx, tpl, '2026-05-08', 2000, 600);
    const prs = await detectExecutionRunningPRs({ sql, athleteId: fx.athleteId, executionId: current });
    expect(prs).toEqual([]);
  });

  test('first-ever 3k → run_3k with prev null', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tpl = await makeTemplate({ fx, name: 'run' });
    const current = await seedRunExecution(fx, tpl, '2026-05-08', 3000, 840);
    const prs = await detectExecutionRunningPRs({ sql, athleteId: fx.athleteId, executionId: current });
    expect(prs).toEqual([{ kind: 'run_3k', new_value_s: 840, prev_value_s: null }]);
    expect(prs[0]!.prev_value_s).toBeNull();
  });

  test('a slower session than the prior best → not a PR', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tpl = await makeTemplate({ fx, name: 'run' });
    await seedRunExecution(fx, tpl, '2026-05-01', 5000, 1400); // prior faster
    const current = await seedRunExecution(fx, tpl, '2026-05-08', 5000, 1500); // slower now
    const prs = await detectExecutionRunningPRs({ sql, athleteId: fx.athleteId, executionId: current });
    expect(prs).toEqual([]);
  });

  test('band edges match the shared single source (sanity)', () => {
    expect(RUN_PR_BANDS.run_5k).toMatchObject({ min_meters: 4500, max_meters: 5500 });
  });
});
