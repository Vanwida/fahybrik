/**
 * Real-DB guard: a library template must keep its REAL dose.
 *
 * `template_segments` stores both `prescription_json` (the structured truth) and
 * `params_json` (a lossy scalar mirror). The loader read only the mirror, so a
 * Back Squat stored as 4 sets of 10/8/8/6 @65-80%RM came back as
 * `{reps_scheme:"10/8/8/6"}` — which the legacy bridge cannot decode — and the
 * coach's own template surfaced in review as "sin dosis".
 */
import { afterAll, expect, it } from 'vitest';
import { loadTemplateAsBlocks } from '@/lib/dashboard/coach/ai/template-to-blocks';
import { setMeasure, setTarget } from '@fahybrid/shared/domain/prescription';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('loadTemplateAsBlocks keeps the structured prescription', () => {
  let fx: Fixture;

  afterAll(async () => {
    if (fx) await fx.cleanup();
    await closeTestSql();
  });

  it('reads prescription_json rather than re-deriving it from the lossy mirror', async () => {
    const sql = getTestSql();
    fx = await makeCoachAndAthlete(sql);
    const templateId = await makeTemplate({ fx, name: 'Fuerza de pierna', format: 'strength_block' });

    // Exactly the shape the demo library holds: a real per-set prescription, and a
    // params_json mirror whose `reps_scheme` string no bridge can decode.
    await sql`
      insert into template_segments (template_id, position, exercise_id, params_json, prescription_json)
      select ${templateId}, 1, e.id,
        '{"sets":4,"load_pct":65,"reps_scheme":"10/8/8/6","load_pct_range":"65-80"}'::jsonb,
        '{"scheme":"sets","modality":"strength","sets":[
           {"measure":{"kind":"reps","value":10},"target":{"kind":"percent_rm","min":65,"max":80}},
           {"measure":{"kind":"reps","value":8},"target":{"kind":"percent_rm","min":65,"max":80}}
         ]}'::jsonb
      from exercises e where e.modality = 'strength' limit 1
    `;

    const blocks = await loadTemplateAsBlocks(templateId, fx.coachId, sql);
    const item = blocks[0]!.items[0]!;

    expect(item.prescription_json).toBeDefined();
    const sets = item.prescription_json!.sets ?? [];
    expect(sets).toHaveLength(2);
    expect(setMeasure(sets[0]!)).toEqual({ kind: 'reps', value: 10 });
    expect(setTarget(sets[0]!)).toEqual({ kind: 'percent_rm', min: 65, max: 80 });
    // The mirror is still carried for the legacy readers that want it.
    expect(item.params_json).toMatchObject({ reps_scheme: '10/8/8/6' });
  });
});
