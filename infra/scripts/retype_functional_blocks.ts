/**
 * retype_functional_blocks.ts — re-type the FUNCTIONAL / WOD / CIRCUIT block
 * exercises of the Biblioteca de Bloques (library blocks, coach_id IS NULL) into
 * the canonical, fully-typed Prescription model (@fahybrid/shared/domain/
 * prescription) so they translate correctly to iOS.
 *
 * SCOPE
 * -----
 * Every library `block_exercises` row whose prescription modality is
 * `functional` (17 rows), PLUS the clearly-broken NON-functional component rows
 * that carry a WOD/circuit those functional rows live inside (4 rows: a power
 * clean whose load 65-75% had been stored as `reps:65`; a pull-up mis-typed as
 * `steady`; a run row that absorbed an unrelated "AMRAP 10'" as a 600 s set; a
 * reverse lunge missing its "20 reps"). These are the densest blocks in the
 * library and the ones the prior structured pass left emptiest.
 *
 * HONESTY CONTRACT (build-right)
 * ------------------------------
 *  - GROUND TRUTH is the parent block's VERBATIM `blocks.description`. Every
 *    measure / target / cap below is traced to a quoted fragment of it. We NEVER
 *    fabricate a rep count, load or distance the text does not state.
 *  - When the verbatim genuinely omits a row's work (a "BTW" accessory burpee, a
 *    "High box jump" with no count, an EMOM with no per-minute reps), the row is
 *    typed with everything the text DOES give (scheme / rounds / rest / load) and
 *    left WITHOUT a fabricated measure, with `needs_review=true` + a recorded
 *    reason. The gap is surfaced, never papered over.
 *  - The verbatim `description` is never mutated. `params_json` is regenerated
 *    from the new prescription via the SHARED prescriptionToParams (single source
 *    of truth) so the scalar summary stays in sync.
 *  - We do NOT touch `blocks.needs_review` (block-level flag stays as set).
 *  - We do NOT add/delete rows. Verbatim components that have NO corresponding
 *    block_exercises row (e.g. block 87's "20 BW lunges" / "AMRAP 10' race
 *    stations" / "Finisher 125 lunges") are reported as data gaps, not invented.
 *
 * Each write asserts the row's exercise slug matches the expected slug first, so
 * the id-keyed spec can't silently retype the wrong row if ids ever drift.
 *
 * Idempotent: re-running writes byte-identical prescription_json / params_json /
 * needs_review. Dry-run with --dry-run.
 *
 * Run: cd infra && tsx scripts/retype_functional_blocks.ts [--dry-run]
 */
import type { Sql } from 'postgres';
import {
  parsePrescription,
  prescriptionToParams,
  prescriptionToText,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.js';

const DRY_RUN = process.argv.includes('--dry-run');

// ── Spec ────────────────────────────────────────────────────────────────────
// One entry per in-scope row. `slug` guards against id drift. `presc` is the
// faithful typed model; `needsReview` + `reason` flag honest gaps. `frag` quotes
// the verbatim fragment the typing was derived from (audit trail).
interface Spec {
  beId: number;
  block: number;
  slug: string; // expected exercise slug (write guard)
  frag: string; // verbatim fragment this typing is traced to
  presc: Prescription;
  needsReview: boolean;
  reason?: string;
}

// helpers to keep the spec terse and typed
const reps = (value: number) => ({ measure: { kind: 'reps' as const, value } });
const repsLoadPct = (value: number, min: number, max: number) => ({
  measure: { kind: 'reps' as const, value },
  target: { kind: 'percent_rm' as const, min, max },
});
const repsKg = (value: number, kg: number) => ({
  measure: { kind: 'reps' as const, value },
  target: { kind: 'kg' as const, value: kg },
});
const repsPct = (value: number, pct: number) => ({
  measure: { kind: 'reps' as const, value },
  target: { kind: 'percent_rm' as const, value: pct },
});

const SPECS: Spec[] = [
  // ── block 12 — "Front squat 6 series 7-6-6-6-5-5 + Burpee to plate BTW"
  {
    beId: 522, block: 12, slug: 'burpee', frag: 'Burpee to plate BTW',
    presc: { scheme: 'sets', modality: 'functional' },
    needsReview: true, reason: "'Burpee to plate BTW' — verbatim gives no rep count for the burpee",
  },

  // ── block 13 — "Bar zercher jump bulgarian squat 12/10/8/8 + 20m broad jump – 6' rest"
  {
    beId: 535, block: 13, slug: 'zercher-squat-jump', frag: '12/10/8/8 ... 6\' rest',
    presc: {
      scheme: 'sets', modality: 'functional',
      sets: [
        { ...reps(12), rest_s: 360 },
        { ...reps(10), rest_s: 360 },
        { ...reps(8), rest_s: 360 },
        { ...reps(8), rest_s: 360 },
      ],
    },
    needsReview: false,
  },
  {
    beId: 536, block: 13, slug: 'broad-jump', frag: '20m broad jump (x4 rounds)',
    presc: {
      scheme: 'sets', modality: 'functional',
      sets: [
        { measure: { kind: 'distance', meters: 20 } },
        { measure: { kind: 'distance', meters: 20 } },
        { measure: { kind: 'distance', meters: 20 } },
        { measure: { kind: 'distance', meters: 20 } },
      ],
    },
    needsReview: false,
  },

  // ── block 14 — "8r DB Depth Jump to 4 broad jumps 12,5kg – 30'' rest"
  {
    beId: 537, block: 14, slug: 'depth-jump', frag: '8r DB Depth Jump to 4 broad jumps 12,5kg – 30\'\' rest',
    presc: { scheme: 'rounds', modality: 'functional', rounds: 8, rest_s: 30, target: { kind: 'kg', value: 12.5 } },
    needsReview: true,
    reason: "compound 'DB depth jump to 4 broad jumps' — the rep split across two movements can't sit on one row; 8 rounds + 12.5 kg + 30'' rest captured",
  },

  // ── block 15 — "8r DB Depth Jump to 4 broad jumps – 30'' rest (antes de Skierg)"
  {
    beId: 538, block: 15, slug: 'depth-jump', frag: '8r DB Depth Jump to 4 broad jumps – 30\'\' rest',
    presc: { scheme: 'rounds', modality: 'functional', rounds: 8, rest_s: 30 },
    needsReview: true,
    reason: "compound 'DB depth jump to 4 broad jumps' — rep split not expressible on one row; 8 rounds + 30'' rest captured (no load stated)",
  },

  // ── block 16 — "4r every 2': 3 power clean 65-75% + 5 high box jump"
  // E2MOM cadence ("every 2'") isn't expressible (emom render assumes 1' windows)
  // → typed as 4 rounds; the per-row work (reps/load) is fully faithful, so the
  // rows are NOT flagged — the cadence loss is reported as a model gap.
  {
    beId: 539, block: 16, slug: 'power-clean', frag: "4r every 2': 3 power clean 65-75%",
    presc: {
      scheme: 'rounds', modality: 'strength', rounds: 4,
      sets: [repsLoadPct(3, 65, 75), repsLoadPct(3, 65, 75), repsLoadPct(3, 65, 75), repsLoadPct(3, 65, 75)],
    },
    needsReview: false,
  },
  {
    beId: 540, block: 16, slug: 'box-jump', frag: '5 high box jump (x4 rounds)',
    presc: { scheme: 'rounds', modality: 'functional', rounds: 4, sets: [reps(5), reps(5), reps(5), reps(5)] },
    needsReview: false,
  },

  // ── block 17 — "10r Front squat 70% + High box jump plio – 2' rest"
  {
    beId: 542, block: 17, slug: 'box-jump', frag: 'High box jump plio – 2\' rest (x10 rounds)',
    presc: { scheme: 'rounds', modality: 'functional', rounds: 10, rest_s: 120 },
    needsReview: true,
    reason: "'High box jump plio' — verbatim gives no rep count; 10 rounds + 2' rest captured",
  },

  // ── block 18 — "6r Hang power clean 70% + High box jump + 6 TTB BTW"
  {
    beId: 544, block: 18, slug: 'box-jump', frag: 'High box jump (x6 rounds)',
    presc: { scheme: 'rounds', modality: 'functional', rounds: 6 },
    needsReview: true,
    reason: "'High box jump' — verbatim gives no rep count; 6 rounds captured",
  },
  {
    beId: 545, block: 18, slug: 'toes-to-bar', frag: '6 TTB BTW (x6 rounds)',
    presc: { scheme: 'rounds', modality: 'functional', rounds: 6, sets: [reps(6)] },
    needsReview: false,
  },

  // ── block 19 — "5r Jump back squat 60% – 6 reps – 2' rest"
  {
    beId: 546, block: 19, slug: 'jump-squat', frag: '5r Jump back squat 60% – 6 reps – 2\' rest',
    presc: { scheme: 'rounds', modality: 'functional', rounds: 5, rest_s: 120, sets: [repsPct(6, 60)] },
    needsReview: false,
  },

  // ── block 84 — "EMOM 10': pull ups / push ups alternados"
  {
    beId: 605, block: 84, slug: 'pull-up', frag: "EMOM 10': pull ups / push ups alternados",
    presc: { scheme: 'emom', modality: 'strength', rounds: 10 },
    needsReview: true,
    reason: "EMOM 10' alternating pull/push — verbatim gives no per-minute rep count",
  },
  {
    beId: 606, block: 84, slug: 'push-up', frag: "EMOM 10': pull ups / push ups alternados",
    presc: { scheme: 'emom', modality: 'functional', rounds: 10 },
    needsReview: true,
    reason: "EMOM 10' alternating pull/push — verbatim gives no per-minute rep count",
  },

  // ── block 87 — "EMOM 15': 20 BW lunges + 15 wall balls 6kg + 40'' run – AMRAP 10' race stations + Finisher 125 lunges"
  {
    beId: 610, block: 87, slug: 'hyrox-wall-balls', frag: "EMOM 15': ... 15 wall balls 6kg",
    presc: { scheme: 'emom', modality: 'functional', rounds: 15, sets: [repsKg(15, 6)] },
    needsReview: false,
  },
  {
    beId: 611, block: 87, slug: 'run', frag: "EMOM 15': ... 40'' run  (drops the bogus 600s AMRAP leak)",
    presc: { scheme: 'emom', modality: 'run', rounds: 15, sets: [{ measure: { kind: 'duration', seconds: 40 } }] },
    needsReview: false,
  },

  // ── block 89 — "10r front squat + box jump + AFAP 70 wall balls / 70m SB lunge intercalados"
  {
    beId: 615, block: 89, slug: 'box-jump', frag: '10r front squat + box jump',
    presc: { scheme: 'rounds', modality: 'functional', rounds: 10 },
    needsReview: true,
    reason: "'10r front squat + box jump' — box jump rep count not in verbatim; 10 rounds captured",
  },
  {
    beId: 616, block: 89, slug: 'hyrox-wall-balls', frag: 'AFAP 70 wall balls',
    presc: { scheme: 'for_time', modality: 'functional', sets: [reps(70)] },
    needsReview: false,
  },

  // ── block 90 — "4r: 20 reverse lunge 30kg + sled push + sled drag + 500m run AFAP"
  {
    beId: 617, block: 90, slug: 'reverse-lunge', frag: '4r: 20 reverse lunge 30kg',
    presc: { scheme: 'for_time', modality: 'strength', rounds: 4, sets: [repsKg(20, 30)] },
    needsReview: false,
  },
  {
    beId: 618, block: 90, slug: 'hyrox-sled-push', frag: 'sled push (4 rounds AFAP)',
    presc: { scheme: 'for_time', modality: 'functional', rounds: 4 },
    needsReview: true,
    reason: "'sled push' — verbatim gives no distance/load; 4 rounds AFAP captured",
  },

  // ── block 389 / 390 — track tests: the "Run Technique Drills" (5') leg.
  // Already correctly typed (steady 5'); rewritten to assert idempotently.
  {
    beId: 627, block: 389, slug: 'run-technique-drills', frag: 'Movilidad + técnica (5\')',
    presc: { scheme: 'steady', modality: 'functional', total_s: 300 },
    needsReview: false,
  },
  {
    beId: 634, block: 390, slug: 'run-technique-drills', frag: 'Movilidad + técnica (5\')',
    presc: { scheme: 'steady', modality: 'functional', total_s: 300 },
    needsReview: false,
  },
];

// Verbatim components that have NO block_exercises row — reported, never invented.
const DATA_GAPS: string[] = [
  'block 87: verbatim parts "20 BW lunges" (EMOM), "AMRAP 10\' race stations" and "Finisher 125 lunges" have no block_exercises rows (parse under-segmented).',
  'block 89: verbatim part "70m SB lunge" (intercalado with the 70 wall balls AFAP) has no block_exercises row.',
  'block 30: "3r 27-21-15-9 AB + Skierg – 90\'\' rest" — erg ladder with ambiguous round count (3r vs the 4-step 27-21-15-9 ladder); left untouched (erg, out of functional scope, not safely typable without guessing).',
];

const MODEL_GAPS: string[] = [
  "No 'circuit' scheme in PrescriptionScheme (the brief lists amrap|emom|for_time|rounds|circuit, the enum has sets|rounds|emom|amrap|interval|steady|for_time). Circuits were mapped to 'rounds'.",
  "EMOM with a cadence >1 minute (\"4r every 2'\", block 16) isn't expressible: prescriptionToText renders EMOM rounds as whole minutes, so an every-2' clock would mis-render as 'EMOM 4''. Typed as scheme 'rounds' (4 rounds) instead — faithful reps/load, explicit 2' clock dropped.",
  "No multi-component WOD container: a WOD's N exercises each repeat scheme+cap on their own row; the round STRUCTURE/ordering (do A then B then C, repeat) is implicit in row order, not explicit in the model.",
  "Compound single-row movements ('DB depth jump to 4 broad jumps', blocks 14/15) — the rep split across two movements can't sit on one exercise row.",
];

interface Row {
  id: string;
  slug: string;
  prescription_json: unknown;
  needs_review: boolean;
}

function asJson(p: Prescription): Parameters<Sql['json']>[0] {
  return JSON.parse(JSON.stringify(p)) as Parameters<Sql['json']>[0];
}

async function main(): Promise<void> {
  const sql = getSql();
  const host = process.env.DATABASE_URL?.match(/@([^/:]+)/)?.[1] ?? '?';
  if (!host.includes('ep-flat-wind')) {
    throw new Error(`Refusing to run: DATABASE_URL host is "${host}", expected the demo branch ep-flat-wind.`);
  }
  process.stdout.write(`[retype_functional_blocks] host=${host} mode=${DRY_RUN ? 'dry-run' : 'apply'}\n`);

  let typed = 0;
  let flagged = 0;
  const skipped: string[] = [];
  const examples: Array<{ beId: number; before: string; after: string }> = [];

  try {
    for (const s of SPECS) {
      const cur = (
        await sql<Row[]>`
          select be.id::text, e.slug, be.prescription_json, be.needs_review
          from block_exercises be join exercises e on e.id = be.exercise_id
          where be.id = ${s.beId}::bigint`
      )[0];
      if (!cur) {
        skipped.push(`be#${s.beId}: row not found`);
        continue;
      }
      if (cur.slug !== s.slug) {
        skipped.push(`be#${s.beId}: slug guard failed (expected ${s.slug}, found ${cur.slug}) — NOT written`);
        continue;
      }

      // Validate against the shared Zod model before writing.
      let presc: Prescription;
      try {
        presc = parsePrescription(asJson(s.presc));
      } catch (e) {
        skipped.push(`be#${s.beId}: schema validation failed — ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      const params = prescriptionToParams(presc);

      examples.push({
        beId: s.beId,
        before: JSON.stringify(cur.prescription_json),
        after: prescriptionToText(presc),
      });

      if (!DRY_RUN) {
        await sql`
          update block_exercises
          set prescription_json = ${sql.json(asJson(presc))},
              params_json       = ${sql.json(params as Parameters<Sql['json']>[0])},
              needs_review      = ${s.needsReview},
              updated_at        = now()
          where id = ${s.beId}::bigint`;
      }
      typed += 1;
      if (s.needsReview) flagged += 1;
    }

    report({ typed, flagged, skipped, examples });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function report(r: {
  typed: number;
  flagged: number;
  skipped: string[];
  examples: Array<{ beId: number; before: string; after: string }>;
}): void {
  const w = (s: string) => process.stdout.write(s + '\n');
  w('\n============ FUNCTIONAL / WOD RE-TYPING REPORT ============');
  for (const s of SPECS) {
    const ex = r.examples.find((e) => e.beId === s.beId);
    w(`\n[b${s.block}] be#${s.beId} ${s.slug} ${s.needsReview ? '⚑REVIEW' : 'OK'}`);
    w(`   frag: ${s.frag}`);
    if (ex) w(`   → ${ex.after || '(no render)'}  ::  ${JSON.stringify(s.presc)}`);
    if (s.reason) w(`   ⚑ ${s.reason}`);
  }
  w('\n============ DATA GAPS (verbatim component has no row — NOT invented) ============');
  for (const g of DATA_GAPS) w(`  • ${g}`);
  w('\n============ MODEL GAPS ============');
  for (const g of MODEL_GAPS) w(`  • ${g}`);
  if (r.skipped.length) {
    w('\n============ SKIPPED ============');
    for (const s of r.skipped) w(`  ! ${s}`);
  }
  w('\n============ COUNTS ============');
  w(`  in-scope functional rows ......... 17`);
  w(`  + broken WOD-component fixes ..... 4   (power-clean reps:65 bug, pull-up steady→emom, run 600s leak, reverse-lunge +20 reps)`);
  w(`  total rows re-typed .............. ${r.typed}`);
  w(`  flagged needs_review ............. ${r.flagged}`);
  w(`  skipped .......................... ${r.skipped.length}`);
}

main().catch((err) => {
  process.stderr.write(`retype_functional_blocks failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
