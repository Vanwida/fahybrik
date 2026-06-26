/**
 * rollup_block_needs_review.ts — roll the per-EXERCISE review flag up to the
 * BLOCK level for the Biblioteca de Bloques (table `blocks`, coach_id IS NULL).
 *
 * WHY
 * ---
 * The modality re-typing passes (retype_run / _erg / _strength / _functional /
 * _core_mobility_blocks) each set `block_exercises.needs_review` truthfully PER
 * ROW — true when a line could not be fully typed (a set missing its intensity
 * target / load). Most of them deliberately DO NOT touch `blocks.needs_review`,
 * because a block is multi-modality and no single pass owns the whole block.
 * This script closes that gap: it sets the block-level flag from the union of
 * its rows so the coach UI can badge a block that contains ANY un-typed line.
 *
 * RULE
 * ----
 *   blocks.needs_review = true  ⇔  ANY of the block's block_exercises either
 *     (a) has needs_review = true, OR
 *     (b) has a prescription set with NO intensity target/load
 *         (neither a per-set target nor a block-level prescription target),
 *   else false.
 *
 * (b) is a belt-and-suspenders check so a row the typing passes missed (or one
 * edited by hand) still flags its block. It reuses the SHARED canonical readers
 * (setTarget / prescriptionTarget) — single source of truth, no re-derivation.
 *
 * Idempotent: re-running recomputes the same flag from the same rows.
 * Host-guarded to the demo branch ep-flat-wind. Dry-run with --dry-run.
 *
 * Run: cd infra && tsx scripts/rollup_block_needs_review.ts [--dry-run]
 */
import {
  prescriptionTarget,
  safeParsePrescription,
  setTarget,
  type Prescription,
  type PrescriptionSet,
} from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.js';

const DRY_RUN = process.argv.includes('--dry-run');
const DEMO_HOST = 'ep-flat-wind';

interface BeRow {
  block_id: string;
  needs_review: boolean;
  prescription_json: unknown;
}

/** A row is "incomplete" if its flag is set OR any of its sets has no intensity. */
function rowIsIncomplete(row: BeRow): boolean {
  if (row.needs_review) return true;
  if (row.prescription_json == null) return false; // no presc → rely on flag only
  const parsed = safeParsePrescription(row.prescription_json);
  if (!parsed.success) return true; // unparseable presc → must be reviewed
  const p = parsed.data as Prescription;
  const sets: PrescriptionSet[] = p.sets ?? [];
  if (sets.length === 0) return false; // scheme-only line (e.g. AMRAP shell) — flag governs
  const blockTarget = prescriptionTarget(p);
  // Missing intensity = no per-set target AND no block-level target.
  return sets.some((s) => setTarget(s) === undefined && blockTarget === undefined);
}

async function main(): Promise<void> {
  const sql = getSql();
  const host = process.env.DATABASE_URL?.match(/@([^/:]+)/)?.[1] ?? '?';
  if (!host.includes(DEMO_HOST)) {
    throw new Error(`Refusing to run: DATABASE_URL host is "${host}", expected the demo branch ${DEMO_HOST}.`);
  }
  process.stdout.write(`[rollup_block_needs_review] host=${host} mode=${DRY_RUN ? 'dry-run' : 'apply'}\n`);

  try {
    // All library blocks + their rows.
    const blocks = await sql<Array<{ id: string; needs_review: boolean }>>`
      select id::text, needs_review from blocks where coach_id is null order by id`;
    const rows = await sql<BeRow[]>`
      select be.block_id::text, be.needs_review, be.prescription_json
      from block_exercises be
      join blocks b on b.id = be.block_id
      where b.coach_id is null`;

    const rowsByBlock = new Map<string, BeRow[]>();
    for (const r of rows) {
      const list = rowsByBlock.get(r.block_id) ?? [];
      list.push(r);
      rowsByBlock.set(r.block_id, list);
    }

    const desired = new Map<string, boolean>();
    for (const b of blocks) {
      const list = rowsByBlock.get(b.id) ?? [];
      // A block with no rows can't assert completeness → leave it flagged.
      desired.set(b.id, list.length === 0 ? true : list.some(rowIsIncomplete));
    }

    const before = blocks.filter((b) => b.needs_review).length;
    const after = blocks.filter((b) => desired.get(b.id)).length;
    const changes = blocks.filter((b) => b.needs_review !== desired.get(b.id));

    process.stdout.write(`  library blocks ........... ${blocks.length}\n`);
    process.stdout.write(`  flagged BEFORE ........... ${before}\n`);
    process.stdout.write(`  flagged AFTER ............ ${after}\n`);
    process.stdout.write(`  rows changed ............. ${changes.length}\n`);
    for (const c of changes) {
      process.stdout.write(`    block ${c.id}: ${c.needs_review} → ${desired.get(c.id)}\n`);
    }

    if (!DRY_RUN) {
      for (const b of blocks) {
        const want = desired.get(b.id)!;
        if (b.needs_review !== want) {
          await sql`update blocks set needs_review = ${want} where id = ${b.id}::bigint`;
        }
      }
      process.stdout.write(`  applied: ${changes.length} block(s) updated.\n`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  process.stderr.write(`rollup_block_needs_review failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
