/**
 * Real-DB end-to-end test for the #28 import ORCHESTRATOR: reads Pablo's REAL
 * 12-week xlsx, runs it through the grammar + the per-coach exercise resolver,
 * and asserts the typed per-day proposal. Nothing is written. Skips loudly
 * without TEST_DATABASE_URL. Uses an existing demo coach (SEED_COACH_ID, default
 * 29) so resolveExercise has a real catalog to hit.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { buildImportProposal } from '@/lib/import/build-proposal';
import { readPlanWorkbook } from '@/lib/import/xlsx-reader';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

type Sql = ReturnType<typeof getTestSql>;
const SEED_COACH_ID = Number(process.env.SEED_COACH_ID ?? 29);
const XLSX = resolve(process.cwd(), '..', 'docs', 'Plantilla_HYROX_12sem (1) 2.xlsx');

describeWithDb('#28 import orchestrator — real xlsx → typed proposal (real DB)', () => {
  let sql: Sql;
  beforeAll(() => {
    sql = getTestSql();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  test('Semana 1 estándar → 7 days, strength resolves, honest review split', async () => {
    if (!existsSync(XLSX)) {
      console.warn('[#28] real xlsx not found, skipping:', XLSX);
      return;
    }
    const weeks = await readPlanWorkbook(XLSX, 'estandar', [1]);
    expect(weeks).toHaveLength(1);

    const proposal = await buildImportProposal({ coach_id: SEED_COACH_ID, weeks, client: sql });
    const wk = proposal.weeks[0]!;
    expect(wk.week).toBe(1);
    expect(wk.days).toHaveLength(7);

    // The whole loop produced typed items, some detected, honest review for dense.
    expect(proposal.summary.total_items).toBeGreaterThan(0);
    expect(proposal.summary.detected).toBeGreaterThan(0);

    // Every non-rest day has a session; every item carries a typed prescription
    // (never a free-text blob) and a scheme.
    for (const day of wk.days) {
      if (day.state === 'rest') {
        expect(day.session).toBeNull();
        continue;
      }
      expect(day.session).not.toBeNull();
      for (const block of day.session!.blocks) {
        for (const it of block.items) {
          expect(it.prescription).toBeTruthy();
          expect(typeof it.prescription.scheme).toBe('string');
        }
      }
    }

    // Martes = Fuerza Tren inferior "5 rounds Back Squat … 10/10/8/8/6 — 60/65…":
    // the back squat must type as a strength set-scheme AND resolve to a catalog id.
    const martes = wk.days.find((d) => d.day_of_week === 2)!;
    const squat = martes
      .session!.blocks.flatMap((b) => b.items)
      .find((it) => /squat/i.test(it.exercise_name));
    expect(squat).toBeTruthy();
    expect(squat!.prescription.scheme).toBe('sets');
    expect(Array.isArray(squat!.prescription.sets)).toBe(true);
    expect(squat!.exercise_id).not.toBeNull(); // resolved via alias/name to the catalog
  });
});
