/**
 * parse_blocks_structured.ts — add the STRUCTURED layer to the Biblioteca de
 * Bloques (migration 0038).
 *
 * Each of the 97 blocks (table `blocks`, 0037) stores Pablo's prescription
 * VERBATIM in `description` (the source of truth). This script parses that text
 * into `block_exercises` rows: real catalog exercises (FK to `exercises`) +
 * canonical params (the SAME shape the studio editor + assignment-detail
 * loader consume — sets/reps/load_kg/load_pct/rpe/duration_seconds/
 * distance_meters/pace_sec_per_km/hr_zone/rest_seconds). The verbatim is kept
 * untouched on the block.
 *
 * HONESTY CONTRACT: we do NOT invent exercises or params that aren't in Pablo's
 * text. Blocks we can't map with confidence (dense WODs, race simulations,
 * ambiguous formats) are flagged `blocks.needs_review = true`, keep their
 * verbatim, and are listed in the run report for Pablo. We never fabricate fake
 * structure to "fill" a block.
 *
 * The PURE parsing core lives in parse_blocks_lib.ts (no DB) so it is unit
 * tested independently. This file owns only the DB read/write + report.
 *
 * Idempotent: re-running deletes a block's block_exercises before re-inserting
 * and re-derives needs_review. Created exercises upsert on slug.
 *
 * Run: pnpm --filter @fahybrid/infra parse:blocks
 */
import { getSql } from './_db.js';
import {
  EXERCISES_TO_CREATE,
  parseBlock,
  type Params,
} from './parse_blocks_lib.js';

type Sql = ReturnType<typeof getSql>;

async function ensureCreatedExercises(sql: Sql): Promise<void> {
  for (const e of EXERCISES_TO_CREATE) {
    await sql`
      insert into exercises (
        slug, name, category, primary_muscle_groups, equipment,
        default_metrics_json, source
      ) values (
        ${e.slug}, ${e.name}, ${e.category}::exercise_category,
        ${e.primary_muscle_groups}, ${e.equipment},
        ${sql.json(e.default_metrics_json)}, 'fahybrik_canonical'
      )
      on conflict (slug) do update set
        name = excluded.name,
        category = excluded.category,
        primary_muscle_groups = excluded.primary_muscle_groups,
        equipment = excluded.equipment,
        default_metrics_json = excluded.default_metrics_json,
        updated_at = now()
    `;
  }
}

async function loadSlugToId(sql: Sql): Promise<Map<string, number>> {
  const rows = await sql<Array<{ id: string; slug: string }>>`
    select id::text, slug from exercises
  `;
  return new Map(rows.map((r) => [r.slug, Number(r.id)]));
}

type Report = {
  total: number;
  structured: number;
  needsReview: number;
  reviewList: Array<{ id: number; group: number; title: string; reason: string; verbatim: string }>;
  examples: Array<{ id: number; title: string; exercises: Array<{ slug: string; params: Params }> }>;
};

async function main(): Promise<void> {
  const sql = getSql();
  const report: Report = { total: 0, structured: 0, needsReview: 0, reviewList: [], examples: [] };
  try {
    await ensureCreatedExercises(sql);
    const slugToId = await loadSlugToId(sql);

    const blocks = await sql<
      Array<{ id: string; title: string; description: string; g: string }>
    >`
      select id::text, title, description, methodology_group_id::text as g
      from blocks where coach_id is null
      order by methodology_group_id, id
    `;
    report.total = blocks.length;

    for (const b of blocks) {
      const blockId = Number(b.id);
      const groupId = Number(b.g);
      const parsed = parseBlock(groupId, b.description);

      // resolve slugs → ids; drop unresolved (shouldn't happen if alias known)
      const resolved = parsed.exercises
        .map((e) => ({ ...e, exercise_id: slugToId.get(e.slug) }))
        .filter((e): e is typeof e & { exercise_id: number } => e.exercise_id !== undefined);

      const dropped = parsed.exercises.length - resolved.length;
      const needsReview = parsed.needs_review || resolved.length === 0;

      // idempotent: clear this block's structure, then re-insert.
      await sql.begin(async (tx) => {
        await tx`delete from block_exercises where block_id = ${blockId}`;
        let position = 0;
        for (const e of resolved) {
          await tx`
            insert into block_exercises (
              block_id, position, block_position, exercise_id,
              params_json, reps_scheme, notes
            ) values (
              ${blockId}, ${position}, ${e.block_position ?? 0}, ${e.exercise_id},
              ${tx.json(e.params as Parameters<typeof tx.json>[0])},
              ${e.reps_scheme ?? null}, ${e.notes ?? null}
            )
          `;
          position++;
        }
        await tx`
          update blocks set needs_review = ${needsReview} where id = ${blockId}
        `;
      });

      if (needsReview) {
        report.needsReview++;
        report.reviewList.push({
          id: blockId,
          group: groupId,
          title: b.title,
          reason:
            resolved.length === 0 && !parsed.needs_review
              ? 'all exercises unresolved against catalog'
              : (parsed.review_reason ?? 'flagged'),
          verbatim: b.description,
        });
      } else {
        report.structured++;
        if (report.examples.length < 5 && resolved.length >= 1) {
          report.examples.push({
            id: blockId,
            title: b.title,
            exercises: resolved.map((e) => ({ slug: e.slug, params: e.params })),
          });
        }
      }
      if (dropped > 0) {
        // surface silent drops (alias resolved but exercise row missing) — should be 0.
        console.warn(`[parse] block #${blockId}: dropped ${dropped} unresolved exercise(s)`);
      }
    }

    printReport(report);
  } finally {
    await sql.end();
  }
}

function printReport(r: Report): void {
  console.log('\n========== PARSE REPORT ==========');
  console.log(`Total blocks:      ${r.total}`);
  console.log(`Structured OK:     ${r.structured}`);
  console.log(`Needs review:      ${r.needsReview}`);
  console.log(`Exercises created: ${EXERCISES_TO_CREATE.length} (${EXERCISES_TO_CREATE.map((e) => e.slug).join(', ')})`);

  console.log('\n--- 5 structured examples ---');
  for (const ex of r.examples) {
    console.log(`#${ex.id} ${ex.title}`);
    for (const e of ex.exercises) console.log(`    ${e.slug}  ${JSON.stringify(e.params)}`);
  }

  console.log('\n--- NEEDS REVIEW (for Pablo) ---');
  for (const nr of r.reviewList) {
    console.log(`#${nr.id} g${nr.group} [${nr.reason}]\n    ${nr.title}\n    >> ${nr.verbatim}`);
  }
  console.log('==================================\n');
}

// Run directly (pnpm parse:blocks).
void main();
