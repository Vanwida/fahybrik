/**
 * Plan data-integrity guard (real DB).
 *
 * Every `template_segments.prescription_json` and `block_exercises.prescription_json`
 * in the database MUST validate against the shared Zod prescription schema.
 * This is a REGRESSION FENCE: if a future seed / backfill / migration writes a
 * prescription shape the model rejects (e.g. a stray free-text target, an
 * out-of-bounds zone, a renamed key), this test fails loudly with the offending
 * row ids — instead of the breakage surfacing later in the editor / analytics /
 * iOS.
 *
 * Nothing is mocked (project rule): it reads the real rows of whatever branch
 * TEST_DATABASE_URL points at and runs each through `safeParsePrescription`.
 *
 * It asserts BOTH (a) the plan tables actually carry prescriptions (so an empty
 * branch can't false-green it) and (b) zero of them are invalid. It used to
 * lean on the plan seeded in the Neon demo branch for (a), and failed on any
 * other branch. It now seeds a small plan of its own — one line of each
 * prescription family a coach writes — and removes it afterwards; (a) checks
 * the scan actually read those rows, and (b) still judges EVERY row, so on a
 * populated branch it fences the real plan exactly as before.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { safeParsePrescription } from '@fahybrid/shared/domain/prescription';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, makeLibraryBlock, makeTemplate, type Fixture } from '../utils/db-fixtures';

interface Row {
  id: string;
  prescription_json: unknown;
}

type Table = 'template_segments' | 'block_exercises';

// One line per family: strength sets against a %1RM, a structured run series,
// a steady erg against a zone, and a legacy run pyramid (sets only).
const STRENGTH = {
  scheme: 'sets',
  modality: 'strength',
  sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 75 }, rest_s: 180 }],
};
const RUN_SERIES = {
  scheme: 'intervals',
  modality: 'run',
  structure: [
    {
      role: 'main',
      elements: [
        {
          times: 6,
          elements: [
            { kind: 'work', measure: { type: 'distance', m: 800 }, target: { type: 'pace_zone', zone: 4 } },
            { kind: 'recovery', measure: { type: 'duration', s: 90 }, target: null, recovery_mode: 'trote' },
          ],
        },
      ],
    },
  ],
};
const ERG_STEADY = { scheme: 'steady', modality: 'row', total_s: 1200, target: { kind: 'hr_zone', value: 2 } };
const RUN_PYRAMID = {
  scheme: 'intervals',
  modality: 'run',
  sets: [1200, 1000, 800].map((m) => ({ measure: { kind: 'distance', meters: m }, target: { kind: 'hr_zone', value: 4 } })),
};

describeWithDb('plan prescription_json integrity (real DB)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const seeded: Record<Table, string[]> = { template_segments: [], block_exercises: [] };

  beforeAll(async () => {
    await sql`select 1 as ok`;
    fx = await makeCoachAndAthlete(sql);
    const squat = await makeExercise({ fx });
    const run = await makeExercise({ fx, category: 'cardio', modality: 'run' });
    const row = await makeExercise({ fx, category: 'cardio', modality: 'row' });
    const json = (p: object) => sql.json(p as Parameters<typeof sql.json>[0]);

    const templateId = await makeTemplate({ fx, name: 'Semana tipo' });
    const lines: Array<[number, object]> = [[squat, STRENGTH], [run, RUN_SERIES], [row, ERG_STEADY]];
    for (const [position, [exerciseId, prescription]] of lines.entries()) {
      const [r] = await sql<Array<{ id: string }>>`
        insert into template_segments (template_id, position, exercise_id, prescription_json)
        values (${templateId}, ${position}, ${exerciseId}, ${json(prescription)})
        returning id::text
      `;
      seeded.template_segments.push(r!.id);
    }

    const blockId = await makeLibraryBlock({ fx, title: 'Fuerza + pirámide', description: '' });
    const items: Array<[number, object]> = [[squat, STRENGTH], [run, RUN_PYRAMID]];
    for (const [position, [exerciseId, prescription]] of items.entries()) {
      const [r] = await sql<Array<{ id: string }>>`
        insert into block_exercises (block_id, position, exercise_id, prescription_json)
        values (${blockId}, ${position}, ${exerciseId}, ${json(prescription)})
        returning id::text
      `;
      seeded.block_exercises.push(r!.id);
    }
  }, 60_000);

  afterAll(async () => {
    await fx?.cleanup(); // templates (and their lines) with the coach; blocks + exercises by registry
    await closeTestSql();
  });

  async function assertAllValid(table: Table) {
    const rows = await sql<Array<Row>>`
      select id::text as id, prescription_json
      from ${sql(table)}
      where prescription_json is not null
    `;

    // Guard against a false green on an empty branch: the scan read the plan
    // rows — at the very least the ones this test wrote.
    expect(rows.length, `${table} should carry prescriptions`).toBeGreaterThan(0);
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(seeded[table]));

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
