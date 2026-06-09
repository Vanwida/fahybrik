/**
 * migrate_load_to_target — convert existing `prescription_json` rows from the
 * pre-unification shape (strength-only `load`, scalar `reps`/`distance_m`/
 * `duration_s`/`hr_zone`) to the UNIFIED model:
 *
 *   set.load            → set.target           (Load → Target)
 *   set.reps            → set.measure {reps}
 *   set.distance_m      → set.measure {distance}
 *   set.duration_s      → set.measure {duration}
 *   set.rpe/rir/hr_zone → set.target           (when no target yet)
 *   top-level hr_zone   → prescription.target {hr_zone}
 *
 * The shared Zod schema (@fahybrid/shared/domain/prescription) already NORMALIZES
 * legacy aliases onto measure/target on parse, so this migration simply parses
 * each stored row through the schema and re-serializes the CANONICAL output. That
 * makes the conversion single-sourced (no duplicated mapping logic here) and
 * guarantees every written row re-validates against the new model.
 *
 * Tables: template_segments, block_exercises (both carry jsonb prescription_json).
 * No DDL is needed — the change is purely in the jsonb value, so there is no SQL
 * migration file; this is a data backfill only.
 *
 * HARD RULE — DO NOT GUESS / DO NOT FABRICATE
 * -------------------------------------------
 * If a stored row fails to parse under the new schema, it is LEFT UNTOUCHED and
 * FLAGGED in the report. We never write a row we couldn't validate.
 *
 * IDEMPOTENT: a row already in canonical form re-serializes to the same bytes, so
 * we skip the UPDATE when the canonical JSON equals the stored JSON. Re-running is
 * a no-op. Pass --dry-run to compute + report without writing.
 *
 *   pnpm --filter @fahybrid/infra exec tsx scripts/migrate_load_to_target.ts --dry-run
 *   pnpm --filter @fahybrid/infra exec tsx scripts/migrate_load_to_target.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';
import {
  type Prescription,
  safeParsePrescription,
} from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = resolve(HERE, '..', 'reports');

const DRY_RUN = process.argv.includes('--dry-run');

interface DbRow {
  id: string;
  prescription_json: unknown;
}

interface TableStats {
  total: number;
  converted: number; // canonical JSON differed from stored → would write
  already_canonical: number; // parsed clean and serialized identical → skipped
  failed: number; // could not parse under new schema → left + flagged
}

interface FlaggedRow {
  table: string;
  id: string;
  reasons: string[];
  stored: unknown; // the row we deliberately did NOT touch
}

function emptyStats(total: number): TableStats {
  return { total, converted: 0, already_canonical: 0, failed: 0 };
}

function out(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

// Stable stringify with sorted keys so "already canonical" comparison is robust
// to key ordering differences between the stored jsonb and the serialized model.
function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = sortKeys(obj[k]);
    return sorted;
  }
  return value;
}

// The canonical (post-normalization) form keeps ONLY the unified fields. The Zod
// schema normalizes aliases onto measure/target but does NOT strip the source
// aliases (back-compat reads still work). For a clean migration we re-emit the
// canonical shape WITHOUT the deprecated aliases, so stored rows fully move over.
function toCanonical(p: Prescription): Prescription {
  const canonical: Prescription = { scheme: p.scheme };
  if (p.modality !== undefined) canonical.modality = p.modality;
  if (p.rounds !== undefined) canonical.rounds = p.rounds;
  if (p.work_s !== undefined) canonical.work_s = p.work_s;
  if (p.rest_s !== undefined) canonical.rest_s = p.rest_s;
  if (p.total_s !== undefined) canonical.total_s = p.total_s;
  // prescriptionSchema already lifted hr_zone → target during normalize.
  if (p.target !== undefined) canonical.target = p.target;
  if (p.note !== undefined) canonical.note = p.note;
  if (p.sets && p.sets.length > 0) {
    canonical.sets = p.sets.map((s) => {
      const set: typeof s = {};
      if (s.measure !== undefined) set.measure = s.measure;
      if (s.target !== undefined) set.target = s.target;
      if (s.modality !== undefined) set.modality = s.modality;
      if (s.rest_s !== undefined) set.rest_s = s.rest_s;
      if (s.tempo !== undefined) set.tempo = s.tempo;
      if (s.note !== undefined) set.note = s.note;
      return set;
    });
  }
  return canonical;
}

function asJson(p: Prescription): Parameters<Sql['json']>[0] {
  return JSON.parse(JSON.stringify(p)) as Parameters<Sql['json']>[0];
}

async function migrateTable(
  sql: Sql,
  table: 'template_segments' | 'block_exercises',
  flagged: FlaggedRow[],
): Promise<TableStats> {
  const rows = await sql<DbRow[]>`
    select id::text as id, prescription_json
    from ${sql(table)}
    where prescription_json is not null
    order by id
  `;
  const stats = emptyStats(rows.length);

  for (const row of rows) {
    const parsed = safeParsePrescription(row.prescription_json);
    if (!parsed.success) {
      stats.failed += 1;
      flagged.push({
        table,
        id: row.id,
        reasons: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        stored: row.prescription_json,
      });
      continue;
    }

    const canonical = toCanonical(parsed.data as Prescription);
    const before = stableStringify(row.prescription_json);
    const after = stableStringify(canonical);

    if (before === after) {
      stats.already_canonical += 1;
      continue;
    }

    stats.converted += 1;
    if (!DRY_RUN) {
      await sql`
        update ${sql(table)}
        set prescription_json = ${sql.json(asJson(canonical))},
            updated_at = now()
        where id = ${row.id}::bigint
      `;
    }
  }
  return stats;
}

function printStats(label: string, s: TableStats): void {
  out(`\n${label}`);
  out(`  total rows ................ ${s.total}`);
  out(`  converted (load→target) ... ${s.converted}`);
  out(`  already canonical (skip) .. ${s.already_canonical}`);
  out(`  failed (left + flagged) ... ${s.failed}`);
}

async function main(): Promise<void> {
  const sql = getSql();
  const flagged: FlaggedRow[] = [];
  try {
    out(`[migrate_load_to_target] mode=${DRY_RUN ? 'dry-run' : 'apply'} — converting prescription_json…`);

    const tsStats = await migrateTable(sql, 'template_segments', flagged);
    const beStats = await migrateTable(sql, 'block_exercises', flagged);

    printStats('template_segments:', tsStats);
    printStats('block_exercises:', beStats);

    const total = tsStats.total + beStats.total;
    const converted = tsStats.converted + beStats.converted;
    const canonical = tsStats.already_canonical + beStats.already_canonical;
    const failed = tsStats.failed + beStats.failed;

    out('\n=== TOTAL ===');
    out(`  rows total ................ ${total}`);
    out(`  converted ................. ${converted}`);
    out(`  already canonical ......... ${canonical}`);
    out(`  failed (flagged) .......... ${failed}`);

    mkdirSync(REPORTS_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = resolve(REPORTS_DIR, `migrate_load_to_target_${stamp}.json`);
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          mode: DRY_RUN ? 'dry-run' : 'apply',
          stats: { template_segments: tsStats, block_exercises: beStats },
          failed_count: failed,
          flagged,
        },
        null,
        2,
      ),
      'utf8',
    );
    out(`\nReport → ${reportPath}`);

    if (DRY_RUN) out('\n[dry-run] nothing written to the database.');
    else out('\n[apply] prescription_json migrated to the unified model.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  process.stderr.write(
    `Migration failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
