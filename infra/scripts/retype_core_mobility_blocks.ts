/**
 * retype_core_mobility_blocks.ts — re-type the CORE / MOBILITY / OTHER block
 * exercises of the Biblioteca de Bloques into the canonical, fully-typed
 * Prescription model (@fahybrid/shared/domain/prescription) so each line carries
 * a real per-item `measure` (reps | duration) that iOS can read — instead of the
 * weak scheme-only shape (`rounds`/`work_s`, or a fabricated `total_s`) the prior
 * pass left behind.
 *
 * SCOPE: every `block_exercises` row whose `prescription_json->>'modality'` is in
 * ('core','mobility','other').
 *
 * GROUND TRUTH (build-right honesty contract)
 * -------------------------------------------
 *  - The SOURCE OF TRUTH is the parent `blocks.description` (verbatim). We parse
 *    the phrase that belongs to THIS exercise out of the verbatim and type only
 *    what the text states. "4x40''/20''" → 4 sets of {duration 40, rest 20};
 *    "10' caminando" → 600 s; "Dead bug 3x12" → 3 sets of 12 reps.
 *  - We NEVER fabricate a measure the verbatim does not state. A movement whose
 *    verbatim gives no quantity ("Side plank", bare "Movilidad + técnica") is
 *    typed WITHOUT a measure and flagged `needs_review = true`.
 *  - A number is attached to a movement ONLY when it sits in the SAME delimiter
 *    window as the movement keyword. This is deliberate: in block 390 the test
 *    duration "...de 30' en pista (ACC). Movilidad" sits before a sentence break,
 *    so the "30'" is NOT misread as the mobility flow's duration.
 *  - The verbatim `description` is never mutated. `params_json` is regenerated
 *    from the new prescription via the SHARED prescriptionToParams.
 *  - We set ONLY `block_exercises.needs_review`. We DO NOT touch
 *    `blocks.needs_review` (a block is multi-modality; this pass owns only its
 *    core/mobility/other legs).
 *
 * AGNOSTIC: no methodology assumptions; pure verbatim → typed model.
 *
 * Idempotent: re-running recomputes the same prescription/params/needs_review
 * from the verbatim. Dry-run with --dry-run.
 *
 * Run: cd infra && tsx scripts/retype_core_mobility_blocks.ts [--dry-run]
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
const SCOPE_MODALITIES = ['core', 'mobility', 'other'] as const;

// ── verbatim → typed helpers ────────────────────────────────────────────────

/** "1h20'" → 4800 · "20'" → 1200 · "2'30''" → 150 · "45''" → 45 · "30''" → 30 */
function durationSeconds(text: string): number | undefined {
  const hm = text.match(/(\d+)\s*h\s*(\d+)\s*'/i);
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2]) * 60;
  const h = text.match(/(\d+)\s*h(?![\w'])/i);
  if (h) return Number(h[1]) * 3600;
  const ms = text.match(/(\d+)\s*'\s*(\d+)\s*''/);
  if (ms) return Number(ms[1]) * 60 + Number(ms[2]);
  const sec = text.match(/(\d+)\s*''/);
  if (sec) return Number(sec[1]);
  const min = text.match(/(\d+)\s*'(?!')/);
  if (min) return Number(min[1]) * 60;
  return undefined;
}

/** RPE target: "RPE8" / "RPE 10" → rpe. The only target this domain expresses. */
function rpeTarget(text: string): Target | undefined {
  const m = text.match(/rpe\s*(\d{1,2})/i);
  return m ? { kind: 'rpe', value: Number(m[1]) } : undefined;
}

// Movement keywords per catalog slug. A row's quantity is read from the verbatim
// window around the FIRST unused match of one of these keywords (positional rank
// disambiguates two rows that share a slug, e.g. Side plank + Lateral plank both
// mapped to `side-plank`). Falls back to the exercise-name tokens.
const SLUG_KEYWORDS: Record<string, string[]> = {
  'side-plank': ['plank'],
  'mobility-hip-flow-15min': ['movilidad', 'mobility', 'flow'],
  walk: ['caminando', 'caminar', 'walk', 'andar'],
};

function keywordsFor(slug: string | null, exName: string | null): string[] {
  if (slug && SLUG_KEYWORDS[slug]) return SLUG_KEYWORDS[slug]!;
  const tokens = (exName ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  return tokens.length > 0 ? tokens : [slug ?? ''];
}

/**
 * The delimiter window in the verbatim around the keyword at `idx`. We bound the
 * window by sentence/segment delimiters [+ , . ; :] so a number only counts when
 * it shares the movement's own phrase. (NB: "/" and "'" are NOT delimiters, so
 * "40''/20''" stays intact.)
 */
function windowAround(verbatim: string, idx: number, keyLen: number): string {
  const DELIM = /[+,.;:]/;
  let start = idx;
  while (start > 0 && !DELIM.test(verbatim[start - 1]!)) start--;
  let end = idx + keyLen;
  while (end < verbatim.length && !DELIM.test(verbatim[end]!)) end++;
  return verbatim.slice(start, end).trim();
}

/** Locate the n-th (0-based `rank`) window for any of `keywords` in `verbatim`. */
function findWindow(verbatim: string, keywords: string[], rank: number): string | null {
  const lower = verbatim.toLowerCase();
  const hits: Array<{ idx: number; len: number }> = [];
  for (const kw of keywords) {
    if (!kw) continue;
    let from = 0;
    for (;;) {
      const i = lower.indexOf(kw, from);
      if (i < 0) break;
      hits.push({ idx: i, len: kw.length });
      from = i + kw.length;
    }
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.idx - b.idx);
  // De-dup overlapping matches (e.g. two keywords hitting the same span).
  const dedup: Array<{ idx: number; len: number }> = [];
  for (const h of hits) {
    const prev = dedup[dedup.length - 1];
    if (prev && h.idx < prev.idx + prev.len) continue;
    dedup.push(h);
  }
  const hit = dedup[rank];
  return hit ? windowAround(verbatim, hit.idx, hit.len) : null;
}

// ── one-item parser ─────────────────────────────────────────────────────────

interface ItemParse {
  prescription: Prescription;
  hasMeasure: boolean;
  flags: string[];
}

/** Default scheme for a measure-less item: core/mobility = sets, other = steady. */
function emptyScheme(modality: Modality): PrescriptionScheme {
  return modality === 'other' ? 'steady' : 'sets';
}

/**
 * Parse a verbatim window into a typed Prescription for ONE core/mobility/other
 * item. Patterns, in order:
 *   "Nx<t>''/<rest>''"  → N sets {duration t, rest r}      (Side plank 4x40''/20'')
 *   "Nx<t>''"           → N sets {duration t}
 *   "Nx<reps>"          → N sets {reps}                     (Dead bug 3x12)
 *   single "<t>'"/"<t>''" → one duration                   (10' caminando / 5' foam roll)
 *   (none)              → no measure → flag
 * An optional "RPE<n>" in the window attaches as the set/line target.
 */
function parseItem(window: string | null, modality: Modality): ItemParse {
  const flags: string[] = [];
  const rpe = window ? rpeTarget(window) : undefined;

  if (window) {
    // Interval head: Nx<duration>'' [ / <rest>'' ]
    const iv = window.match(/(\d+)\s*x\s*(\d+)\s*''(?:\s*\/\s*(\d+)\s*'')?/i);
    if (iv) {
      const reps = Number(iv[1]);
      const dur = Number(iv[2]);
      const rest = iv[3] !== undefined ? Number(iv[3]) : undefined;
      const sets = Array.from({ length: reps }, () => {
        const s: PrescriptionSet = { measure: { kind: 'duration', seconds: dur } };
        if (rest !== undefined && rest > 0) s.rest_s = rest;
        if (rpe) s.target = rpe;
        return s;
      });
      return { prescription: { scheme: 'sets', modality, sets }, hasMeasure: true, flags };
    }

    // Rep head: Nx<reps> (a bare integer, not a time token).
    const rp = window.match(/(\d+)\s*x\s*(\d+)\b(?!\s*['])/i);
    if (rp) {
      const reps = Number(rp[1]);
      const count = Number(rp[2]);
      const sets = Array.from({ length: reps }, () => {
        const s: PrescriptionSet = { measure: { kind: 'reps', value: count } };
        if (rpe) s.target = rpe;
        return s;
      });
      return { prescription: { scheme: 'sets', modality, sets }, hasMeasure: true, flags };
    }

    // Single continuous duration ("10' caminando", "5' foam roll", "45''").
    const dur = durationSeconds(window);
    if (dur !== undefined) {
      if (modality === 'other') {
        // Continuous non-core/mobility work (walk) → steady with a total cap.
        const p: Prescription = { scheme: 'steady', modality, total_s: dur };
        if (rpe) p.target = rpe;
        return { prescription: p, hasMeasure: true, flags };
      }
      const s: PrescriptionSet = { measure: { kind: 'duration', seconds: dur } };
      if (rpe) s.target = rpe;
      return { prescription: { scheme: 'sets', modality, sets: [s] }, hasMeasure: true, flags };
    }
  }

  // No quantity in the verbatim window → faithful empty shell, flagged.
  flags.push(
    window === null
      ? 'movement not located in verbatim — cannot type a measure'
      : `no measure stated in verbatim ("${window}")`,
  );
  const p: Prescription = { scheme: emptyScheme(modality), modality };
  if (rpe) p.target = rpe;
  return { prescription: p, hasMeasure: false, flags };
}

function asJson(p: Prescription): Parameters<Sql['json']>[0] {
  return JSON.parse(JSON.stringify(p)) as Parameters<Sql['json']>[0];
}

// ── DB driver ───────────────────────────────────────────────────────────────

interface Row {
  be_id: string;
  block_id: string;
  slug: string | null;
  ex_name: string | null;
  bp: string;
  pos: string;
  modality: Modality;
  verbatim: string;
}

interface ItemReport {
  be_id: number;
  block_id: number;
  modality: Modality;
  slug: string | null;
  text: string;
  presc: Prescription;
  typed: boolean;
  flags: string[];
}

async function main(): Promise<void> {
  const sql = getSql();
  const host = process.env.DATABASE_URL?.match(/@([^/:]+)/)?.[1] ?? '?';
  if (!host.includes('ep-flat-wind')) {
    throw new Error(`Refusing to run: DATABASE_URL host is "${host}", expected the demo branch ep-flat-wind.`);
  }
  process.stdout.write(`[retype_core_mobility_blocks] host=${host} mode=${DRY_RUN ? 'dry-run' : 'apply'}\n`);

  const reports: ItemReport[] = [];
  try {
    const rows = await sql<Row[]>`
      select be.id::text as be_id, be.block_id::text as block_id,
             e.slug, e.name as ex_name,
             be.block_position::text as bp, be.position::text as pos,
             be.prescription_json->>'modality' as modality,
             b.description as verbatim
      from block_exercises be
      join blocks b on b.id = be.block_id
      left join exercises e on e.id = be.exercise_id
      where be.prescription_json->>'modality' = any(${SCOPE_MODALITIES as unknown as string[]})
      order by be.block_id, be.block_position, be.position`;

    // Track the keyword-match rank per (block, keyword-set) so two rows sharing a
    // slug in one block consume successive verbatim windows (plank #0, plank #1).
    const rankCounter = new Map<string, number>();

    for (const r of rows) {
      const beId = Number(r.be_id);
      const keywords = keywordsFor(r.slug, r.ex_name);
      const rankKey = `${r.block_id}::${keywords.join(',')}`;
      const rank = rankCounter.get(rankKey) ?? 0;
      rankCounter.set(rankKey, rank + 1);

      const window = findWindow(r.verbatim, keywords, rank);
      const { prescription, hasMeasure, flags } = parseItem(window, r.modality);

      // Validate against the shared zod model before writing.
      let validated: Prescription;
      try {
        validated = parsePrescription(asJson(prescription));
      } catch (e) {
        reports.push({
          be_id: beId, block_id: Number(r.block_id), modality: r.modality, slug: r.slug,
          text: '(schema validation failed)', presc: prescription, typed: false,
          flags: [...flags, `schema validation failed: ${e instanceof Error ? e.message : String(e)}`],
        });
        continue;
      }

      const needsReview = !hasMeasure;
      const params = prescriptionToParams(validated);

      if (!DRY_RUN) {
        await sql`
          update block_exercises
          set prescription_json = ${sql.json(asJson(validated))},
              params_json = ${sql.json(params as Parameters<Sql['json']>[0])},
              needs_review = ${needsReview},
              updated_at = now()
          where id = ${beId}::bigint`;
      }

      reports.push({
        be_id: beId, block_id: Number(r.block_id), modality: r.modality, slug: r.slug,
        text: prescriptionToText(validated), presc: validated, typed: hasMeasure, flags,
      });
    }

    printReport(reports);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function printReport(reports: ItemReport[]): void {
  const w = (s: string) => process.stdout.write(s + '\n');
  const typed = reports.filter((r) => r.typed);
  const flagged = reports.filter((r) => !r.typed);

  w('\n========= CORE / MOBILITY / OTHER RE-TYPING REPORT =========');
  for (const r of reports) {
    w(`\n[be#${r.be_id}] block ${r.block_id} · ${r.modality} · ${r.slug ?? '?'} · ${r.typed ? 'TYPED' : 'FLAGGED'}`);
    w(`   → ${r.text}  ::  ${JSON.stringify(r.presc)}`);
    for (const f of r.flags) w(`   ⚑ ${f}`);
  }
  w('\n================ COUNTS ================');
  w(`  total core/mobility/other items ... ${reports.length}`);
  w(`  typed (measure from verbatim) ..... ${typed.length}`);
  w(`  flagged (no measure in verbatim) .. ${flagged.length}`);
  w(`  flagged be ids: ${flagged.map((r) => r.be_id).join(', ') || '(none)'}`);
}

main().catch((err) => {
  process.stderr.write(
    `retype_core_mobility_blocks failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
