/**
 * Real-DB tests for the athlete CARGA cards (#67). No SQL mocked — a Neon test
 * branch via describeWithDb (skipped, never false-green, when TEST_DATABASE_URL is
 * unset). Covers the engine reuse end-to-end:
 *   • enough RPE-logged sessions → Forma is a real 'line', Carga semanal real
 *     'bars', both free of NaN and carrying the chart contract;
 *   • too few RPE sessions → both cards gate honestly to needs_logging;
 *   • the recovery section wires both cards in, grouped BEFORE the device-sourced
 *     ACWR card (which reads a different, external source).
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildLoadCards } from '@/lib/athlete/analytics/load';
import { buildRecoverySection } from '@/lib/athlete/analytics/recovery';
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

/** One RPE-tagged execution (its own assignment — assignment_id is unique). */
async function seedRpeExecution(params: {
  sql: ReturnType<typeof getTestSql>;
  fx: Fixture;
  templateId: number;
  daysAgo: number;
  rpe: number;
  durationSec: number;
}): Promise<void> {
  const started = daysAgoIso(params.daysAgo);
  const assignmentId = await makeAssignment({
    fx: params.fx,
    templateId: params.templateId,
    scheduledForIso: started.slice(0, 10),
    status: 'completed',
  });
  await params.sql`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at,
      total_duration_seconds, perceived_exertion, source
    ) values (
      ${assignmentId}, ${params.fx.athleteId}, ${started}::timestamptz, ${started}::timestamptz,
      ${params.durationSec}, ${params.rpe}, 'manual'
    )
  `;
}

describeWithDb('athlete carga cards (#67, real DB)', () => {
  const sql = getTestSql();
  let rich: Fixture;
  let sparse: Fixture;

  beforeAll(async () => {
    rich = await makeCoachAndAthlete(sql);
    const richTpl = await makeTemplate({ fx: rich, name: 'Carga rica', format: 'intervals' });
    // 12 RPE sessions spread across ~10 weeks → well over the gate, multiple weeks.
    const plan = [3, 7, 10, 14, 21, 28, 35, 42, 49, 56, 63, 70];
    for (let i = 0; i < plan.length; i++) {
      await seedRpeExecution({
        sql,
        fx: rich,
        templateId: richTpl,
        daysAgo: plan[i]!,
        rpe: 5 + (i % 4), // 5..8
        durationSec: 3000 + (i % 3) * 600,
      });
    }

    sparse = await makeCoachAndAthlete(sql);
    const sparseTpl = await makeTemplate({ fx: sparse, name: 'Carga escasa', format: 'intervals' });
    // Only 3 RPE sessions → below the honesty gate.
    for (const d of [4, 12, 20]) {
      await seedRpeExecution({ sql, fx: sparse, templateId: sparseTpl, daysAgo: d, rpe: 6, durationSec: 3200 });
    }
  }, 60_000);

  afterAll(async () => {
    await rich.cleanup();
    await sparse.cleanup();
    await closeTestSql();
  });

  test('enough RPE → Forma is a real line with a plain-Spanish hero, no NaN', async () => {
    const cards = await buildLoadCards({ athlete_id: rich.athleteId, period }, sql);
    const form = cardById(cards, 'form');
    expect(form.availability).toBe('real');
    expect(form.series_kind).toBe('line');
    expect(form.series.length).toBeGreaterThan(1);
    expect(form.primary?.value).toBeTruthy();
    expect(form.series_axis).not.toBeNull();
    for (const p of form.series) {
      expect(Number.isFinite(p.height)).toBe(true);
      expect(p.height).toBeGreaterThanOrEqual(0.08);
      expect(p.height).toBeLessThanOrEqual(1);
      expect(typeof p.display).toBe('string');
    }
  });

  test('enough RPE → Carga semanal is real bars with integer loads, no NaN', async () => {
    const cards = await buildLoadCards({ athlete_id: rich.athleteId, period }, sql);
    const wl = cardById(cards, 'weekly_load');
    expect(wl.availability).toBe('real');
    expect(wl.series_kind).toBe('bars');
    expect(wl.series_axis).toBeNull();
    expect(wl.series.length).toBeGreaterThan(1);
    expect(['Subiendo', 'Bajando', 'Estable']).toContain(wl.primary?.value);
    for (const p of wl.series) {
      expect(p.display).toMatch(/^\d+$/);
      expect(Number.isFinite(p.height)).toBe(true);
    }
  });

  test('too few RPE sessions → both cards gate to needs_logging', async () => {
    const cards = await buildLoadCards({ athlete_id: sparse.athleteId, period }, sql);
    expect(cardById(cards, 'form').availability).toBe('needs_logging');
    expect(cardById(cards, 'weekly_load').availability).toBe('needs_logging');
  });

  test('recovery section wires both cards in, grouped before the ACWR card', async () => {
    const section = await buildRecoverySection({ athlete_id: rich.athleteId, period }, sql);
    const ids = section.cards.map((c) => c.id);
    expect(ids).toContain('form');
    expect(ids).toContain('weekly_load');
    // Internal-load cards sit before the external device-sourced ACWR card.
    expect(ids.indexOf('form')).toBeLessThan(ids.indexOf('load_acwr'));
    expect(ids.indexOf('weekly_load')).toBeLessThan(ids.indexOf('load_acwr'));
  });
});
