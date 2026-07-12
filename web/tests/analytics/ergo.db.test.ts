/**
 * Real-DB tests for the ERGO analytics section after the tab redesign. No SQL
 * mocked — a Neon test branch via describeWithDb (skipped, never false-green, when
 * TEST_DATABASE_URL is unset). Covers the two new behaviours of the section:
 *   • the `erg` scope (row | ski | bike) picks WHICH erg the trend + volume build
 *     for — the trend title names the machine, never a bare "ergo";
 *   • series cards carry the chart contract: a trend is a 'line' with `series_axis`
 *     y-labels derived from real values, a volume card is 'bars';
 *   • the best-splits card stays COMPARATIVE across all three ergos.
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildErgoSection } from '@/lib/athlete/analytics/ergo';
import { resolvePeriod } from '@/lib/athlete/analytics';
import type { AnalyticsCard } from '@/lib/athlete/analytics';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, makeAssignment, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const period = resolvePeriod({ key: 'month', now: NOW });

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function cardById(cards: AnalyticsCard[], id: string): AnalyticsCard {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`card ${id} not found (have: ${cards.map((x) => x.id).join(', ')})`);
  return c;
}

/** Seed one execution → one ergo segment (explicit modality, /500m + power + dist). */
async function seedErgoSegment(params: {
  sql: ReturnType<typeof getTestSql>;
  fx: Fixture;
  assignmentId: number;
  daysAgo: number;
  modality: 'row' | 'ski' | 'bike';
  pace500: number;
  powerW: number;
  strokeSpm: number;
  distanceMeters: number;
}): Promise<void> {
  const { sql, fx, assignmentId, daysAgo, modality, pace500, powerW, strokeSpm, distanceMeters } = params;
  const started = daysAgoIso(daysAgo);
  const exec = await sql<Array<{ id: string }>>`
    insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source)
    values (${assignmentId}, ${fx.athleteId}, ${started}::timestamptz, ${started}::timestamptz, 'manual')
    returning id::text
  `;
  const executionId = Number(exec[0]!.id);
  await sql`
    insert into segment_executions (
      execution_id, position, started_at, ended_at, modality,
      distance_meters, avg_pace_s_per_500m, avg_power_w, stroke_rate_spm, source
    ) values (
      ${executionId}, 0, ${started}::timestamptz, ${started}::timestamptz, ${modality},
      ${distanceMeters}, ${pace500}, ${powerW}, ${strokeSpm}, 'demo'
    )
  `;
}

describeWithDb('ergo analytics section (redesign, real DB)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const tpl = await makeTemplate({ fx, name: 'Ergo intervals', format: 'intervals' });

    // Row: two sessions in two different weeks (trend + weekly volume bars).
    const aRow1 = await makeAssignment({ fx, templateId: tpl, scheduledForIso: daysAgoIso(12).slice(0, 10), status: 'completed' });
    await seedErgoSegment({ sql, fx, assignmentId: aRow1, daysAgo: 12, modality: 'row', pace500: 118, powerW: 250, strokeSpm: 28, distanceMeters: 2000 });
    const aRow2 = await makeAssignment({ fx, templateId: tpl, scheduledForIso: daysAgoIso(3).slice(0, 10), status: 'completed' });
    await seedErgoSegment({ sql, fx, assignmentId: aRow2, daysAgo: 3, modality: 'row', pace500: 110, powerW: 280, strokeSpm: 30, distanceMeters: 3000 });

    // Ski: one session (splits comparison + ski-scoped trend needs_logging with 1 pt).
    const aSki = await makeAssignment({ fx, templateId: tpl, scheduledForIso: daysAgoIso(5).slice(0, 10), status: 'completed' });
    await seedErgoSegment({ sql, fx, assignmentId: aSki, daysAgo: 5, modality: 'ski', pace500: 125, powerW: 190, strokeSpm: 32, distanceMeters: 1000 });
  }, 60_000);

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  test('erg=row scopes the trend to Remo with a line chart + real y-axis labels', async () => {
    const section = await buildErgoSection({ athlete_id: fx.athleteId, period, erg: 'row' }, sql);
    const trend = cardById(section.cards, 'ergo_trend');
    expect(trend.title_es).toContain('Remo');
    expect(trend.title_es).toContain('/500 m');
    expect(trend.series_kind).toBe('line');
    // Two row sessions → two plotted points, y-axis labels from the real paces.
    expect(trend.series.length).toBe(2);
    expect(trend.availability).toBe('real');
    expect(trend.series_axis).not.toBeNull();
    // Fastest (110 → 1:50) at the bottom, slowest (118 → 1:58) at the top.
    expect(trend.series_axis).toEqual({ min_display: '1:50', max_display: '1:58' });
    // Latest pace surfaces as the accented row (never a bare "ergo").
    const pace = trend.rows.find((r) => r.id === 'pace');
    expect(pace?.value).toBe('1:50 /500m');
  });

  test('erg=row builds a weekly-volume BARS card from the row distances', async () => {
    const section = await buildErgoSection({ athlete_id: fx.athleteId, period, erg: 'row' }, sql);
    const vol = cardById(section.cards, 'ergo_volume');
    expect(vol.title_es).toContain('Remo');
    expect(vol.series_kind).toBe('bars');
    expect(vol.availability).toBe('real');
    // 2000 + 3000 m = 5.0 km total across 2 sessions.
    expect(vol.primary?.value).toBe('5.0');
    expect(vol.primary?.unit).toBe('km');
    expect(vol.primary?.side?.value).toBe('2');
  });

  test('erg=ski re-scopes the trend to SkiErg (title names the machine)', async () => {
    const section = await buildErgoSection({ athlete_id: fx.athleteId, period, erg: 'ski' }, sql);
    const trend = cardById(section.cards, 'ergo_trend');
    expect(trend.title_es).toContain('SkiErg');
    // One ski session → not enough for a trend yet, honest tag.
    expect(trend.availability).toBe('needs_logging');
  });

  test('best-splits card stays COMPARATIVE across ergos (row + ski rows)', async () => {
    const section = await buildErgoSection({ athlete_id: fx.athleteId, period, erg: 'row' }, sql);
    const splits = cardById(section.cards, 'ergo_splits');
    const labels = splits.rows.map((r) => r.label);
    expect(labels.some((l) => l.startsWith('Remo'))).toBe(true);
    expect(labels.some((l) => l.startsWith('SkiErg'))).toBe(true);
    // Row best = fastest of 118/110 → 1:50.
    const rowRow = splits.rows.find((r) => r.id === 'row');
    expect(rowRow?.value).toBe('1:50 /500m');
  });

  test('erg defaults to row when omitted', async () => {
    const section = await buildErgoSection({ athlete_id: fx.athleteId, period }, sql);
    const trend = cardById(section.cards, 'ergo_trend');
    expect(trend.title_es).toContain('Remo');
  });
});
