/**
 * Real-DB tests for the STRENGTH work analytics + HYROX scores (Fase 1B). No SQL
 * mocked — a Neon test branch via describeWithDb (skipped, never false-green, when
 * TEST_DATABASE_URL is unset). Requires migration 0120 applied on the branch
 * (segment_executions.exercise_id / context_format).
 *
 * Covers the honesty contract the section promises:
 *   • volume tonnage EXCLUDES skipped sets (never a fabricated 0).
 *   • progression groups by exercise_id (denormalized, survives template churn).
 *   • load adherence = real vs prescribed over sets with both.
 *   • zero logged sets ⇒ a gate (needs_logging), not fabricated numbers.
 *   • a scored sim/metcon surfaces in the HYROX section + its drill-down.
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildStrengthSection } from '@/lib/athlete/analytics/strength';
import { buildHyroxSection } from '@/lib/athlete/analytics/hyrox';
import { buildDrillDown, resolvePeriod } from '@/lib/athlete/analytics';
import type { AnalyticsCard } from '@/lib/athlete/analytics';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, makeTemplate, makeAssignment, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const period = resolvePeriod({ key: 'month', now: NOW });

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

interface SetSpec {
  set_index: number;
  reps_prescribed: number | null;
  reps_actual: number | null;
  load_prescribed_kg: number | null;
  load_actual_kg: number | null;
  rpe?: number | null;
  status: 'done' | 'scaled' | 'skipped';
  is_approach?: boolean;
}

/** Seed one execution → one strength segment (exercise_id, modality=strength) → its sets. */
async function seedStrengthSegment(params: {
  sql: ReturnType<typeof getTestSql>;
  fx: Fixture;
  assignmentId: number;
  daysAgo: number;
  exerciseId: number;
  sets: SetSpec[];
}): Promise<void> {
  const { sql, fx, assignmentId, daysAgo, exerciseId, sets } = params;
  const started = daysAgoIso(daysAgo);
  const exec = await sql<Array<{ id: string }>>`
    insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source)
    values (${assignmentId}, ${fx.athleteId}, ${started}::timestamptz, ${started}::timestamptz, 'manual')
    returning id::text
  `;
  const executionId = Number(exec[0]!.id);
  const seg = await sql<Array<{ id: string }>>`
    insert into segment_executions (execution_id, position, exercise_id, modality, context_format, context_source, source)
    values (${executionId}, 0, ${exerciseId}, 'strength', 'sets', 'block', 'demo')
    returning id::text
  `;
  const segId = Number(seg[0]!.id);
  for (const s of sets) {
    await sql`
      insert into set_executions (
        segment_execution_id, set_index, reps_prescribed, reps_actual,
        load_prescribed_kg, load_actual_kg, rpe, status, confirmed, is_approach
      ) values (
        ${segId}, ${s.set_index}, ${s.reps_prescribed}, ${s.reps_actual},
        ${s.load_prescribed_kg}, ${s.load_actual_kg}, ${s.rpe ?? null}, ${s.status}, true,
        ${s.is_approach ?? false}
      )
    `;
  }
}

function cardById(cards: AnalyticsCard[], id: string): AnalyticsCard {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`card ${id} not found (have: ${cards.map((x) => x.id).join(', ')})`);
  return c;
}

describeWithDb('strength work analytics (Fase 1B, real DB)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let backSquatId: number;
  let frontSquatId: number;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    backSquatId = await makeExercise({ fx, name: 'Back Squat' });
    frontSquatId = await makeExercise({ fx, name: 'Front Squat' });

    const tpl = await makeTemplate({ fx, name: 'Fuerza de pierna', format: 'circuit' });

    // Week 1 (10 days ago): Back Squat — done + SKIPPED + scaled; Front Squat bodyweight.
    const a1 = await makeAssignment({ fx, templateId: tpl, scheduledForIso: daysAgoIso(10).slice(0, 10), status: 'completed' });
    await seedStrengthSegment({
      sql, fx, assignmentId: a1, daysAgo: 10, exerciseId: backSquatId,
      sets: [
        { set_index: 1, reps_prescribed: 5, reps_actual: 5, load_prescribed_kg: 100, load_actual_kg: 100, rpe: 8, status: 'done' },
        { set_index: 2, reps_prescribed: 5, reps_actual: null, load_prescribed_kg: 100, load_actual_kg: null, status: 'skipped' },
        { set_index: 3, reps_prescribed: 5, reps_actual: 5, load_prescribed_kg: 100, load_actual_kg: 90, rpe: 8, status: 'scaled' },
      ],
    });
    // Front Squat bodyweight (no load) in the SAME week-1 session assignment reuse: new assignment for isolation.
    const a1b = await makeAssignment({ fx, templateId: tpl, scheduledForIso: daysAgoIso(9).slice(0, 10), status: 'completed' });
    await seedStrengthSegment({
      sql, fx, assignmentId: a1b, daysAgo: 9, exerciseId: frontSquatId,
      sets: [
        { set_index: 1, reps_prescribed: 10, reps_actual: 10, load_prescribed_kg: null, load_actual_kg: null, status: 'done' },
        { set_index: 2, reps_prescribed: 10, reps_actual: 8, load_prescribed_kg: null, load_actual_kg: null, status: 'scaled' },
      ],
    });

    // Week 2 (3 days ago): Back Squat again — heavier top set (progression).
    const a2 = await makeAssignment({ fx, templateId: tpl, scheduledForIso: daysAgoIso(3).slice(0, 10), status: 'completed' });
    await seedStrengthSegment({
      sql, fx, assignmentId: a2, daysAgo: 3, exerciseId: backSquatId,
      sets: [
        { set_index: 1, reps_prescribed: 5, reps_actual: 5, load_prescribed_kg: 100, load_actual_kg: 100, rpe: 9, status: 'done' },
        { set_index: 2, reps_prescribed: 5, reps_actual: 6, load_prescribed_kg: 100, load_actual_kg: 100, rpe: 9, status: 'scaled' },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  test('volume tonnage excludes skipped sets and counts sessions from the data', async () => {
    const section = await buildStrengthSection({ athlete_id: fx.athleteId, period }, sql);
    const vol = cardById(section.cards, 'strength_volume');
    expect(vol.availability).toBe('real');
    // 3 distinct executions had ≥1 logged set (2 back-squat sessions + 1 front-squat).
    const sessionsRow = vol.rows.find((r) => r.id === 'sessions');
    expect(sessionsRow?.value).toBe('3');

    // The drill exposes per-session tonnage. Week-1 back squat = 100×5 + 90×5 = 950 kg
    // ONLY IF the skipped set (would-be 100×5 = 500) is excluded. A fabricated skip
    // would push it to 1.5 t. So "950 kg" proves skips never count.
    const drill = await buildDrillDown({ athlete_id: fx.athleteId, kind: 'strength.volume', params: {}, period }, sql);
    expect(drill?.sessions.length).toBe(3);
    const values = drill!.sessions.map((s) => s.value);
    expect(values).toContain('950 kg');
    // Front-squat session is bodyweight → 0 tonnage.
    expect(values).toContain('0 kg');
    // No session shows the fabricated-skip tonnage.
    expect(values).not.toContain('1.5 t');
  });

  test('progression groups by exercise_id and picks the lift with most history as hero', async () => {
    const section = await buildStrengthSection({ athlete_id: fx.athleteId, period }, sql);
    const prog = cardById(section.cards, 'lift_progression');
    expect(prog.availability).toBe('real');
    // Back Squat spans 2 weeks (hero), Front Squat 1 → title is the back squat.
    expect(prog.title_es.toLowerCase()).toContain('back squat');
    // Two weekly points (increasing top-set 1RM).
    expect(prog.series.length).toBe(2);

    // Drill for the hero exercise: best set overall is week-2 100×6 (e1RM 120 > 116.7).
    const drill = await buildDrillDown({ athlete_id: fx.athleteId, kind: 'strength.exercise', params: { exercise_id: String(backSquatId) }, period }, sql);
    expect(drill?.sessions.length).toBe(2);
    const best = drill!.sessions.find((s) => s.value_label === 'mejor');
    expect(best?.value).toBe('100 kg × 6');
  });

  test('lifts worked lists every trained exercise with its best set', async () => {
    const section = await buildStrengthSection({ athlete_id: fx.athleteId, period }, sql);
    const worked = cardById(section.cards, 'lifts_worked');
    const labels = worked.rows.map((r) => r.label);
    expect(labels).toContain('Back Squat');
    expect(labels).toContain('Front Squat');
    // Front squat is bodyweight → "N reps", never a fake kg.
    const front = worked.rows.find((r) => r.label === 'Front Squat');
    expect(front?.value).toBe('10 reps');
  });

  test('load adherence = avg(actual/prescribed) over sets with both, skips excluded', async () => {
    const section = await buildStrengthSection({ athlete_id: fx.athleteId, period }, sql);
    const adh = cardById(section.cards, 'load_adherence');
    expect(adh.availability).toBe('real');
    // Loaded pairs: 100/100, 90/100 (wk1) + 100/100, 100/100 (wk2) = avg 0.975 → 98%.
    const loadRow = adh.rows.find((r) => r.id === 'load');
    expect(loadRow?.value).toBe('98%');
  });

  test('effort card is real once enough sets carry RPE', async () => {
    const section = await buildStrengthSection({ athlete_id: fx.athleteId, period }, sql);
    const effort = cardById(section.cards, 'effort_rpe');
    expect(effort.availability).toBe('real'); // 4 sets have rpe ≥ MIN_RPE_SETS
  });
});

describeWithDb('strength gate with zero logged sets (real DB)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
  }, 60_000);
  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  test('no sets ⇒ needs_logging gate, no fabricated numbers', async () => {
    const section = await buildStrengthSection({ athlete_id: fx.athleteId, period }, sql);
    const vol = cardById(section.cards, 'strength_volume');
    expect(vol.availability).toBe('needs_logging');
    expect(vol.primary).toBeNull();
    expect(vol.series).toHaveLength(0);
    // Section header stays honest (no tests, no work).
    expect(section.availability).toBe('needs_logging');
  });
});

describeWithDb('HYROX scored sim / metcon (real DB)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const sim = await makeTemplate({ fx, name: 'Simulación HYROX', format: 'hyrox_sim' });
    const metcon = await makeTemplate({ fx, name: 'Metcon', format: 'for_time' });
    const aSim = await makeAssignment({ fx, templateId: sim, scheduledForIso: daysAgoIso(8).slice(0, 10), status: 'completed' });
    const aMet = await makeAssignment({ fx, templateId: metcon, scheduledForIso: daysAgoIso(2).slice(0, 10), status: 'completed' });
    await sql`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source, score_time_s)
      values (${aSim}, ${fx.athleteId}, ${daysAgoIso(8)}::timestamptz, ${daysAgoIso(8)}::timestamptz, 'manual', 3600)
    `;
    await sql`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source, score_time_s)
      values (${aMet}, ${fx.athleteId}, ${daysAgoIso(2)}::timestamptz, ${daysAgoIso(2)}::timestamptz, 'manual', 300)
    `;
  }, 60_000);
  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  test('sim/metcon scores surface in the HYROX section with a best-sim PR', async () => {
    const section = await buildHyroxSection({ athlete_id: fx.athleteId, period }, sql);
    const scores = cardById(section.cards, 'sim_scores');
    expect(scores.availability).toBe('real');
    const best = scores.rows.find((r) => r.id === 'best_sim');
    expect(best?.value).toBe('1:00:00'); // 3600 s HYROX sim
    // Both scored sessions listed.
    const labels = scores.rows.map((r) => r.label);
    expect(labels).toContain('Simulación HYROX');
    expect(labels).toContain('Metcon');
  });

  test('hyrox.scores drill lists the source sessions', async () => {
    const drill = await buildDrillDown({ athlete_id: fx.athleteId, kind: 'hyrox.scores', params: {}, period }, sql);
    expect(drill?.sessions.length).toBe(2);
    const bestSim = drill!.summary.find((s) => s.id === 'best_sim');
    expect(bestSim?.value).toBe('1:00:00');
    const metcon = drill!.sessions.find((s) => s.title_es === 'Metcon');
    expect(metcon?.value).toBe('5:00'); // 300 s for-time
  });
});

describeWithDb('strength work excludes approach sets (card 155)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let squatId: number;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    squatId = await makeExercise({ fx, name: 'Sentadilla' });
    const tpl = await makeTemplate({ fx, name: 'Fuerza', format: 'circuit' });
    const mixed = await makeAssignment({
      fx, templateId: tpl, scheduledForIso: daysAgoIso(4).slice(0, 10), status: 'completed',
    });
    await seedStrengthSegment({
      sql, fx, assignmentId: mixed, daysAgo: 4, exerciseId: squatId,
      sets: [
        { set_index: 1, reps_prescribed: 5, reps_actual: 5, load_prescribed_kg: 50, load_actual_kg: 50, status: 'done', is_approach: true },
        { set_index: 2, reps_prescribed: 5, reps_actual: 5, load_prescribed_kg: 50, load_actual_kg: 50, status: 'done', is_approach: true },
        { set_index: 3, reps_prescribed: 5, reps_actual: 5, load_prescribed_kg: 100, load_actual_kg: 100, rpe: 8, status: 'done' },
        { set_index: 4, reps_prescribed: 5, reps_actual: 5, load_prescribed_kg: 100, load_actual_kg: 100, rpe: 8, status: 'done' },
        { set_index: 5, reps_prescribed: 5, reps_actual: 5, load_prescribed_kg: 100, load_actual_kg: 100, rpe: 8, status: 'done' },
      ],
    });
    const onlyApproach = await makeAssignment({
      fx, templateId: tpl, scheduledForIso: daysAgoIso(2).slice(0, 10), status: 'completed',
    });
    await seedStrengthSegment({
      sql, fx, assignmentId: onlyApproach, daysAgo: 2, exerciseId: squatId,
      sets: [
        { set_index: 1, reps_prescribed: 3, reps_actual: 3, load_prescribed_kg: 80, load_actual_kg: 80, status: 'done', is_approach: true },
        { set_index: 2, reps_prescribed: 3, reps_actual: 3, load_prescribed_kg: 80, load_actual_kg: 80, status: 'done', is_approach: true },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  test('volumen, serie más pesada y carga ignoran la aproximación', async () => {
    const section = await buildStrengthSection({ athlete_id: fx.athleteId, period }, sql);
    const vol = cardById(section.cards, 'strength_volume');
    expect(vol.availability).toBe('real');
    expect(vol.rows.find((r) => r.id === 'sessions')?.value).toBe('1');
    expect(vol.rows.find((r) => r.id === 'sessions')?.sub).toBe('3 series');
    expect(vol.primary?.value).toBe('1,5');
    expect(vol.primary?.unit).toBe('t');

    const drill = await buildDrillDown({ athlete_id: fx.athleteId, kind: 'strength.volume', params: {}, period }, sql);
    expect(drill?.sessions.length).toBe(1);
    expect(drill!.sessions.map((s) => s.value)).toContain('1,5 t');
    expect(drill!.sessions.map((s) => s.value)).not.toContain('2,0 t');
    expect(drill!.sessions.map((s) => s.value)).not.toContain('2,5 t');

    const worked = cardById(section.cards, 'lifts_worked');
    const squat = worked.rows.find((r) => r.label === 'Sentadilla');
    expect(squat?.value).toBe('100 kg × 5');
  });
});
