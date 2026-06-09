/**
 * Backfill `prescription_json` for `block_exercises` + `template_segments`
 * (migration 0043) from the LEGACY storage shape (`params_json` +
 * `notes`/`reps_scheme`).
 *
 * The conversion logic lives in the SHARED domain so web/iOS/infra agree:
 *   @fahybrid/shared/domain/prescription → legacyRowToPrescription(...)
 *
 * HARD RULE — DO NOT GUESS
 * ------------------------
 * When a row's per-set detail can't be parsed unambiguously into the model, we
 * still write the best STRUCTURED-from-params prescription, but we FLAG it:
 *   - block_exercises → set needs_review = true (column added in 0043)
 *   - template_segments → collected in the report (no per-row flag column)
 * The original params_json / notes / reps_scheme are NEVER mutated. We never
 * fabricate reps or loads.
 *
 * Idempotent: only rows where prescription_json IS NULL are converted, so
 * re-running is a no-op. Pass --dry-run to compute + report without writing.
 *
 *   pnpm --filter @fahybrid/infra exec tsx scripts/backfill_prescriptions.ts
 *   pnpm --filter @fahybrid/infra exec tsx scripts/backfill_prescriptions.ts --dry-run
 *
 * The flagged list (ids + reasons + the preserved legacy text) is written to a
 * timestamped JSON report under infra/reports/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';
import {
  BLOCK_EXERCISE_KEYS,
  TEMPLATE_SEGMENT_KEYS,
  legacyRowToPrescription,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = resolve(HERE, '..', 'reports');

const DRY_RUN = process.argv.includes('--dry-run');

interface LegacyDbRow {
  id: string;
  params_json: Record<string, unknown> | null;
  reps_scheme?: string | null;
  notes: string | null;
}

interface TableStats {
  total: number;
  converted_with_sets: number; // explicit per-set sets[]
  converted_params_only: number; // structured from params, no per-set detail
  needs_review: number;
  skipped_already_done: number;
}

interface FlaggedRow {
  table: string;
  id: string;
  reasons: string[];
  // The legacy text we deliberately did NOT parse — kept intact in the DB.
  params_json: Record<string, unknown> | null;
  reps_scheme?: string | null;
  notes: string | null;
}

function emptyStats(total: number): TableStats {
  return {
    total,
    converted_with_sets: 0,
    converted_params_only: 0,
    needs_review: 0,
    skipped_already_done: 0,
  };
}

function out(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

// Narrow a Prescription to the JSON shape postgres.js `sql.json` accepts.
// The value is a plain object validated by the shared Zod schema, so the
// round-trip through JSON is lossless.
function asJson(p: Prescription): Parameters<Sql['json']>[0] {
  return JSON.parse(JSON.stringify(p)) as Parameters<Sql['json']>[0];
}

/** True when the prescription carries explicit per-set rep/load detail. */
function hasExplicitSets(p: Prescription): boolean {
  if (!p.sets || p.sets.length === 0) return false;
  return p.sets.some((s) => s.reps !== undefined || s.load !== undefined);
}

async function backfillBlockExercises(
  sql: Sql,
  flagged: FlaggedRow[],
): Promise<TableStats> {
  const rows = await sql<LegacyDbRow[]>`
    select id::text as id, params_json, reps_scheme, notes
    from block_exercises
    order by id
  `;
  const stats = emptyStats(rows.length);

  for (const row of rows) {
    const result = legacyRowToPrescription(
      { params_json: row.params_json, reps_scheme: row.reps_scheme ?? null, notes: row.notes },
      BLOCK_EXERCISE_KEYS,
    );
    accumulate(stats, result.prescription);
    if (result.needs_review) {
      stats.needs_review += 1;
      flagged.push({
        table: 'block_exercises',
        id: row.id,
        reasons: result.review_reasons,
        params_json: row.params_json,
        reps_scheme: row.reps_scheme ?? null,
        notes: row.notes,
      });
    }

    if (!DRY_RUN) {
      await sql`
        update block_exercises
        set prescription_json = ${sql.json(asJson(result.prescription))},
            needs_review = ${result.needs_review},
            updated_at = now()
        where id = ${row.id}::bigint
          and prescription_json is null
      `;
    }
  }
  return stats;
}

async function backfillTemplateSegments(
  sql: Sql,
  flagged: FlaggedRow[],
): Promise<TableStats> {
  const rows = await sql<LegacyDbRow[]>`
    select id::text as id, params_json, notes
    from template_segments
    order by id
  `;
  const stats = emptyStats(rows.length);

  for (const row of rows) {
    // template_segments has no reps_scheme column → pass null; the parser then
    // relies on params + (optionally) a notes load sequence only.
    const result = legacyRowToPrescription(
      { params_json: row.params_json, reps_scheme: null, notes: row.notes },
      TEMPLATE_SEGMENT_KEYS,
    );
    accumulate(stats, result.prescription);
    if (result.needs_review) {
      stats.needs_review += 1;
      flagged.push({
        table: 'template_segments',
        id: row.id,
        reasons: result.review_reasons,
        params_json: row.params_json,
        notes: row.notes,
      });
    }

    if (!DRY_RUN) {
      await sql`
        update template_segments
        set prescription_json = ${sql.json(asJson(result.prescription))},
            updated_at = now()
        where id = ${row.id}::bigint
          and prescription_json is null
      `;
    }
  }
  return stats;
}

function accumulate(stats: TableStats, p: Prescription): void {
  if (hasExplicitSets(p)) stats.converted_with_sets += 1;
  else stats.converted_params_only += 1;
}

function printStats(label: string, s: TableStats): void {
  out(`\n${label}`);
  out(`  total rows ................ ${s.total}`);
  out(`  with explicit sets[] ...... ${s.converted_with_sets}`);
  out(`  params-only ............... ${s.converted_params_only}`);
  out(`  flagged needs_review ...... ${s.needs_review}`);
}

async function main(): Promise<void> {
  const sql = getSql();
  const flagged: FlaggedRow[] = [];
  try {
    out(`[backfill_prescriptions] mode=${DRY_RUN ? 'dry-run' : 'apply'} — converting legacy rows…`);

    const beStats = await backfillBlockExercises(sql, flagged);
    const tsStats = await backfillTemplateSegments(sql, flagged);

    printStats('block_exercises:', beStats);
    printStats('template_segments:', tsStats);

    const totalRows = beStats.total + tsStats.total;
    const totalSets = beStats.converted_with_sets + tsStats.converted_with_sets;
    const totalParamsOnly = beStats.converted_params_only + tsStats.converted_params_only;
    const totalFlagged = beStats.needs_review + tsStats.needs_review;

    out('\n=== TOTAL ===');
    out(`  N rows total .............. ${totalRows}`);
    out(`  M with explicit sets[] .... ${totalSets}`);
    out(`  K params-only ............. ${totalParamsOnly}`);
    out(`  J needs_review ............ ${totalFlagged}`);

    // Always write the flagged report (even in dry-run) for review.
    mkdirSync(REPORTS_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = resolve(REPORTS_DIR, `prescriptions_backfill_${stamp}.json`);
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          mode: DRY_RUN ? 'dry-run' : 'apply',
          stats: { block_exercises: beStats, template_segments: tsStats },
          flagged_count: totalFlagged,
          flagged,
        },
        null,
        2,
      ),
      'utf8',
    );
    out(`\nFlagged report (${totalFlagged} rows) → ${reportPath}`);

    if (DRY_RUN) out('\n[dry-run] nothing written to the database.');
    else out('\n[apply] prescription_json written (only where it was NULL).');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  process.stderr.write(
    `Backfill failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
