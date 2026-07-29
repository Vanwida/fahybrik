/**
 * Real-DB API-level test for the #28 PROPOSAL service (the /proposal route's core,
 * minus the HTTP/session shell). Creates a throwaway microcycle owned by the seed
 * coach, then drives buildImportProposalFromRequest against a REAL workbook fixture
 * + the real per-coach exercise resolver, asserting the TYPED per-day proposal and
 * that ownership is enforced. LLM is disabled (llmAssist:null) so the grammar half
 * is exercised deterministically. Saves nothing. Skips loudly without
 * TEST_DATABASE_URL; skips the xlsx assertions if the workbook fixture is absent.
 *
 * El fixture se pasa como `xlsx_base64`, igual que lo sube un coach: el servicio ya
 * no tiene workbook por defecto (antes caía al de UN coach concreto en tiempo de
 * ejecución), así que este test recorre exactamente el camino de producción.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  buildImportProposalFromRequest,
  ImportError,
} from '@/lib/import/proposal-service';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

type Sql = ReturnType<typeof getTestSql>;
const SEED_COACH_ID = Number(process.env.SEED_COACH_ID ?? 29);
const XLSX = resolve(process.cwd(), '..', 'docs', 'Plantilla_HYROX_12sem (1) 2.xlsx');
const hasXlsx = existsSync(XLSX);

describeWithDb('#28 proposal service — request → typed proposal (real DB)', () => {
  let sql: Sql;
  let microcycleId = 0;

  beforeAll(async () => {
    sql = getTestSql();
    const rows = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name)
      values (${SEED_COACH_ID}, ${`IMPORT-PROPOSAL-TEST-${Date.now()}`})
      returning id::text
    `;
    microcycleId = Number(rows[0]!.id);
  });

  afterAll(async () => {
    if (microcycleId) {
      await sql`delete from program_month_templates where id = ${microcycleId}`;
    }
    await closeTestSql();
  });

  test('rejects a foreign / missing microcycle (ownership)', async () => {
    await expect(
      buildImportProposalFromRequest({
        coach_id: SEED_COACH_ID,
        body: { microcycle_id: 2_000_000_000, variant: 'estandar', range_text: 'la 1' },
        client: sql,
        llmAssist: null,
      }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  test('rejects an out-of-season range (400 before any read)', async () => {
    await expect(
      buildImportProposalFromRequest({
        coach_id: SEED_COACH_ID,
        body: { microcycle_id: microcycleId, variant: 'estandar', range_text: 'de la 10 a la 14' },
        client: sql,
        llmAssist: null,
      }),
    ).rejects.toBeInstanceOf(ImportError);
  });

  (hasXlsx ? test : test.skip)(
    'range 1-4 estándar → 4 typed weeks, strength resolves, honest review split',
    async () => {
      const proposal = await buildImportProposalFromRequest({
        coach_id: SEED_COACH_ID,
        body: {
          microcycle_id: microcycleId,
          variant: 'estandar',
          range_text: 'de la semana 1 a la 4',
          xlsx_base64: readFileSync(XLSX).toString('base64'),
        },
        client: sql,
        llmAssist: null, // deterministic grammar half only
      });

      expect(proposal.weeks).toHaveLength(4);
      expect(proposal.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4]);
      for (const w of proposal.weeks) expect(w.days).toHaveLength(7);

      // The loop typed real items — some detected — and every item is TYPED
      // (a scheme + a prescription), never a free-text blob.
      expect(proposal.summary.total_items).toBeGreaterThan(0);
      expect(proposal.summary.detected).toBeGreaterThan(0);
      for (const w of proposal.weeks) {
        for (const d of w.days) {
          if (d.state === 'rest') {
            expect(d.sessions).toEqual([]);
            continue;
          }
          for (const it of d.sessions.flatMap((s) => s.blocks.flatMap((b) => b.items))) {
            expect(typeof it.prescription.scheme).toBe('string');
          }
        }
      }

      // Week 1 · Martes = Back Squat 5 rounds 10/10/8/8/6 → typed as a strength
      // set-scheme AND resolved to a catalog id via the real resolver.
      const martes = proposal.weeks[0]!.days.find((d) => d.day_of_week === 2)!;
      const squat = martes.sessions
        .flatMap((s) => s.blocks.flatMap((b) => b.items))
        .find((it) => /squat/i.test(it.exercise_name));
      expect(squat).toBeTruthy();
      expect(squat!.prescription.scheme).toBe('sets');
      expect(squat!.exercise_id).not.toBeNull();
    },
    // 4 weeks × 7 days each resolves many exercises against the DB over the
    // pooler — inherently slower than the 5s default.
    45_000,
  );

  test('pasted text → one typed day (no xlsx needed)', async () => {
    const proposal = await buildImportProposalFromRequest({
      coach_id: SEED_COACH_ID,
      body: {
        microcycle_id: microcycleId,
        variant: 'estandar',
        range_text: 'la 1',
        pasted_text: 'Martes\nDeadlift 5r 10/10/8/6/4',
      },
      client: sql,
      llmAssist: null,
    });
    expect(proposal.weeks).toHaveLength(1);
    const day = proposal.weeks[0]!.days.find((d) => d.day_of_week === 2)!;
    expect(day.sessions.length).toBeGreaterThan(0);
    const dl = day.sessions.flatMap((s) => s.blocks.flatMap((b) => b.items))[0]!;
    expect(dl.prescription.scheme).toBe('sets');
    expect(Array.isArray(dl.prescription.sets)).toBe(true);
  });
});
