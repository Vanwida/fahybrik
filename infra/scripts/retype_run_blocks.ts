/**
 * retype_run_blocks.ts — re-type the RUNNING blocks of the Biblioteca de Bloques
 * (table `blocks`, coach_id IS NULL) into the canonical, fully-typed
 * Prescription model (@fahybrid/shared/domain/prescription).
 *
 * WHY
 * ---
 * The original structured pass (parse_blocks_structured.ts → backfill) left the
 * run blocks PARAMS-ONLY or weakly typed: interval runs were `scheme:'rounds'`
 * with a single `work_s` and NO per-set measure+target (the RPE/pace/zone fell
 * into a free-text `note` or was dropped); rest got mis-mapped as work; rep
 * ladders ("2x1200+1x1000+...") and alternating tempos ("20'z2–20'z3–20'z2")
 * lost every segment after the first. This script parses the VERBATIM
 * `blocks.description` (the source of truth) directly into the typed model so
 * EVERY run set carries a `measure` (distance|duration) AND a `target`
 * (zone|pace|rpe) — zero free text.
 *
 * HONESTY CONTRACT (build-right)
 * ------------------------------
 *  - Faithful to the verbatim. "Z4" → zone 4; "15,5km/h" → pace 232 s/km;
 *    "RPE8" → rpe 8. We NEVER fabricate an intensity the text does not state.
 *  - A run set whose verbatim gives NO intensity (bare track series like
 *    "6x400m", "easy run", "sub threshold") is typed with its measure (+rest)
 *    but is left WITHOUT a fabricated target, and its block stays needs_review
 *    with a recorded reason. We surface the gap; we do not paper over it.
 *  - Mixed blocks (run + strength/sled/erg, or prose tests) keep needs_review;
 *    we type the genuine run rows and report the rest. Bogus run rows (a
 *    non-run segment the old parser mislinked to the `run` exercise) are NOT
 *    silently retyped — they are reported as catalog mislinks.
 *  - The verbatim `description` is never mutated. `params_json` is regenerated
 *    from the new prescription via the SHARED prescriptionToParams (single
 *    source of truth) so the scalar summary stays in sync.
 *
 * Idempotent: re-running recomputes the same prescription_json/params_json and
 * needs_review from the verbatim. Dry-run with --dry-run.
 *
 * Run: cd infra && tsx scripts/retype_run_blocks.ts [--dry-run]
 */
import type { Sql } from 'postgres';
import {
  parsePrescription,
  prescriptionToParams,
  prescriptionToText,
  type Measure,
  type Prescription,
  type PrescriptionScheme,
  type PrescriptionSet,
  type Target,
} from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.js';

const DRY_RUN = process.argv.includes('--dry-run');
const RUN_SLUG = 'run';

// ── tiny parsing helpers (verbatim → typed) ─────────────────────────────────

/** "1h20'" → 4800 · "20'" → 1200 · "2'30''" → 150 · "45''" → 45 · "30''" → 30 */
function durationSeconds(text: string): number | undefined {
  const hm = text.match(/(\d+)\s*h\s*(\d+)\s*'/i);
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2]) * 60;
  const h = text.match(/(\d+)\s*h(?![\w'])/i);
  if (h) return Number(h[1]) * 3600;
  const ms = text.match(/(\d+)\s*'\s*(\d+)\s*''/);
  if (ms) return Number(ms[1]) * 60 + Number(ms[2]);
  const m = text.match(/(\d+)\s*'(?!')/);
  if (m) return Number(m[1]) * 60;
  const s = text.match(/(\d+)\s*''/);
  if (s) return Number(s[1]);
  return undefined;
}

/** "4km" → 4000 · "1200" / "400m" → meters (bare 3-4 digits = track metres). */
function distanceMeters(text: string): number | undefined {
  const km = text.match(/(\d+(?:[.,]\d+)?)\s*km(?!\/h)/i);
  if (km) return Math.round(parseFloat(km[1]!.replace(',', '.')) * 1000);
  const m = text.match(/(\d{2,4})\s*m\b/i);
  if (m) return Number(m[1]);
  return undefined;
}

/** Pace target: "15,5km/h" → 232 s/km · "3'50/km" / "4'15/km" / "6'/km" → s/km. */
function paceTarget(text: string): Target | undefined {
  const kmh = text.match(/(\d+(?:[.,]\d+)?)\s*km\/h/i);
  if (kmh) {
    const v = parseFloat(kmh[1]!.replace(',', '.'));
    if (v > 0) return { kind: 'pace', unit: 'per_km', value_s: Math.round(3600 / v) };
  }
  const perKm = text.match(/(\d+)\s*'\s*(\d+)?\s*\/\s*km/);
  if (perKm) return { kind: 'pace', unit: 'per_km', value_s: Number(perKm[1]) * 60 + (perKm[2] ? Number(perKm[2]) : 0) };
  return undefined;
}

/**
 * Zone target. A range is only a CONTIGUOUS "z1-2" / "z1-z2" (no spaces around
 * the dash) — so "z4 – 1' z5" (a spaced en-dash before an unrelated number) is
 * read as the single zone z4, not the bogus range z4-1.
 */
function zoneTarget(text: string): Target | undefined {
  const range = text.match(/z\s*(\d)-z?\s*(\d)\b/i);
  if (range) return { kind: 'hr_zone', min: Number(range[1]), max: Number(range[2]) };
  const single = text.match(/z(?:ona)?\s*(\d)/i);
  return single ? { kind: 'hr_zone', value: Number(single[1]) } : undefined;
}

/** RPE target: "RPE8" / "RPE 10" → rpe. */
function rpeTarget(text: string): Target | undefined {
  const m = text.match(/rpe\s*(\d{1,2})/i);
  return m ? { kind: 'rpe', value: Number(m[1]) } : undefined;
}

/** Most specific intensity present in a fragment (pace > zone > rpe). */
function targetFrom(text: string): Target | undefined {
  return paceTarget(text) ?? zoneTarget(text) ?? rpeTarget(text);
}

// ── run-block parser ────────────────────────────────────────────────────────

type RunParse = {
  prescription: Prescription | null;
  // Reasons the BLOCK can't be cleanly cleared (mixed modality, untyped target,
  // unparsed run content). Empty ⇒ fully, faithfully typed → clearable.
  flags: string[];
};

const ERG_RE = /\b(row|rowing|skierg|ski|ab|assault|bike)\b/i;
const NON_RUN_RE = /sled|burpee|wall ?ball|farmer|lunge|fuerza|press|squat|deadlift|snatch|clean|thruster|plio|sit ?up|estaci|station|sandbag|\bsb\b|\bkb\b|\bdb\b|dumbbell|kettlebell|carry|drag|climb|plate|jump|box|finisher|amrap|wod|\bbw\b/i;
const RUN_KEY_RE = /\brun\b|cinta|treadmill|pista|trote|strides?/i;

/**
 * Strip a leading "Label:" prefix ("Series pista:", "Threshold cinta:") — but
 * ONLY when the prefix is plain label words (no digits / quotes), so a workout
 * token like "6x30''" or a later "Strides:" is never mistaken for a label.
 */
function stripLabel(s: string): string {
  return s.replace(/^[A-Za-zÀ-ÿ ]{1,40}:\s*/, '').trim();
}

/** Parse one interval head "Nx<dur|dist>" → {reps, measure} or null. */
function parseIntervalHead(seg: string): { reps: number; measure: Measure } | null {
  // "12 rounds x 400m" / "5x6'" / "2x1200" / "4x2'30''"
  const m = seg.match(/(\d+)\s*(?:rounds?\s*)?x\s*(\d+(?:'(?:\d+'')?|''|m|km)?)/i);
  if (!m) return null;
  const reps = Number(m[1]);
  const unit = m[2]!;
  const dur = durationSeconds(unit);
  if (dur !== undefined && /['']/.test(unit)) return { reps, measure: { kind: 'duration', seconds: dur } };
  const dist = distanceMeters(unit) ?? (/^\d{2,4}$/.test(unit) ? Number(unit) : undefined);
  if (dist !== undefined) return { reps, measure: { kind: 'distance', meters: dist } };
  if (dur !== undefined) return { reps, measure: { kind: 'duration', seconds: dur } };
  return null;
}

/** Rest seconds from a segment: parens "(1'45'')" or a "– … rest/trote/walking" tail. */
function restFromSegment(seg: string): number | undefined {
  const paren = seg.match(/\(([^)]*?[''][^)]*)\)/);
  if (paren) {
    const r = durationSeconds(paren[1]!);
    if (r !== undefined) return r;
  }
  const tail = seg.split(/[-–]/).slice(1).join('–');
  if (/rest|trote|walking|estátic|recup|on\/|off/i.test(tail) || (tail && /['']/.test(tail) && !parseIntervalHead(tail))) {
    const r = durationSeconds(tail);
    if (r !== undefined) return r;
  }
  return undefined;
}

function measureOf(text: string): Measure | undefined {
  const dur = durationSeconds(text);
  if (dur !== undefined) return { kind: 'duration', seconds: dur };
  const dist = distanceMeters(text);
  if (dist !== undefined) return { kind: 'distance', meters: dist };
  return undefined;
}

/** Parse a single run "+"-segment into 0..N PrescriptionSets. */
function parseRunSegment(seg: string): { sets: PrescriptionSet[]; flags: string[] } {
  const flags: string[] = [];

  // Strides ("6x30'' progresivos 25→90%") carry a %-of-max-speed target the
  // model can't express — surface as a gap, don't merge into the run set.
  if (/strides?/i.test(seg)) {
    flags.push(`strides element not typed (progressive %-of-max-speed has no model target): "${seg.trim()}"`);
    return { sets: [], flags };
  }

  const head = parseIntervalHead(seg);
  if (head) {
    // Target comes from the WORK portion (before the rest separator / parens),
    // so "12x1' z5 – 50'' z1-2" reads the work zone z5, not the recovery z1-2.
    const workText = seg.split(/\s[-–]\s/)[0]!.replace(/\([^)]*\)/g, '');
    const target = targetFrom(workText);
    const rest = restFromSegment(seg);
    if (!target) flags.push(`no intensity target in "${seg.trim()}" (bare series)`);
    const set: PrescriptionSet = { measure: head.measure };
    if (target) set.target = target;
    if (rest !== undefined && rest > 0) set.rest_s = rest;
    return { sets: Array.from({ length: head.reps }, () => ({ ...set })), flags };
  }

  // No "Nx" head → steady or alternating. Split on a spaced dash. The dash is a
  // real segment separator ONLY when ≥2 parts each carry a measure (alternating
  // tempo "20' z2 – 20' z3 – 20' z2"); otherwise it is mere punctuation
  // ("Run zona 2 – 1h25'") and the whole thing is ONE steady set whose measure
  // and target may live in different parts.
  const parts = seg.split(/\s[-–]\s/).map((p) => p.trim()).filter(Boolean);
  const measureParts = parts.filter((p) => measureOf(p) !== undefined);
  const sets: PrescriptionSet[] = [];
  if (measureParts.length >= 2) {
    for (const part of measureParts) {
      const measure = measureOf(part)!;
      const target = targetFrom(part);
      const set: PrescriptionSet = { measure };
      if (target) set.target = target;
      else flags.push(`no intensity target in "${part}"`);
      sets.push(set);
    }
  } else if (measureParts.length === 1) {
    const measure = measureOf(measureParts[0]!)!;
    const target = targetFrom(seg); // target may be in another part ("Run zona 2 – 1h25'")
    const set: PrescriptionSet = { measure };
    if (target) set.target = target;
    else flags.push(`no intensity target in "${seg.trim()}"`);
    sets.push(set);
  }
  return { sets, flags };
}

function parseRunBlock(descRaw: string): RunParse {
  const flags: string[] = [];
  let desc = descRaw.trim();

  // "(+ fuerza)" style addenda → flag mixed, drop from parse.
  desc = desc.replace(/\(\+\s*[^)]*\)/g, (m) => {
    flags.push(`block adds non-run work: ${m}`);
    return '';
  });

  // Warm-up lead-in: drop a leading "… WU →" (a "→" only marks WU here; note a
  // progression like "25→90%" is NOT a WU marker and must survive).
  desc = desc.replace(/^.*?\b(?:WU|calent\w*)\b[^→]*→\s*/i, '').trim();

  // Alternating tempo: "10' z2 – 10' z4 alternado x3 (z4 a 4'15/km)".
  const altM = desc.match(/alternado\s*x\s*(\d+)/i);
  if (altM) {
    const reps = Number(altM[1]);
    const paceHint = paceTarget(desc); // e.g. "(z4 a 4'15/km)"
    const base = desc.replace(/\(.*?\)/g, '').replace(/alternado\s*x\s*\d+/i, '');
    const segParts = base.split(/\s[-–]\s/).map((p) => p.trim()).filter(Boolean);
    const oneCycle: PrescriptionSet[] = [];
    for (const part of segParts) {
      const dur = durationSeconds(part);
      if (dur === undefined) continue;
      const t = paceHint && /z\s*4/i.test(part) ? paceHint : targetFrom(part);
      const set: PrescriptionSet = { measure: { kind: 'duration', seconds: dur } };
      if (t) set.target = t;
      else flags.push(`no intensity target in "${part}"`);
      oneCycle.push(set);
    }
    const sets: PrescriptionSet[] = [];
    for (let i = 0; i < reps; i++) sets.push(...oneCycle.map((s) => ({ ...s })));
    if (sets.length === 0) return { prescription: null, flags };
    return { prescription: buildPrescription(sets), flags };
  }

  // Split on "+", then strip a leading "Label:" from the FIRST segment only
  // (labels lead the block; a later "Strides:" must not be eaten). In a block
  // that owns run rows, a numeric interval/steady segment defaults to RUN unless
  // it carries an erg or non-run movement keyword (and no explicit run keyword).
  const segments = desc
    .split('+')
    .map((s, i) => (i === 0 ? stripLabel(s.trim()) : s.trim()))
    .filter(Boolean);
  const allSets: PrescriptionSet[] = [];
  for (const seg of segments) {
    const hasRunKey = RUN_KEY_RE.test(seg);
    // A non-run movement keyword ALWAYS marks the block mixed (so a station
    // rotation like "3x1' on/off – sled/farmer/lunge/run" is not mistaken for a
    // pure run). When the segment also has its own run content we still type it.
    if (NON_RUN_RE.test(seg)) {
      flags.push(`block mixes non-run work: "${seg}"`);
      if (!hasRunKey) continue;
    } else if (ERG_RE.test(seg) && !hasRunKey) {
      flags.push(`block mixes erg modality: "${seg}"`);
      continue;
    }
    const { sets, flags: segFlags } = parseRunSegment(seg);
    if (sets.length === 0 && segFlags.length === 0) continue; // not run content (e.g. pure prose)
    allSets.push(...sets);
    flags.push(...segFlags);
  }

  if (allSets.length === 0) return { prescription: null, flags };
  return { prescription: buildPrescription(allSets), flags };
}

/** Steady when a single continuous segment; otherwise interval. */
function buildPrescription(sets: PrescriptionSet[]): Prescription {
  const scheme: PrescriptionScheme = sets.length === 1 ? 'steady' : 'interval';
  return { scheme, modality: 'run', sets };
}

/**
 * Fallback for run rows whose verbatim is prose we don't segment (e.g. track
 * TESTS): build a faithful prescription from the row's EXISTING params (which
 * were themselves derived from the verbatim) — duration/distance + rpe/zone.
 */
function prescriptionFromParams(params: Record<string, unknown> | null): Prescription | null {
  if (!params) return null;
  const dur = num(params.duration_seconds);
  const dist = num(params.distance_meters);
  const measure: Measure | undefined =
    dur !== undefined ? { kind: 'duration', seconds: dur } : dist !== undefined ? { kind: 'distance', meters: dist } : undefined;
  if (!measure) return null;
  let target: Target | undefined;
  const rpe = num(params.rpe);
  const zone = num(params.hr_zone);
  const pace = num(params.pace_sec_per_km);
  if (rpe !== undefined) target = { kind: 'rpe', value: rpe };
  else if (zone !== undefined) target = { kind: 'hr_zone', value: zone };
  else if (pace !== undefined) target = { kind: 'pace', unit: 'per_km', value_s: pace };
  const set: PrescriptionSet = { measure };
  if (target) set.target = target;
  const rest = num(params.rest_seconds);
  if (rest !== undefined && rest > 0) set.rest_s = rest;
  return { scheme: 'steady', modality: 'run', sets: [set] };
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Every set carries a measure AND a target → fully typed, zero free text. */
function fullyTyped(p: Prescription): boolean {
  if (!p.sets || p.sets.length === 0) return false;
  return p.sets.every((s) => s.measure !== undefined && s.target !== undefined);
}

function asJson(p: Prescription): Parameters<Sql['json']>[0] {
  return JSON.parse(JSON.stringify(p)) as Parameters<Sql['json']>[0];
}

// ── DB driver ─────────────────────────────────────────────────────────────

interface BlockRow {
  id: string;
  title: string;
  description: string;
  g: string;
  needs_review: boolean;
}
interface RunExRow {
  id: string;
  block_position: string;
  params_json: Record<string, unknown> | null;
  has_measure: boolean;
}

type Outcome = 'retyped' | 'already_good' | 'flagged' | 'partial';

interface BlockReport {
  id: number;
  group: number;
  title: string;
  verbatim: string;
  outcome: Outcome;
  reasons: string[];
  examples: Array<{ be_id: number; text: string; presc: Prescription }>;
}

async function main(): Promise<void> {
  const sql = getSql();
  const host = process.env.DATABASE_URL?.match(/@([^/:]+)/)?.[1] ?? '?';
  if (!host.includes('ep-flat-wind')) {
    throw new Error(`Refusing to run: DATABASE_URL host is "${host}", expected the demo branch ep-flat-wind.`);
  }
  process.stdout.write(`[retype_run_blocks] host=${host} mode=${DRY_RUN ? 'dry-run' : 'apply'}\n`);

  const reports: BlockReport[] = [];
  try {
    const runExId = (await sql<Array<{ id: string }>>`select id::text from exercises where slug = ${RUN_SLUG}`)[0]?.id;
    if (!runExId) throw new Error('run exercise not found in catalog');

    // Every library block that owns at least one `run` block_exercise.
    const blocks = await sql<BlockRow[]>`
      select b.id::text, b.title, b.description, b.methodology_group_id::text as g, b.needs_review
      from blocks b
      where b.coach_id is null
        and exists (select 1 from block_exercises be where be.block_id = b.id and be.exercise_id = ${runExId}::bigint)
      order by b.id`;

    for (const b of blocks) {
      const blockId = Number(b.id);
      const runRows = await sql<RunExRow[]>`
        select be.id::text, be.block_position::text,
               be.params_json,
               (coalesce(be.params_json->>'duration_seconds', be.params_json->>'distance_meters') is not null) as has_measure
        from block_exercises be
        where be.block_id = ${blockId} and be.exercise_id = ${runExId}::bigint
        order by be.block_position, be.position`;
      const totalRows = Number(
        (await sql<Array<{ c: string }>>`select count(*)::text as c from block_exercises where block_id = ${blockId}`)[0]!.c,
      );

      const report: BlockReport = {
        id: blockId, group: Number(b.g), title: b.title, verbatim: b.description,
        outcome: 'flagged', reasons: [], examples: [],
      };

      const parsed = parseRunBlock(b.description);
      const segPrescriptions: Prescription[] = parsed.prescription ? [parsed.prescription] : [];

      // Assign parsed run-prescription(s) to genuine run rows. A genuine run row
      // already carries a run measure (or the block has a single run row). Bogus
      // run rows (non-run segment mislinked to `run`) carry no measure in a
      // multi-row block → reported, never silently retyped.
      const genuine = runRows.filter((r) => r.has_measure || runRows.length === 1);
      const bogus = runRows.filter((r) => !genuine.includes(r));
      for (const r of bogus) report.reasons.push(`be#${r.id} (pos ${r.block_position}) is a run row with no run measure — likely a non-run segment mislinked to the run exercise`);

      const writes: Array<{ beId: number; presc: Prescription }> = [];

      if (segPrescriptions.length > 0) {
        // One verbatim run prescription → apply to each genuine run row that
        // matches (single-segment blocks have one run row; the rare two-run-row
        // block with one parsed prescription applies it to the measure-bearing row).
        if (genuine.length === 1) {
          writes.push({ beId: Number(genuine[0]!.id), presc: parsed.prescription! });
        } else {
          // Multiple genuine run rows but a single combined parse → rebuild each
          // from its own params (faithful, lossless per row) to avoid mis-merge.
          for (const r of genuine) {
            const p = prescriptionFromParams(r.params_json);
            if (p) writes.push({ beId: Number(r.id), presc: p });
            else report.reasons.push(`be#${r.id} could not be typed from params`);
          }
        }
      } else {
        // Verbatim not segmentable (prose tests etc) → per-row params fallback.
        for (const r of genuine) {
          const p = prescriptionFromParams(r.params_json);
          if (p) writes.push({ beId: Number(r.id), presc: p });
          else report.reasons.push(`be#${r.id} not parseable from verbatim or params`);
        }
        if (writes.length === 0 && parsed.flags.length === 0) report.reasons.push('no run prescription parseable from verbatim');
      }

      report.reasons.push(...parsed.flags);

      // Validate every prescription against the shared zod model before writing.
      const validated: Array<{ beId: number; presc: Prescription }> = [];
      for (const w of writes) {
        try {
          const p = parsePrescription(asJson(w.presc));
          validated.push({ beId: w.beId, presc: p });
        } catch (e) {
          report.reasons.push(`be#${w.beId} failed schema validation: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Decide the BLOCK-level needs_review ONLY for blocks that are entirely a
      // running session (run-oriented group AND no erg/non-run/bogus content).
      // For mixed / multi-modality / WOD blocks we type the run leg but make NO
      // block-level assertion — those legs are out of scope, so we leave the
      // block's needs_review exactly as the prior structured pass set it.
      const mixed = parsed.flags.some((f) => f.startsWith('block mixes') || f.startsWith('block adds')) || bogus.length > 0;
      const runOriented = ['4', '5', '10'].includes(b.g);
      const allRowsAreRun = totalRows === runRows.length;
      const pureRunBlock = runOriented && !mixed && allRowsAreRun;
      const everyGenuineTyped =
        genuine.length > 0 && validated.length === genuine.length && validated.every((v) => fullyTyped(v.presc));
      // A pure run block clears only when nothing at all was flagged (no missing
      // intensity, no un-typeable strides / model gap).
      const clearBlock = pureRunBlock && everyGenuineTyped && parsed.flags.length === 0;

      // Apply the run-row prescriptions (faithful run legs are written even in
      // mixed blocks; the row's own needs_review reflects whether IT is fully typed).
      for (const v of validated) {
        const params = prescriptionToParams(v.presc);
        report.examples.push({ be_id: v.beId, text: prescriptionToText(v.presc), presc: v.presc });
        if (!DRY_RUN) {
          await sql`
            update block_exercises
            set prescription_json = ${sql.json(asJson(v.presc))},
                params_json = ${sql.json(params as Parameters<Sql['json']>[0])},
                needs_review = ${!fullyTyped(v.presc)},
                updated_at = now()
            where id = ${v.beId}::bigint`;
        }
      }
      // Only touch block.needs_review for pure run blocks (clear them or, when a
      // run rep has no verbatim intensity, leave/set the flag). Mixed blocks: no-op.
      if (pureRunBlock && !DRY_RUN) {
        await sql`update blocks set needs_review = ${!clearBlock} where id = ${blockId}`;
      }

      if (clearBlock) report.outcome = 'retyped';
      else if (pureRunBlock) report.outcome = 'flagged'; // pure run but missing intensity
      else report.outcome = 'partial'; // mixed/WOD: run leg typed, block left as-is
      reports.push(report);
    }

    printReport(reports);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function printReport(reports: BlockReport[]): void {
  const w = (s: string) => process.stdout.write(s + '\n');
  const retyped = reports.filter((r) => r.outcome === 'retyped');
  const good = reports.filter((r) => r.outcome === 'already_good');
  const flagged = reports.filter((r) => r.outcome === 'flagged');
  const partial = reports.filter((r) => r.outcome === 'partial');

  w('\n================ RUN BLOCK RE-TYPING REPORT ================');
  for (const r of reports) {
    w(`\n[${r.id}] g${r.group} ${r.outcome.toUpperCase()} :: ${r.title}`);
    w(`   verbatim: ${r.verbatim.replace(/\n/g, ' / ')}`);
    for (const ex of r.examples) w(`   → be#${ex.be_id}: ${ex.text}  ::  ${JSON.stringify(ex.presc)}`);
    for (const reason of r.reasons) w(`   ⚑ ${reason}`);
  }
  w('\n================ COUNTS ================');
  w(`  run blocks found ............................ ${reports.length}`);
  w(`  pure run, re-typed + cleared ................ ${retyped.length}`);
  w(`  pure run, already fully typed ............... ${good.length}`);
  w(`  pure run, flagged (no verbatim intensity) ... ${flagged.length}`);
  w(`  mixed/WOD, run leg typed (block left as-is) . ${partial.length}`);
  w(`\n  pure-run flagged ids: ${flagged.map((r) => r.id).join(', ')}`);
  w(`  mixed/WOD ids: ${partial.map((r) => r.id).join(', ')}`);
}

main().catch((err) => {
  process.stderr.write(`retype_run_blocks failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
