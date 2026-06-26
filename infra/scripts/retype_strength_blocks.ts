/**
 * retype_strength_blocks.ts — re-type the STRENGTH block_exercises of the
 * Biblioteca de Bloques (table `block_exercises`) into the canonical, fully-typed
 * Prescription model (@fahybrid/shared/domain/prescription), so the dosage
 * (sets × reps × load) translates correctly to iOS.
 *
 * SCOPE
 * -----
 * Every `block_exercises` row whose `prescription_json->>'modality'` = 'strength'
 * OR whose exercise is a strength lift (`exercises.modality` = 'strength').
 *
 * WHY
 * ---
 * The prior structured pass left strength rows in inconsistent shapes: some
 * carried per-set reps + %RM faithfully, but many DROPPED the load (reps-only
 * with `needs_review=false`, hiding the gap), MIS-READ the load as reps
 * ("3 power clean 65-75%" → measure reps:65 !), or DROPPED the single rep count
 * of a WOD leg ("20 reverse lunge 30kg" → target kg:30 with no measure). This
 * script parses the VERBATIM `blocks.description` (the source of truth) into the
 * typed model so every strength set carries a `measure` (reps) AND a `target`
 * (load) WHEN the text states one — and is honestly flagged when it does not.
 *
 * HONESTY CONTRACT (build-right)
 * ------------------------------
 *  - Faithful to the verbatim. "@70-75%" → percent_rm {min:70,max:75}; "30kg" →
 *    kg 30; "10/10/8/8/6" → five sets of those reps. We NEVER fabricate a load
 *    the text does not state.
 *  - A strength set whose verbatim gives reps but NO load (a bare "Deadlift 5r
 *    10/10/8/6/4") is typed with its reps + left WITHOUT a target, and that ROW's
 *    `needs_review` is set true. A set with a load but no rep count ("10r Front
 *    squat 70%") is likewise flagged. We surface the gap; we do not paper over it.
 *  - The verbatim `description` is never mutated. `block_exercises.params_json` is
 *    regenerated from the new prescription via the SHARED prescriptionToParams
 *    (single source of truth) so the scalar summary stays in sync.
 *  - `blocks.needs_review` is NOT touched — only `block_exercises.needs_review`.
 *  - If the exercise's clause cannot be located in the verbatim, the row is
 *    SKIPPED (never overwritten with an empty shape) and reported.
 *
 * Idempotent: re-running recomputes the same prescription_json/params_json/
 * needs_review from the verbatim. Dry-run with --dry-run.
 *
 * Run: cd infra && tsx scripts/retype_strength_blocks.ts [--dry-run]
 */
import type { Sql } from 'postgres';
import {
  parsePrescription,
  prescriptionToParams,
  prescriptionToText,
  type Prescription,
  type PrescriptionScheme,
  type PrescriptionSet,
  type Target,
} from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.js';

const DRY_RUN = process.argv.includes('--dry-run');

// ── Per-slug keyword (verbatim names are EN + ES) ───────────────────────────
// Used to locate the clause of the verbatim that prescribes THIS exercise. Order
// of the more-specific patterns matters (hang power clean before power clean).
const SLUG_KEYWORD: Record<string, RegExp> = {
  'front-squat': /front squat/i,
  'overhead-press': /shoulder press|strict shoulder|overhead press/i,
  deadlift: /\bdeadlift\b/i,
  'hip-thrust': /hip\s*thrust/i,
  'bench-press': /bench press/i,
  'back-squat': /back squat/i,
  'cable-fly': /aperturas|cable fly/i,
  'lateral-raise': /elevaciones laterales|lateral raise/i,
  'hang-power-clean': /hang power clean/i,
  'power-clean': /(?<!hang )power clean/i,
  'turkish-get-up': /turkish get[-\s]?up/i,
  'pull-up': /pull\s?ups?/i,
  'weighted-dip': /\bdips?\b/i,
  'walking-lunge': /walking lunge/i,
  'goblet-squat': /goblet squat/i,
  'reverse-lunge': /reverse lunge/i,
  'sled-drag-backwards': /sled drag/i,
  'bulgarian-split-squat': /bulgarian split squat/i,
};

const EVERY_WINDOW_RE = /(?:every|c\/)\s*(\d+)\s*'/i; // "every 2'" / "c/2'" → cadence window
const EMOM_RE = /emom\s*(\d+)\s*'/i; // literal "EMOM 10'" → N one-minute rounds
const AFAP_RE = /afap|for time/i;
const WOD_ROUNDS_RE = /wod\s*(\d+)\s*rounds?/i;
const ROUNDS_RE = /(\d+)\s*rounds?\b|(\d+)\s*series\b|\b(\d+)r\b/i;

type Marker = 'interval' | 'for_time' | 'rounds' | null;
interface Ctx {
  rounds?: number;
  marker: Marker;
  work_s?: number;
}

// Split verbatim into clauses on + ; . and a comma NOT used as a decimal
// separator ("22,5kg" must stay whole, ", Hip Thrust" splits). ':' and '→' stay
// inside a clause so a header ("5 rounds c/2' → 3 Power Clean") parses as one.
function splitClauses(verbatim: string): string[] {
  return verbatim
    .split(/\s*\+\s*|\s*;\s*|\s*\.\s+|\s*\.$|,(?!\d)\s*/)
    .map((c) => c.trim())
    .filter(Boolean);
}

// Detect any round/scheme header carried by a clause (drives ctx propagation).
function clauseHeader(clause: string): Ctx {
  const ctx: Ctx = { marker: null };
  const emom = clause.match(EMOM_RE);
  if (emom) {
    ctx.rounds = Number(emom[1]); // EMOM 10' = 10 one-minute rounds
    ctx.marker = null; // 'emom' handled separately (it has no per-round work here)
    (ctx as { emom?: boolean }).emom = true;
  }
  const every = clause.match(EVERY_WINDOW_RE);
  if (every) {
    ctx.work_s = Number(every[1]) * 60;
    ctx.marker = 'interval';
  }
  if (AFAP_RE.test(clause)) ctx.marker = 'for_time';
  const wod = clause.match(WOD_ROUNDS_RE);
  if (wod) {
    ctx.rounds = Number(wod[1]);
    if (ctx.marker === null) ctx.marker = 'rounds';
  } else {
    const r = clause.match(ROUNDS_RE);
    if (r) ctx.rounds = Number(r[1] ?? r[2] ?? r[3]);
  }
  return ctx;
}

// Merge an inherited ctx with a clause-local one (clause-local wins per field).
function mergeCtx(inherited: Ctx, local: Ctx): Ctx {
  const out: Ctx = { marker: local.marker ?? inherited.marker };
  const rounds = local.rounds ?? inherited.rounds;
  const work_s = local.work_s ?? inherited.work_s;
  if (rounds !== undefined) out.rounds = rounds;
  if (work_s !== undefined) out.work_s = work_s;
  return out;
}

interface ParsedLoad {
  target?: Target;
  flags: string[];
}

// Extract the strength load from a clause and return it + the clause with the
// load token removed (so rep parsing can't mistake load digits for reps).
function extractLoad(clause: string): { load?: Target; rest: string } {
  let s = clause;
  // %RM range "65-80%" / "@70-75%"
  const range = s.match(/(\d+)\s*[-–]\s*(\d+)\s*%/);
  if (range) {
    s = s.replace(range[0], ' ');
    return { load: { kind: 'percent_rm', min: Number(range[1]), max: Number(range[2]) }, rest: s };
  }
  // %RM single "70%" / "@75%"
  const single = s.match(/@?\s*(\d+)\s*%/);
  if (single) {
    s = s.replace(single[0], ' ');
    return { load: { kind: 'percent_rm', value: Number(single[1]) }, rest: s };
  }
  // kg "22,5kg" / "30kg"
  const kg = s.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (kg) {
    s = s.replace(kg[0], ' ');
    return { load: { kind: 'kg', value: Number(kg[1]!.replace(',', '.')) }, rest: s };
  }
  return { rest: s };
}

// Rest seconds from "2' rest" / "2'30\" rest" / "… descanso 2'". Returns the
// value and the clause with the rest token removed.
function extractRest(clause: string): { rest_s?: number; rest: string } {
  const m = clause.match(/(\d+)\s*'\s*(\d+)?\s*(?:''|"|″)?\s*(?:rest|descanso)/i);
  if (m) {
    const secs = Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
    return { rest_s: secs, rest: clause.replace(m[0], ' ') };
  }
  return { rest: clause };
}

// A rep LIST "10/10/8/8/6" or "10-8-8-6-6" (>=2 numbers, no internal spaces).
// Returns every match so a dropped "/ 12-10-…" variant can be flagged.
function repLists(s: string): number[][] {
  const out: number[][] = [];
  const re = /\b\d+(?:[\/-]\d+)+\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(m[0].split(/[\/-]/).map(Number));
  return out;
}

// Remove round-count tokens so a leftover bare integer = the rep count.
function stripRoundTokens(s: string): string {
  return s
    .replace(EMOM_RE, ' ')
    .replace(EVERY_WINDOW_RE, ' ')
    .replace(WOD_ROUNDS_RE, ' ')
    .replace(/(\d+)\s*rounds?\b/gi, ' ')
    .replace(/(\d+)\s*series\b/gi, ' ')
    .replace(/\b\d+r\b/gi, ' ');
}

interface RowParse {
  prescription: Prescription | null;
  flags: string[];
}

// ── Parse one strength row from its verbatim + slug ─────────────────────────
function parseStrengthRow(verbatim: string, slug: string): RowParse {
  const flags: string[] = [];
  const kw = SLUG_KEYWORD[slug];
  if (!kw) return { prescription: null, flags: [`no keyword map for slug "${slug}"`] };

  const clauses = splitClauses(verbatim);
  // Walk clauses L→R, propagating a round/scheme ctx; snapshot at the matching one.
  let ctx: Ctx = { marker: null };
  let targetClause: string | null = null;
  let effective: Ctx | null = null;
  let emomRounds: number | undefined;
  for (const clause of clauses) {
    const local = clauseHeader(clause);
    const isEmom = (local as { emom?: boolean }).emom === true;
    if (targetClause === null && kw.test(clause)) {
      effective = mergeCtx(ctx, local);
      targetClause = clause;
      if (isEmom) emomRounds = local.rounds;
    }
    ctx = mergeCtx(ctx, local); // ctx carries forward for later clauses
  }
  if (targetClause === null || effective === null) {
    return { prescription: null, flags: [`clause for "${slug}" not found in verbatim`] };
  }

  // Literal EMOM (e.g. "EMOM 10'") with no per-round work stated.
  if (emomRounds !== undefined && !targetClause.match(EVERY_WINDOW_RE)) {
    const note = /alternad/i.test(targetClause) ? 'alternado con otro ejercicio' : undefined;
    const p: Prescription = { scheme: 'emom', modality: 'strength', rounds: emomRounds };
    if (note) p.note = note;
    flags.push(`EMOM with no per-round reps/load in verbatim: "${targetClause}"`);
    return { prescription: p, flags };
  }

  const { load, rest: noLoad } = extractLoad(targetClause);
  const { rest_s, rest: cleaned } = extractRest(noLoad);
  const porLado = /\/?\s*lado\b/i.test(cleaned);

  const lists = repLists(cleaned);
  let reps: number[] | null = null;
  if (lists.length > 0) {
    reps = lists[0]!;
    if (lists.length > 1) {
      flags.push(`alternate loading variant dropped (kept first ladder): "${targetClause}"`);
    }
  } else {
    const firstInt = stripRoundTokens(cleaned).match(/\d+/);
    if (firstInt) reps = [Number(firstInt[0])];
  }

  const setBase = (r?: number): PrescriptionSet => {
    const s: PrescriptionSet = {};
    if (r !== undefined) s.measure = { kind: 'reps', value: r };
    if (load) s.target = load;
    if (rest_s !== undefined && rest_s > 0) s.rest_s = rest_s;
    if (porLado) s.note = 'por lado';
    return s;
  };

  const marker = effective.marker;
  const rounds = effective.rounds;

  let p: Prescription;
  if (reps && reps.length >= 2) {
    // Explicit per-set rep ladder → straight sets, one entry per rep.
    p = { scheme: 'sets', modality: 'strength', sets: reps.map((r) => setBase(r)) };
  } else if (reps && reps.length === 1) {
    const rep = reps[0]!;
    if (marker === 'interval' || marker === 'for_time' || marker === 'rounds') {
      // Conditioning leg: one representative set + a rounds count (+ work window).
      const scheme: PrescriptionScheme = marker;
      p = { scheme, modality: 'strength', sets: [setBase(rep)] };
      if (rounds !== undefined) p.rounds = rounds;
      if (effective.work_s !== undefined && marker === 'interval') p.work_s = effective.work_s;
    } else if (rounds !== undefined && rounds > 1) {
      // Plain "N rounds × <rep>" straight sets → expand to N identical sets.
      p = { scheme: 'sets', modality: 'strength', sets: Array.from({ length: rounds }, () => setBase(rep)) };
    } else {
      p = { scheme: 'sets', modality: 'strength', sets: [setBase(rep)] };
    }
  } else {
    // No rep count parseable. Keep the round COUNT (real info) as that many
    // sets carrying whatever load was stated; flag as incomplete.
    if (rounds !== undefined && rounds > 0) {
      p = { scheme: 'sets', modality: 'strength', sets: Array.from({ length: rounds }, () => setBase(undefined)) };
    } else {
      p = { scheme: 'sets', modality: 'strength' };
    }
  }

  return { prescription: p, flags };
}

// A strength prescription is fully typed when it has >=1 set and EVERY set
// carries a measure (reps) AND a target (load). Conditioning schemes keep one
// representative set, which must itself be complete.
function fullyTyped(p: Prescription): boolean {
  if (!p.sets || p.sets.length === 0) return false;
  return p.sets.every((s) => s.measure !== undefined && s.target !== undefined);
}

function asJson(p: Prescription): Parameters<Sql['json']>[0] {
  return JSON.parse(JSON.stringify(p)) as Parameters<Sql['json']>[0];
}

// ── DB driver ───────────────────────────────────────────────────────────────
interface StrengthRow {
  be_id: string;
  block_id: string;
  slug: string;
  ex_name: string;
  verbatim: string;
  g: string;
  cur_nr: boolean;
}

type Outcome = 'typed' | 'flagged' | 'skipped';
interface RowReport {
  be_id: number;
  block_id: number;
  slug: string;
  verbatim: string;
  outcome: Outcome;
  before_nr: boolean;
  after_nr: boolean;
  text: string;
  presc: Prescription | null;
  flags: string[];
}

async function main(): Promise<void> {
  const sql = getSql();
  const host = process.env.DATABASE_URL?.match(/@([^/:]+)/)?.[1] ?? '?';
  if (!host.includes('ep-flat-wind')) {
    throw new Error(`Refusing to run: DATABASE_URL host is "${host}", expected the demo branch ep-flat-wind.`);
  }
  process.stdout.write(`[retype_strength_blocks] host=${host} mode=${DRY_RUN ? 'dry-run' : 'apply'}\n`);

  const reports: RowReport[] = [];
  try {
    const rows = await sql<StrengthRow[]>`
      select be.id::text be_id, be.block_id::text, e.slug, e.name ex_name,
             b.description verbatim, b.methodology_group_id::text g, be.needs_review cur_nr
      from block_exercises be
      join exercises e on e.id = be.exercise_id
      join blocks b on b.id = be.block_id
      where (be.prescription_json->>'modality') = 'strength' or e.modality = 'strength'
      order by be.block_id, be.block_position, be.position`;

    let typed = 0;
    let flagged = 0;
    let skipped = 0;
    let fixedNoLoad = 0;

    for (const r of rows) {
      const beId = Number(r.be_id);
      const { prescription, flags } = parseStrengthRow(r.verbatim, r.slug);

      if (!prescription) {
        skipped++;
        reports.push({
          be_id: beId, block_id: Number(r.block_id), slug: r.slug, verbatim: r.verbatim,
          outcome: 'skipped', before_nr: r.cur_nr, after_nr: r.cur_nr, text: '', presc: null, flags,
        });
        continue;
      }

      // Validate against the shared zod model before writing.
      let validated: Prescription;
      try {
        validated = parsePrescription(asJson(prescription));
      } catch (e) {
        skipped++;
        reports.push({
          be_id: beId, block_id: Number(r.block_id), slug: r.slug, verbatim: r.verbatim,
          outcome: 'skipped', before_nr: r.cur_nr, after_nr: r.cur_nr, text: '', presc: prescription,
          flags: [...flags, `schema validation failed: ${e instanceof Error ? e.message : String(e)}`],
        });
        continue;
      }

      const isTyped = fullyTyped(validated);
      const afterNr = !isTyped;
      const params = prescriptionToParams(validated);

      if (!DRY_RUN) {
        await sql`
          update block_exercises
          set prescription_json = ${sql.json(asJson(validated))},
              params_json = ${sql.json(params as Parameters<Sql['json']>[0])},
              needs_review = ${afterNr},
              updated_at = now()
          where id = ${beId}::bigint`;
      }

      if (isTyped) typed++;
      else flagged++;
      if (!isTyped && (validated.sets?.some((s) => s.measure !== undefined && s.target === undefined))) fixedNoLoad++;

      reports.push({
        be_id: beId, block_id: Number(r.block_id), slug: r.slug, verbatim: r.verbatim,
        outcome: isTyped ? 'typed' : 'flagged', before_nr: r.cur_nr, after_nr: afterNr,
        text: prescriptionToText(validated), presc: validated, flags,
      });
    }

    printReport(reports, { total: rows.length, typed, flagged, skipped, fixedNoLoad });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function printReport(
  reports: RowReport[],
  counts: { total: number; typed: number; flagged: number; skipped: number; fixedNoLoad: number },
): void {
  const w = (s: string) => process.stdout.write(s + '\n');
  w('\n================ STRENGTH BLOCK RE-TYPING REPORT ================');
  for (const r of reports) {
    w(`\n[be#${r.be_id}] block#${r.block_id} ${r.outcome.toUpperCase()} :: ${r.slug}  (nr ${r.before_nr}→${r.after_nr})`);
    w(`   verbatim: ${r.verbatim.replace(/\n/g, ' / ')}`);
    if (r.text) w(`   → ${r.text}`);
    if (r.presc) w(`   json: ${JSON.stringify(r.presc)}`);
    for (const f of r.flags) w(`   ⚑ ${f}`);
  }
  w('\n================ COUNTS ================');
  w(`  total strength rows ......................... ${counts.total}`);
  w(`  fully typed (reps + load) ................... ${counts.typed}`);
  w(`  flagged (incomplete in verbatim) ............ ${counts.flagged}`);
  w(`  skipped (clause not found / invalid) ........ ${counts.skipped}`);
  w(`  of flagged, with reps-but-no-load ........... ${counts.fixedNoLoad}`);
}

main().catch((err) => {
  process.stderr.write(`retype_strength_blocks failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
