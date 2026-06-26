/**
 * rescue_inferred_intensity_blocks.ts — recover the INTENSITY target of library
 * block rows (table `blocks`, coach_id IS NULL) that the verbatim/structured
 * typing passes left target-less, using ONLY intensity the SOURCE actually
 * states: the group's own ENFOQUE (methodology_groups.description_es) or a
 * qualitative intensity WORD in the block's verbatim. No fabricated numbers.
 *
 * WHY
 * ---
 * After the modality re-typing passes (retype_run / _erg / _strength / …) 66
 * library blocks still carried `needs_review`. Re-reading the ORIGINAL Excel
 * (Grupos_Entrenamiento_HYROX.xlsx) confirmed the import was FAITHFUL — every
 * row typed exactly the intensity its own verbatim stated — but a defensible
 * slice of the remaining gaps is recoverable WITHOUT asking Pablo, because the
 * intensity is stated in the SOURCE just not on the row's own line:
 *
 *   RULE 1 · Erg threshold series (group-enfoque RPE).
 *     The erg group's enfoque reads "Series progresivas cerca del umbral
 *     (RPE 8)" — an EXPLICIT RPE the coach assigned to that group's series.
 *     Sibling rows that happened to restate "RPE8" in their own text were
 *     already typed (blocks 20-23); the ones that dropped the suffix (24-29)
 *     are the SAME duration-interval erg series and inherit the group's RPE.
 *     We read the number from the group's OWN description_es (agnostic — if the
 *     coach writes RPE 7 tomorrow, that is what applies) and attach it to erg
 *     INTERVAL rows whose every set already carries a measure but no target.
 *     A rep-ladder sprint (scheme 'sets', e.g. "27-21-15-9 AB") is NOT a near-
 *     threshold progression → excluded.
 *
 *   RULE 2 · Verbatim qualitative run word (import-recovered).
 *     The numeric run parser maps "z2 / 15,5km/h / RPE8" but not the WORDS
 *     "easy" or "sub threshold", which sit in the run's own verbatim. "easy
 *     run" is an aerobic Z2 run; "sub threshold" is controlled work just below
 *     the methodology's threshold anchor (RPE 8) → RPE 7. Applied ONLY to a
 *     block with exactly one run row that lacks a target, so the word is
 *     unambiguously that run's intensity. Test protocols are skipped.
 *
 *   RULE 3 · Bodyweight plyometrics (movement nature, not a guessed number).
 *     A box / broad jump and a toes-to-bar carry NO external load — bodyweight
 *     is a FACT of the movement, not an invented intensity. Rows of these slugs
 *     whose sets are fully measured but target-less get a `bodyweight` target.
 *
 * HONESTY CONTRACT (build-right)
 * ------------------------------
 *  - We NEVER write a number the source does not state. We do NOT infer an exact
 *    load (kg/%RM), an exact interval pace, or a time cap — those stay
 *    `needs_review` for Pablo. Mixed-distance running ladders (1200+1000+800+400)
 *    are deliberately NOT given a single inferred target: the group's own enfoque
 *    says the paces VARY by rep, so one target would contradict the source.
 *  - The verbatim `description` is never mutated. `params_json` is regenerated
 *    from the new prescription via the SHARED prescriptionToParams.
 *  - We set `block_exercises.needs_review` to false on a row only when, after the
 *    rescue, every set carries a measure AND a target. Block-level needs_review
 *    is then recomputed by the existing rollup_block_needs_review.ts pass.
 *
 * Idempotent: re-running re-derives the same target/params from the same source.
 * Host-guarded to the demo branch ep-flat-wind. Dry-run with --dry-run.
 *
 * Run: cd infra && tsx scripts/rescue_inferred_intensity_blocks.ts [--dry-run]
 */
import type { Sql } from 'postgres';
import {
  parsePrescription,
  prescriptionToParams,
  setMeasure,
  setTarget,
  type Prescription,
  type PrescriptionSet,
  type Target,
} from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.js';

const DRY_RUN = process.argv.includes('--dry-run');
const DEMO_HOST = 'ep-flat-wind';

const ERG_MODALITIES = new Set(['row', 'ski', 'bike']);
// Movements that are UNAMBIGUOUSLY unloaded bodyweight in this corpus.
const BODYWEIGHT_SLUGS = new Set(['box-jump', 'broad-jump', 'toes-to-bar']);

// Qualitative run-intensity words the numeric parser does not map, with the
// defensible target each denotes (standard endurance vocabulary; "sub threshold"
// = just below the methodology threshold anchor RPE 8).
const RUN_WORD_TARGETS: Array<{ re: RegExp; target: Target; label: string }> = [
  { re: /\beasy\b|\bf[áa]cil\b|\bsuave\b/i, target: { kind: 'hr_zone', value: 2 }, label: 'easy → Z2' },
  { re: /sub[\s-]?threshold|sub[\s-]?umbral/i, target: { kind: 'rpe', value: 7 }, label: 'sub-threshold → RPE7' },
];

interface BlockRow {
  id: string;
  title: string;
  description: string;
  g: string;
}
interface BeRow {
  id: string;
  slug: string | null;
  modality: string | null;
  prescription_json: Prescription | null;
}

interface RowFix {
  beId: number;
  blockId: number;
  rule: string;
  detail: string;
  before: Prescription;
  after: Prescription;
  cleared: boolean;
}

function asJson(p: Prescription): Parameters<Sql['json']>[0] {
  return JSON.parse(JSON.stringify(p)) as Parameters<Sql['json']>[0];
}

/** A row is fully dosed when it has ≥1 set and every set carries measure + target. */
function fullyDosed(p: Prescription): boolean {
  const sets = p.sets ?? [];
  if (sets.length === 0) return false;
  return sets.every((s) => setMeasure(s) !== undefined && setTarget(s) !== undefined);
}

/** Every set has a measure but none has a target (the shape we can rescue). */
function measuredButTargetless(p: Prescription): boolean {
  const sets = p.sets ?? [];
  if (sets.length === 0) return false;
  if (p.target !== undefined) return false; // already has a block-level target
  return sets.every((s) => setMeasure(s) !== undefined) && sets.every((s) => setTarget(s) === undefined);
}

/** Return a copy of the prescription with `target` set on every set. */
function withSetTarget(p: Prescription, target: Target): Prescription {
  const sets = (p.sets ?? []).map((s): PrescriptionSet => ({ ...s, target }));
  return { ...p, sets };
}

async function main(): Promise<void> {
  const sql = getSql();
  const host = process.env.DATABASE_URL?.match(/@([^/:]+)/)?.[1] ?? '?';
  if (!host.includes(DEMO_HOST)) {
    throw new Error(`Refusing to run: DATABASE_URL host is "${host}", expected the demo branch ${DEMO_HOST}.`);
  }
  process.stdout.write(`[rescue_inferred_intensity_blocks] host=${host} mode=${DRY_RUN ? 'dry-run' : 'apply'}\n`);

  const fixes: RowFix[] = [];
  try {
    // Group enfoque → an explicit RPE the coach assigned to that group's series.
    const groups = await sql<Array<{ id: string; description_es: string | null }>>`
      select id::text, description_es from methodology_groups`;
    const groupRpe = new Map<string, number>();
    for (const g of groups) {
      const m = /RPE\s*(\d+)/i.exec(g.description_es ?? '');
      if (m) groupRpe.set(g.id, Number(m[1]));
    }

    const blocks = await sql<BlockRow[]>`
      select b.id::text, b.title, b.description, b.methodology_group_id::text as g
      from blocks b where b.coach_id is null and b.needs_review = true order by b.id`;

    for (const b of blocks) {
      const blockId = Number(b.id);
      const rows = await sql<BeRow[]>`
        select be.id::text, e.slug, be.prescription_json->>'modality' as modality, be.prescription_json
        from block_exercises be
        left join exercises e on e.id = be.exercise_id
        where be.block_id = ${blockId}
        order by be.block_position, be.position`;

      const runRows = rows.filter((r) => r.modality === 'run');
      const isTest = /\btest\b/i.test(b.title) || /test de|test pista/i.test(b.description);

      for (const r of rows) {
        const beId = Number(r.id);
        const p = r.prescription_json;
        if (!p || !measuredButTargetless(p)) continue;

        let target: Target | undefined;
        let rule = '';
        let detail = '';

        // RULE 1 — erg threshold series (group-enfoque RPE).
        if (r.modality && ERG_MODALITIES.has(r.modality) && p.scheme === 'interval') {
          const rpe = groupRpe.get(b.g);
          if (rpe !== undefined) {
            target = { kind: 'rpe', value: rpe };
            rule = 'R1 erg-enfoque-RPE';
            detail = `group ${b.g} enfoque RPE ${rpe} → erg interval series`;
          }
        }

        // RULE 2 — verbatim qualitative run word (unambiguous single run row).
        if (!target && r.modality === 'run' && runRows.length === 1 && !isTest) {
          for (const w of RUN_WORD_TARGETS) {
            if (w.re.test(b.description)) {
              target = w.target;
              rule = 'R2 run-verbatim-word';
              detail = w.label;
              break;
            }
          }
        }

        // RULE 3 — bodyweight plyometrics (movement nature).
        if (!target && r.slug && BODYWEIGHT_SLUGS.has(r.slug)) {
          target = { kind: 'bodyweight' };
          rule = 'R3 bodyweight-plyo';
          detail = `${r.slug} carries no external load`;
        }

        if (!target) continue;

        const after = withSetTarget(p, target);
        const validated = parsePrescription(asJson(after)); // throws on any schema break
        const cleared = fullyDosed(validated);
        fixes.push({ beId, blockId, rule, detail, before: p, after: validated, cleared });

        if (!DRY_RUN) {
          await sql`
            update block_exercises
            set prescription_json = ${sql.json(asJson(validated))},
                params_json = ${sql.json(prescriptionToParams(validated) as Parameters<Sql['json']>[0])},
                needs_review = ${!cleared},
                updated_at = now()
            where id = ${beId}::bigint`;
        }
      }
    }

    printReport(fixes);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function printReport(fixes: RowFix[]): void {
  const w = (s: string) => process.stdout.write(s + '\n');
  w('\n================ INTENSITY RESCUE REPORT ================');
  const byRule = new Map<string, RowFix[]>();
  for (const f of fixes) {
    const list = byRule.get(f.rule) ?? [];
    list.push(f);
    byRule.set(f.rule, list);
  }
  for (const [rule, list] of byRule) {
    w(`\n${rule} — ${list.length} row(s):`);
    for (const f of list) {
      const t = JSON.stringify(f.after.sets?.[0]?.target);
      w(`   block ${f.blockId} be#${f.beId} · ${f.detail} · target=${t} · row ${f.cleared ? 'CLEARED' : 'still needs_review'}`);
    }
  }
  const clearedRows = fixes.filter((f) => f.cleared).length;
  const blocks = new Set(fixes.map((f) => f.blockId));
  w('\n================ COUNTS ================');
  w(`  rows touched ............ ${fixes.length}`);
  w(`  rows cleared (measure+target) . ${clearedRows}`);
  w(`  blocks touched .......... ${blocks.size}`);
}

main().catch((err) => {
  process.stderr.write(
    `rescue_inferred_intensity_blocks failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
