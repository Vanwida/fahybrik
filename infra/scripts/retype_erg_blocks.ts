/**
 * retype_erg_blocks.ts — re-type the ERGOMETER block_exercises of the Biblioteca
 * de Bloques into the canonical, fully-typed Prescription model
 * (@fahybrid/shared/domain/prescription).
 *
 * SCOPE
 * -----
 * Every `block_exercises` row whose `prescription_json->>'modality'` is one of
 * `row` | `ski` | `bike` (the three ergometer modalities). One row = one
 * modality leg of its parent block. The modality is INTRINSIC to the exercise
 * (BikeErg is a bike, SkiErg is a ski) — we NEVER change it; we only re-type the
 * dosage (scheme + per-set measure + target + rest) for that leg.
 *
 * WHY
 * ---
 * The prior structured pass left erg legs PARAMS-ONLY or, worse, carrying
 * FABRICATED intensities the verbatim never stated (e.g. block 402 "a ritmo de
 * carrera" was hard-coded to 1:55/1:50 paces lifted from a different block; block
 * 399's ski leg invented "3×250m"). This script parses the VERBATIM
 * `blocks.description` (the single source of truth) directly into the typed
 * model so EVERY erg set carries a `measure` (distance|duration|calories) and,
 * WHEN AND ONLY WHEN the text states one, a `target` (pace /500m | watts | rpe |
 * hr_zone). No number in the verbatim ⇒ no target ⇒ the row stays needs_review.
 *
 * HONESTY CONTRACT (build-right)
 * ------------------------------
 *  - Faithful to the verbatim. "RPE8" → rpe 8; "z2" → zone 2; "1'55/500m" → pace
 *    115 s/500m; "10 cal" → calories 10. We NEVER fabricate an intensity the text
 *    does not state, and we strip intensities a prior pass fabricated.
 *  - An erg set whose verbatim gives a measure but NO intensity ("5x4' – 55''
 *    rest", "4r → 1km row", "THRESHOLD") is typed with its measure (+rest) and
 *    left WITHOUT a target; that row's `needs_review` is set true.
 *  - An erg leg whose verbatim gives NO concrete work either (a prose/plyo block
 *    that merely mentions the modality, or "3 rounds … ski" with no per-round
 *    volume) is typed as thinly as the text allows and flagged needs_review.
 *  - The verbatim `description` is never mutated. `params_json` is regenerated
 *    from the new prescription via the SHARED prescriptionToParams.
 *  - We touch ONLY `block_exercises` (prescription_json, params_json,
 *    needs_review, updated_at). We do NOT touch `blocks.needs_review` — the
 *    block-level rollup is a separate, final step.
 *
 * Idempotent: re-running recomputes the same prescription_json / params_json /
 * needs_review from the verbatim. Dry-run with --dry-run.
 *
 * Run: cd infra && tsx scripts/retype_erg_blocks.ts [--dry-run]
 */
import type { Sql } from 'postgres';
import {
  parsePrescription,
  prescriptionToParams,
  prescriptionToText,
  type Measure,
  type Modality,
  type Prescription,
  type PrescriptionScheme,
  type PrescriptionSet,
  type Target,
} from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.js';

const DRY_RUN = process.argv.includes('--dry-run');
const ERG_MODALITIES: Modality[] = ['row', 'ski', 'bike'];

// ── Normalization ───────────────────────────────────────────────────────────
// Unify the assorted time/quote glyphs Pablo's source uses so a single set of
// regexes works: a straight double-quote (1'30") and the smart variants all
// become the "seconds" marker `''`; smart apostrophes become `'`.
function normalize(text: string): string {
  return text
    .replace(/[′’‘]/g, "'") // ′ ' ' → '
    .replace(/[″“”]/g, "''") // ″ " " → ''
    .replace(/"/g, "''") // straight double-quote → ''
    .replace(/[ ]/g, ' '); // nbsp → space
}

// ── Modality keywords ───────────────────────────────────────────────────────
const MODALITY_RE: Record<Modality, RegExp> = {
  row: /\brow(?:ing)?\b/i,
  ski: /\bski(?:\s?-?erg)?\b/i,
  bike: /\bbike\b|\bAB\b|assault|air\s?bike/i,
  run: /\brun\b/i,
  strength: /\b__never__\b/,
  functional: /\b__never__\b/,
  core: /\b__never__\b/,
  mobility: /\b__never__\b/,
  other: /\b__never__\b/,
};
const hasModality = (text: string, m: Modality) => MODALITY_RE[m].test(text);
/** Modality matcher as a non-capturing group, safe to embed in a larger regex. */
const modalitySrc = (m: Modality) => `(?:${MODALITY_RE[m].source})`;

// ── Measure parsing ─────────────────────────────────────────────────────────

/** "1h20'" → 4800 · "20'" → 1200 · "3'30''" → 210 · "45''" → 45 */
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

/** "1km" → 1000 · "1000m"/"400m" → meters. */
function distanceMeters(text: string): number | undefined {
  const km = text.match(/(\d+(?:[.,]\d+)?)\s*km(?!\/h)/i);
  if (km) return Math.round(parseFloat(km[1]!.replace(',', '.')) * 1000);
  const m = text.match(/(\d{2,5})\s*m\b/i);
  if (m) return Number(m[1]);
  return undefined;
}

/** "10 cal" / "15cal" → calories. */
function calories(text: string): number | undefined {
  const c = text.match(/(\d+)\s*cal/i);
  return c ? Number(c[1]) : undefined;
}

/** Most specific measure in a fragment: calories > distance > duration. */
function measureOf(text: string): Measure | undefined {
  const cal = calories(text);
  if (cal !== undefined) return { kind: 'calories', value: cal };
  const dist = distanceMeters(text);
  if (dist !== undefined) return { kind: 'distance', meters: dist };
  const dur = durationSeconds(text);
  if (dur !== undefined) return { kind: 'duration', seconds: dur };
  return undefined;
}

// ── Target parsing (intensity — never fabricated) ───────────────────────────

/** Erg pace "1'55/500m" → 115 s/500m. Also tolerates "/500" without the m. */
function paceTarget(text: string): Target | undefined {
  const m = text.match(/(\d+)\s*'\s*(\d+)?\s*\/\s*500\s*m?/i);
  if (!m) return undefined;
  const secs = Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
  return { kind: 'pace', unit: 'per_500m', value_s: secs };
}

/** Erg power "250 w" / "250W" → watts. */
function wattsTarget(text: string): Target | undefined {
  const m = text.match(/(\d+)\s*w(?:atts?)?\b/i);
  return m ? { kind: 'watts', value: Number(m[1]) } : undefined;
}

/** HR zone "z2" / "Z1-2" (contiguous range only). */
function zoneTarget(text: string): Target | undefined {
  const range = text.match(/z\s*(\d)-z?\s*(\d)\b/i);
  if (range) return { kind: 'hr_zone', min: Number(range[1]), max: Number(range[2]) };
  const single = text.match(/z(?:ona)?\s*(\d)\b/i);
  return single ? { kind: 'hr_zone', value: Number(single[1]) } : undefined;
}

/** "RPE8" / "RPE 10" → rpe. */
function rpeTarget(text: string): Target | undefined {
  const m = text.match(/rpe\s*(\d{1,2})/i);
  return m ? { kind: 'rpe', value: Number(m[1]) } : undefined;
}

/** Most specific intensity present in a fragment (pace > watts > zone > rpe). */
function targetFrom(text: string): Target | undefined {
  return paceTarget(text) ?? wattsTarget(text) ?? zoneTarget(text) ?? rpeTarget(text);
}

/**
 * Pace stated for a specific modality inside a prose pace table, e.g.
 * "Ritmos objetivo: run 3'40-3'50/km, ski 1'55/500m, row 1'50/500m" → for ski
 * returns 115. Scans a short window after the modality keyword for a /500m pace,
 * so we attribute the right pace to the right modality and never cross blocks.
 */
function paceForModality(desc: string, m: Modality): Target | undefined {
  const re = new RegExp(`${modalitySrc(m)}[^,.;:]{0,20}?(\\d+)\\s*'\\s*(\\d+)?\\s*/\\s*500\\s*m?`, 'i');
  const match = desc.match(re);
  if (!match) return undefined;
  const secs = Number(match[1]) * 60 + (match[2] ? Number(match[2]) : 0);
  return { kind: 'pace', unit: 'per_500m', value_s: secs };
}

// ── Rest parsing ────────────────────────────────────────────────────────────
/** Trailing "– 90'' rest" / "(1'45'')" / "1' rest" anywhere in the text. */
function restFrom(text: string): number | undefined {
  // explicit "<dur> rest" / "rest <dur>"
  const restWord = text.match(/(\d+\s*(?:'\s*\d*\s*''|''|'))\s*rest|rest\s*(\d+\s*(?:'\s*\d*\s*''|''|'))/i);
  if (restWord) {
    const r = durationSeconds(restWord[1] ?? restWord[2] ?? '');
    if (r !== undefined) return r;
  }
  // "off" portion of an on/off interval
  const off = text.match(/\/\s*(\d+\s*(?:'\s*\d*\s*''|''|'))\s*off/i);
  if (off) {
    const r = durationSeconds(off[1]!);
    if (r !== undefined) return r;
  }
  return undefined;
}

// ── Builders ────────────────────────────────────────────────────────────────

type Leg = { prescription: Prescription | null; flags: string[] };

function expandSets(reps: number, template: PrescriptionSet): PrescriptionSet[] {
  return Array.from({ length: reps }, () => ({ ...template }));
}

function noIntensity(seg: string, flags: string[]): void {
  flags.push(`no intensity target in verbatim — left untyped: "${seg.trim()}"`);
}

// 1) Rep ladder over rounds: "3r 27-21-15-9 AB + Skierg – 90'' rest"
function matchRepLadder(desc: string, m: Modality): Leg | null {
  const lad = desc.match(/(\d+)\s*r\b[^→]*?(\d+(?:-\d+){2,})/i); // ladder = ≥3 rungs
  if (!lad) return null;
  if (!hasModality(desc, m)) return null;
  const flags: string[] = [];
  const isCal = /cal/i.test(desc);
  const rungs = lad[2]!.split('-').map(Number);
  const rest = restFrom(desc);
  const target = targetFrom(desc.replace(/\d+(?:-\d+){2,}/g, '')); // ignore the ladder digits
  const sets: PrescriptionSet[] = rungs.map((n) => {
    const set: PrescriptionSet = {
      measure: isCal ? { kind: 'calories', value: n } : { kind: 'reps', value: n },
    };
    if (target) set.target = target;
    if (rest !== undefined && rest > 0) set.rest_s = rest;
    return set;
  });
  if (!target) noIntensity(desc, flags);
  const rounds = Number(lad[1]);
  if (rounds > 1) flags.push(`verbatim states "${rounds}r" rounds over the ${rungs.join('-')} ladder — typed the explicit ladder rungs`);
  return { prescription: { scheme: 'sets', modality: m, sets }, flags };
}

// 2) Rounds → distance/duration per modality: "4r → 1km row + 1km ski – 90'' rest"
function matchRoundsArrow(desc: string, m: Modality): Leg | null {
  const head = desc.match(/(\d+)\s*r\b[^→]*→\s*(.+)/i);
  if (!head) return null;
  const reps = Number(head[1]);
  const body = head[2]!;
  const frag = body
    .split('+')
    .map((s) => s.trim())
    .find((s) => hasModality(s, m));
  if (!frag) return null;
  const measure = measureOf(frag);
  if (!measure) return null;
  const flags: string[] = [];
  const rest = restFrom(body);
  const target = paceForModality(desc, m) ?? targetFrom(frag);
  const template: PrescriptionSet = { measure };
  if (target) template.target = target;
  if (rest !== undefined && rest > 0) template.rest_s = rest;
  if (!target) noIntensity(frag, flags);
  return { prescription: { scheme: 'interval', modality: m, sets: expandSets(reps, template) }, flags };
}

// 3) On/off station intervals: "3×(1' on / 1' off) por estación (ski, row, AB, sled)"
function matchOnOff(desc: string, m: Modality): Leg | null {
  const head = desc.match(/(\d+)\s*[x×]\s*\(\s*([^/)]+?)\s*(?:on)?\s*\/\s*([^)]+?)\s*(?:off)?\s*\)/i);
  if (!head) return null;
  if (!hasModality(desc, m)) return null;
  const work = durationSeconds(head[2]!);
  if (work === undefined) return null;
  const reps = Number(head[1]);
  const rest = durationSeconds(head[3]!);
  const flags: string[] = [];
  const target = paceForModality(desc, m) ?? targetFrom(head[2]!);
  const template: PrescriptionSet = { measure: { kind: 'duration', seconds: work } };
  if (target) template.target = target;
  if (rest !== undefined && rest > 0) template.rest_s = rest;
  if (!target) noIntensity(head[0]!, flags);
  return { prescription: { scheme: 'interval', modality: m, sets: expandSets(reps, template) }, flags };
}

// 4) Simple interval (single erg leg): "5' WU → 5x3'30'' RPE8 – 50'' rest"
function matchSimpleInterval(desc: string, m: Modality): Leg | null {
  // Strip a leading "<MOD>: 5' WU →" lead-in so the WU minutes aren't read as work.
  const afterWu = desc.replace(/^.*?(?:WU|calent\w*)[^→]*→\s*/i, '');
  const work = afterWu === desc ? desc : afterWu;
  const head = work.match(/(\d+)\s*[x×]\s*(\d+\s*'(?:\s*\d+\s*'')?|\d+\s*''|\d+\s*'(?!\d))/i);
  if (!head) return null;
  const reps = Number(head[1]);
  const dur = durationSeconds(head[2]!);
  if (dur === undefined) return null;
  if (!hasModality(desc, m)) return null;
  const flags: string[] = [];
  // Target from the work portion (before the rest separator), so a recovery zone
  // in the rest tail is never mistaken for the work intensity.
  const workText = work.split(/\s[-–]\s/)[0]!.replace(/\([^)]*\)/g, '');
  const target = targetFrom(workText);
  const rest = restFrom(work);
  const template: PrescriptionSet = { measure: { kind: 'duration', seconds: dur } };
  if (target) template.target = target;
  if (rest !== undefined && rest > 0) template.rest_s = rest;
  if (!target) noIntensity(work, flags);
  return { prescription: { scheme: 'interval', modality: m, sets: expandSets(reps, template) }, flags };
}

// 5) AMRAP: "AMRAP 15': 10 cal row + 100m run + …"
function matchAmrap(desc: string, m: Modality): Leg | null {
  const amr = desc.match(/amrap\s*(\d+)\s*'?/i);
  if (!amr) return null;
  // The AMRAP clause runs from the keyword to the next sentence break.
  const clause = desc.slice(desc.toLowerCase().indexOf('amrap')).split(/[.](?:\s|$)/)[0]!;
  const frag = clause
    .split('+')
    .map((s) => s.trim())
    .find((s) => hasModality(s, m));
  if (!frag) return null; // modality not in the AMRAP itself → let another matcher try
  const measure = measureOf(frag);
  if (!measure) return null;
  const flags: string[] = [];
  const total = Number(amr[1]) * 60;
  const target = targetFrom(frag);
  const set: PrescriptionSet = { measure };
  if (target) set.target = target;
  if (!target) noIntensity(frag, flags);
  return { prescription: { scheme: 'amrap', modality: m, total_s: total, sets: [set] }, flags };
}

// 6) HYROX-sim / prose with a per-modality distance + pace table:
//    "(Ski 1000m → … → Row 1000m → …) … Ritmos: ski 1'55/500m, row 1'50/500m"
function matchModalityDistancePace(desc: string, m: Modality): Leg | null {
  // "<MOD> <distance>" — modality keyword immediately followed by a distance.
  const re = new RegExp(`${modalitySrc(m)}\\s*(\\d+(?:[.,]\\d+)?\\s*(?:km|m)\\b)`, 'i');
  const match = desc.match(re);
  if (!match) return null;
  const measure = measureOf(match[1]!);
  if (!measure) return null;
  const flags: string[] = [];
  const target = paceForModality(desc, m);
  const set: PrescriptionSet = { measure };
  if (target) set.target = target;
  if (!target) noIntensity(match[0]!, flags);
  return { prescription: { scheme: 'steady', modality: m, sets: [set] }, flags };
}

// 7) Steady list: "10' row z2 + 10' skierg z2 + …" or prose "Row 10' técnica Z2".
function matchSteady(desc: string, m: Modality): Leg | null {
  const frag = desc
    .split(/[+,]/)
    .map((s) => s.trim())
    .find((s) => hasModality(s, m) && measureOf(s) !== undefined);
  if (!frag) return null;
  const measure = measureOf(frag)!;
  const flags: string[] = [];
  const target = paceForModality(desc, m) ?? targetFrom(frag);
  const set: PrescriptionSet = { measure };
  if (target) set.target = target;
  if (!target) noIntensity(frag, flags);
  return { prescription: { scheme: 'steady', modality: m, sets: [set] }, flags };
}

// 8) Bare "N rounds … <modality>" with no per-round volume → thin rounds shell.
function matchRoundsNoMeasure(desc: string, m: Modality): Leg | null {
  const r = desc.match(/(\d+)\s*(?:rounds?|r)\b[^.]*/i);
  if (!r) return null;
  if (!hasModality(r[0]!, m)) return null;
  const flags: string[] = [];
  flags.push(`verbatim names ${m} in a ${Number(r[1])}-round set with no per-round volume — typed rounds only`);
  const out: Prescription = { scheme: 'rounds', modality: m, rounds: Number(r[1]) };
  const target = targetFrom(r[0]!);
  if (target) out.target = target;
  return { prescription: out, flags };
}

// 9) Last resort: no matcher found concrete work for this known-modality leg
//    (e.g. block 85 "Trabajo plio … en sesiones de z2" never says "bike"). Keep
//    any intensity the verbatim DOES state (the grounded z2) at block level and
//    flag — never leave stale/fabricated data, never invent a measure.
function matchTargetOnly(desc: string, m: Modality): Leg {
  const target = targetFrom(desc);
  const flags: string[] = [
    target
      ? `no concrete erg work (measure) in verbatim for ${m} — typed the stated intensity only`
      : `no concrete erg work or intensity in verbatim for ${m} — left untyped`,
  ];
  const out: Prescription = { scheme: 'steady', modality: m };
  if (target) out.target = target;
  return { prescription: out, flags };
}

const MATCHERS: Array<(d: string, m: Modality) => Leg | null> = [
  matchRepLadder,
  matchRoundsArrow,
  matchOnOff,
  matchSimpleInterval,
  matchAmrap,
  matchModalityDistancePace,
  matchSteady,
  matchRoundsNoMeasure,
  matchTargetOnly,
];

function parseErgLeg(descRaw: string, m: Modality): Leg {
  const desc = normalize(descRaw).trim();
  for (const matcher of MATCHERS) {
    const leg = matcher(desc, m);
    if (leg && leg.prescription) return leg;
  }
  return { prescription: null, flags: [`could not parse any ${m} prescription from verbatim`] };
}

/** Every set carries a measure AND a target → fully typed, zero free text. */
function fullyTyped(p: Prescription): boolean {
  if (!p.sets || p.sets.length === 0) return false;
  return p.sets.every((s) => s.measure !== undefined && s.target !== undefined);
}

function asJson(p: Prescription): Parameters<Sql['json']>[0] {
  return JSON.parse(JSON.stringify(p)) as Parameters<Sql['json']>[0];
}

// ── DB driver ───────────────────────────────────────────────────────────────

interface ErgRow {
  id: string;
  block_id: string;
  block_position: string;
  modality: Modality;
  title: string;
  description: string;
  g: string;
}

interface RowReport {
  be_id: number;
  block_id: number;
  group: number;
  modality: Modality;
  title: string;
  verbatim: string;
  typed: boolean; // measure + target on every set
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
  process.stdout.write(`[retype_erg_blocks] host=${host} mode=${DRY_RUN ? 'dry-run' : 'apply'}\n`);

  const reports: RowReport[] = [];
  try {
    const rows = await sql<ErgRow[]>`
      select be.id::text, be.block_id::text, be.block_position::text,
             be.prescription_json->>'modality' as modality,
             b.title, b.description, b.methodology_group_id::text as g
      from block_exercises be
      join blocks b on b.id = be.block_id
      where be.prescription_json->>'modality' in ('row','ski','bike')
      order by be.block_id::bigint, be.block_position, be.position`;

    for (const r of rows) {
      const beId = Number(r.id);
      const leg = parseErgLeg(r.description, r.modality);
      const report: RowReport = {
        be_id: beId,
        block_id: Number(r.block_id),
        group: Number(r.g),
        modality: r.modality,
        title: r.title,
        verbatim: r.description,
        typed: false,
        text: '',
        presc: null,
        flags: [...leg.flags],
      };

      if (!leg.prescription) {
        report.flags.push('UNPARSED — left as-is, needs_review');
        reports.push(report);
        continue;
      }

      // Validate against the shared zod model before writing.
      let presc: Prescription;
      try {
        presc = parsePrescription(asJson(leg.prescription));
      } catch (e) {
        report.flags.push(`schema validation failed: ${e instanceof Error ? e.message : String(e)}`);
        reports.push(report);
        continue;
      }

      const typed = fullyTyped(presc);
      report.presc = presc;
      report.typed = typed;
      report.text = prescriptionToText(presc);

      if (!DRY_RUN) {
        const params = prescriptionToParams(presc);
        await sql`
          update block_exercises
          set prescription_json = ${sql.json(asJson(presc))},
              params_json = ${sql.json(params as Parameters<Sql['json']>[0])},
              needs_review = ${!typed},
              updated_at = now()
          where id = ${beId}::bigint`;
      }
      reports.push(report);
    }

    printReport(reports);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function printReport(reports: RowReport[]): void {
  const w = (s: string) => process.stdout.write(s + '\n');
  w('\n================ ERG BLOCK RE-TYPING REPORT ================');
  let lastBlock = -1;
  for (const r of reports) {
    if (r.block_id !== lastBlock) {
      w(`\n=== block ${r.block_id} g${r.group} :: ${r.title}`);
      w(`   verbatim: ${r.verbatim.replace(/\n/g, ' / ')}`);
      lastBlock = r.block_id;
    }
    const tag = r.typed ? 'TYPED' : 'NEEDS_REVIEW';
    w(`   → be#${r.be_id} [${r.modality}] ${tag}: ${r.text || '(unparsed)'}`);
    if (r.presc) w(`       ${JSON.stringify(r.presc)}`);
    for (const f of r.flags) w(`       ⚑ ${f}`);
  }

  const typed = reports.filter((r) => r.typed).length;
  const flagged = reports.length - typed;
  w('\n================ COUNTS ================');
  w(`  total erg block_exercises ............ ${reports.length}`);
  w(`  fully typed (measure + target) ....... ${typed}`);
  w(`  flagged needs_review (no/partial) .... ${flagged}`);
  w(`  flagged be ids: ${reports.filter((r) => !r.typed).map((r) => r.be_id).join(', ')}`);
  void ERG_MODALITIES;
}

main().catch((err) => {
  process.stderr.write(`retype_erg_blocks failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
