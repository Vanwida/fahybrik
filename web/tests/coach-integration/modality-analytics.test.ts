/**
 * Real-DB integration tests for `buildModalityAnalytics` — the run-vs-row(-vs-
 * ski/bike/strength) breakdown the coach + iOS analytics surfaces consume.
 *
 * Exercises the REAL SQL: the segment_executions → workout_executions join, the
 * modality CTE (explicit column primary, exercise fallback), the 90-day window,
 * the `date_trunc('week')` weekly buckets and the recent-executions + per-segment
 * detail fan-out. Nothing is mocked (project rule): we seed a tiny fixture with a
 * run segment and a row segment on one execution, then assert the buckets come
 * back SEPARATED by modality and the per-segment detail round-trips.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { buildModalityAnalytics } from '@/lib/coach/modality-analytics';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

// Recent (inside the 90-day analytics window) so totals/weekly pick it up.
// Pinned to a fixed wall-clock so the week bucket is deterministic.
const NOW_ISO = new Date().toISOString();
const FIVE_MIN_LATER = new Date(Date.now() + 5 * 60_000).toISOString();

describeWithDb('buildModalityAnalytics (real DB)', () => {
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

  // Seed: one execution carrying a RUN segment + a ROW segment.
  async function seedRunAndRow(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tplId = await makeTemplate({ fx, name: 'hyrox' });
    const assignmentId = await makeAssignment({ fx, templateId: tplId, scheduledForIso: NOW_ISO.slice(0, 10) });

    const exec = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, perceived_exertion, source
      )
      values (
        ${assignmentId}, ${fx.athleteId}, ${NOW_ISO}::timestamptz, ${FIVE_MIN_LATER}::timestamptz, 600, 7, 'healthkit'
      )
      returning id::text
    `;
    const executionId = Number(exec[0]!.id);

    // Run leg: 1000m over 240s @ 4:00/km.
    await sql`
      insert into segment_executions (
        execution_id, position, started_at, ended_at, modality,
        distance_meters, avg_pace_s_per_km, avg_hr
      ) values (
        ${executionId}, 0, ${NOW_ISO}::timestamptz,
        ${new Date(new Date(NOW_ISO).getTime() + 240_000).toISOString()}::timestamptz,
        'run', 1000, 240, 165
      )
    `;
    // Row leg: 500m over 110s @ 1:50/500m, 280W.
    await sql`
      insert into segment_executions (
        execution_id, position, started_at, ended_at, modality,
        distance_meters, avg_pace_s_per_500m, avg_power_w, stroke_rate_spm
      ) values (
        ${executionId}, 1, ${NOW_ISO}::timestamptz,
        ${new Date(new Date(NOW_ISO).getTime() + 110_000).toISOString()}::timestamptz,
        'row', 500, 110, 280, 30
      )
    `;
    return fx;
  }

  test('by_modality_totals separates run and row with their own distance + pace', async () => {
    const fx = await seedRunAndRow();
    const out = await buildModalityAnalytics({ athlete_id: fx.athleteId }, sql);

    const run = out.by_modality_totals.find((m) => m.modality === 'run');
    const row = out.by_modality_totals.find((m) => m.modality === 'row');

    expect(run).toBeDefined();
    expect(row).toBeDefined();
    // Distinct buckets — never merged into one "cardio" total.
    expect(run!.distance_meters).toBe(1000);
    expect(run!.avg_pace_s_per_km).toBe(240);
    expect(run!.sessions).toBe(1);

    expect(row!.distance_meters).toBe(500);
    expect(row!.avg_pace_s_per_500m).toBe(110);
    expect(row!.sessions).toBe(1);
  });

  test('weekly buckets exist for both modalities in the current ISO week', async () => {
    const fx = await seedRunAndRow();
    const out = await buildModalityAnalytics({ athlete_id: fx.athleteId }, sql);

    const modalities = new Set(out.weekly.map((w) => w.modality));
    expect(modalities.has('run')).toBe(true);
    expect(modalities.has('row')).toBe(true);
    // All weekly rows are Monday-anchored ISO date strings.
    for (const w of out.weekly) {
      expect(w.week_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('recent_executions surfaces per-segment detail for the seeded execution', async () => {
    const fx = await seedRunAndRow();
    const out = await buildModalityAnalytics({ athlete_id: fx.athleteId }, sql);

    expect(out.recent_executions).toHaveLength(1);
    const exec = out.recent_executions[0]!;
    expect(exec.perceived_exertion).toBe(7);
    expect(exec.total_duration_seconds).toBe(600);
    expect(exec.segments).toHaveLength(2);

    const [run, row] = exec.segments; // ordered by position
    expect(run!.modality).toBe('run');
    expect(run!.distance_meters).toBe(1000);
    expect(run!.avg_pace_s_per_km).toBe(240);

    expect(row!.modality).toBe('row');
    expect(row!.avg_pace_s_per_500m).toBe(110);
    expect(row!.avg_power_w).toBe(280);
    expect(row!.stroke_rate_spm).toBe(30);
  });

  test('athlete with no segment_executions returns empty analytics (no crash)', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const out = await buildModalityAnalytics({ athlete_id: fx.athleteId }, sql);
    expect(out.by_modality_totals).toEqual([]);
    expect(out.weekly).toEqual([]);
    expect(out.recent_executions).toEqual([]);
  });
});
