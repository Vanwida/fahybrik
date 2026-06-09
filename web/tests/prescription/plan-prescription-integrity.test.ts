/**
 * Plan data-integrity guard (real DB).
 *
 * Every `template_segments.prescription_json` and `block_exercises.prescription_json`
 * in the seeded plan MUST validate against the shared Zod prescription schema.
 * This is a REGRESSION FENCE: if a future seed / backfill / migration writes a
 * prescription shape the model rejects (e.g. a stray free-text target, an
 * out-of-bounds zone, a renamed key), this test fails loudly with the offending
 * row ids — instead of the breakage surfacing later in the editor / analytics /
 * iOS.
 *
 * Nothing is mocked (project rule): it reads the real seeded rows from the Neon
 * test branch (a copy-on-write clone of main) and runs each through
 * `safeParsePrescription`. It is read-only — seeds nothing, cleans up nothing.
 *
 * It asserts BOTH (a) the plan actually carries prescriptions (so an empty branch
 * can't false-green it) and (b) zero of them are invalid.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { safeParsePrescription } from '@fahybrid/shared/domain/prescription';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

interface Row {
  id: string;
  prescription_json: unknown;
}

describeWithDb('plan prescription_json integrity (real DB)', () => {
  const sql = getTestSql();

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterAll(async () => {
    await closeTestSql();
  });

  async function assertAllValid(table: 'template_segments' | 'block_exercises') {
    const rows = await sql<Array<Row>>`
      select id::text as id, prescription_json
      from ${sql(table)}
      where prescription_json is not null
    `;

    // Guard against a false green on an empty/un-seeded branch.
    expect(rows.length, `${table} should carry seeded prescriptions`).toBeGreaterThan(0);

    const invalid: Array<{ id: string; issue: string }> = [];
    for (const r of rows) {
      const res = safeParsePrescription(r.prescription_json);
      if (!res.success) {
        invalid.push({ id: r.id, issue: res.error.issues[0]?.message ?? 'unknown' });
      }
    }

    // Surface the offending ids in the failure message for fast triage.
    expect(invalid, `invalid ${table} prescriptions: ${JSON.stringify(invalid).slice(0, 600)}`).toEqual([]);
  }

  test('every template_segments.prescription_json validates against the schema', async () => {
    await assertAllValid('template_segments');
  });

  test('every block_exercises.prescription_json validates against the schema', async () => {
    await assertAllValid('block_exercises');
  });
});
