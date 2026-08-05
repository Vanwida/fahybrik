/**
 * exercise-resolve.ts — resolve a free-text exercise term (Pablo's notation) to
 * a catalog `exercises.id`, with a PER-COACH LEARNED synonym store on top.
 *
 * This is the deterministic core of the #28 importer. NO LLM here: it is a fast,
 * repeatable cascade the caller runs first; only a genuine miss escalates to the
 * LLM / a manual pick, and the coach's correction is fed back via `learnSynonym`
 * so the same term never misses twice ("aprende su notación").
 *
 * THE CASCADE (first hit wins):
 *   (1) coach synonym   — `coach_exercise_synonyms` (migration 0109), the coach's
 *                         OWN learned mapping. Beats everything below.
 *   (2) global alias    — the static term→slug map (GLOBAL_ALIASES, mirrored from
 *                         infra/scripts/parse_blocks_lib.ts) → catalog by slug.
 *                         Unscoped by coach — see the note on layer (2) below.
 *   (3) catalog name exact       — `unaccent(lower(coalesce(override.name, exercises.name)))`
 *                         == unaccent(normalized term), scoped to what THIS coach may see.
 *   (4) catalog name substring   — same merged-name + scope, term ⊂ name or
 *                         name ⊂ term (shortest name wins).
 *   (5) miss            — { exercise_id: null, normalized }; caller escalates.
 *
 * ACCENTS (migration 0151): `normalized` is already accent-free (TS-side NFD
 * strip in `normalizeTerm`), so layers (3)/(4) wrap the SQL side in Postgres's
 * `unaccent()` too — plain `lower()` does NOT fold á/é/í/ó/ú/ü/ñ, so an
 * accented catalog name ("Puente de Glúteo") could never match an unaccented
 * term and the importer would silently create a duplicate next to it. Layer
 * (1)/(2) were never affected: `coach_exercise_synonyms.term_normalized` is
 * written AND read through the same `normalizeTerm()` (both TS, no SQL-side
 * name comparison), and GLOBAL_ALIASES resolves to an ASCII `slug` (exact
 * match, no accents to begin with).
 *
 * OWNERSHIP (migration 0132, `lib/exercises/coach-override.ts`): layers (3)/(4)
 * are the ones that ENUMERATE/RESOLVE by name, so per that module's contract they
 * must scope to `visibleToCoach` — unscoped, coach B's import could silently
 * resolve to coach A's PROPIO exercise via the deterministic `order by id asc`
 * tiebreak. They also match the coach's MERGED name (override.name ?? base.name),
 * not the base name: a coach writes their Excel in their OWN vocabulary, and if
 * they renamed "Wall Balls" -> "Wall Ball Shots" that is what their sheet says.
 *
 * SOURCE-OF-TRUTH NOTE on GLOBAL_ALIASES: the canonical alias map lives in
 * `infra/scripts/parse_blocks_lib.ts` (a BUILD-TIME corpus parser). We keep a
 * RUNTIME copy here rather than importing that script into the Next.js bundle —
 * mirroring the repo's shared/domain "intentional duplication" pattern. It is a
 * static seed only: coach-specific growth belongs in `learnSynonym` (layer 1),
 * so this copy should rarely need to change. If it does, keep the two in sync.
 */

import { sql } from '@/lib/db';
import type { Sql, TransactionClient } from '@/lib/db';
import { visibleToCoach, joinCoachOverride } from '@/lib/exercises/coach-override';

type Client = Sql | TransactionClient;

// ---------------------------------------------------------------------------
// GLOBAL alias seed — normalized term → catalog slug. Mirror of
// infra/scripts/parse_blocks_lib.ts::ALIASES (that module is the source of
// truth; see the header note). Keys are matched AFTER normalization.
// ---------------------------------------------------------------------------
export const GLOBAL_ALIASES: Readonly<Record<string, string>> = {
  // strength
  'front squat': 'front-squat',
  'back squat': 'back-squat',
  'deadlift': 'deadlift',
  'rdl': 'romanian-deadlift',
  'romanian deadlift': 'romanian-deadlift',
  'bench press': 'bench-press',
  'bench press horizontal': 'bench-press',
  'strict shoulder press': 'overhead-press',
  'shoulder press': 'overhead-press',
  'push press': 'push-press',
  'power clean': 'power-clean',
  'hang power clean': 'hang-power-clean',
  'clean': 'power-clean',
  'thruster': 'thruster',
  'thrusters': 'thruster',
  'hip thrust': 'hip-thrust',
  'goblet squat': 'goblet-squat',
  'bulgarian squat': 'bulgarian-split-squat',
  'bulgarian split squat': 'bulgarian-split-squat',
  'reverse lunge': 'reverse-lunge',
  'walking lunge': 'walking-lunge',
  'turkish get-up': 'turkish-get-up',
  'turkish get up': 'turkish-get-up',
  'pull up': 'pull-up',
  'pull ups': 'pull-up',
  'push up': 'push-up',
  'push ups': 'push-up',
  'dip': 'weighted-dip',
  'dips': 'weighted-dip',
  'lateral raise': 'lateral-raise',
  'elevaciones laterales': 'lateral-raise',
  'cable fly': 'cable-fly',
  'aperturas en polea': 'cable-fly',
  // ergs / cardio
  'row': 'row',
  'rowing': 'row',
  'skierg': 'ski-erg',
  'ski': 'ski-erg',
  'ab': 'assault-bike',
  'assault bike': 'assault-bike',
  'bike': 'bike-erg',
  'run': 'run',
  'carrera': 'run',
  'correr': 'run',
  // hyrox stations
  'wall balls': 'hyrox-wall-balls',
  'wall ball': 'hyrox-wall-balls',
  'sled push': 'hyrox-sled-push',
  'sled pull': 'hyrox-sled-pull',
  'sled drag': 'sled-drag-backwards',
  'farmer carry': 'hyrox-farmer-carry',
  'farmers carry': 'hyrox-farmer-carry',
  'sb lunge': 'hyrox-sandbag-lunges',
  'sandbag lunge': 'hyrox-sandbag-lunges',
  // plyometric / skill
  'box jump': 'box-jump',
  'high box jump': 'box-jump',
  'broad jump': 'broad-jump',
  'broad jumps': 'broad-jump',
  'depth jump': 'depth-jump',
  'bar zercher jump': 'zercher-squat-jump',
  'zercher jump': 'zercher-squat-jump',
  'jump back squat': 'jump-squat',
  'jump squat': 'jump-squat',
  'burpee': 'burpee',
  'ttb': 'toes-to-bar',
  'toes-to-bar': 'toes-to-bar',
  'db snatch': 'dumbbell-snatch',
  'db box step': 'box-step-up',
  'box step': 'box-step-up',
  'devil press': 'devil-press',
  // core / mobility
  'side plank': 'side-plank',
  'lateral plank': 'side-plank',
  'plank': 'plank',
  'sit up': 'sit-up',
  'sit ups': 'sit-up',
};

// ---------------------------------------------------------------------------
// Normalization.
// ---------------------------------------------------------------------------

// Leading quantity/equipment/qualifier noise — mirrors parse_blocks_lib.ts's
// NOISE_PREFIX: rep/round counts ("8r", "3 rounds", "6 series"), equipment
// shorthand (DB/KB/BW/BB/barbell), "every 2'", "high"/"strict" qualifiers. Each
// alternative must be followed by whitespace (i.e. it decorates a FOLLOWING
// exercise name), so it never eats a bare token that IS the exercise.
const NOISE_PREFIX =
  /^(?:\d+\s*(?:r|rounds|series|rondas|x)?\b|every\s+\d+\s*'?|db|kb|bw|high|strict|barbell|bb)\s+/i;

// Trailing (or embedded) load suffix — "70kg", "22.5 kg", "24 KG". Pure noise
// for identity; stripped everywhere it appears.
const LOAD_SUFFIX = /\s*\d+(?:[.,]\d+)?\s*kg\b/gi;

// Combining diacritical marks (U+0300–U+036F) — removed after NFD decomposition.
const DIACRITICS = /[̀-ͯ]/g;

/**
 * Light normalization only: lowercase, strip accents, collapse whitespace, trim.
 * This is the form the alias window-scan matches (some alias KEYS embed an
 * equipment token, e.g. "db snatch", which the aggressive `normalizeTerm` would
 * strip away).
 */
function lightNormalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The canonical resolver/synonym key: `lightNormalize` PLUS stripping leading
 * quantity/equipment/qualifier noise (repeatedly, until stable) and any `\d+kg`
 * load suffix. This is what `coach_exercise_synonyms.term_normalized` stores and
 * what the equality lookups compare against.
 */
export function normalizeTerm(raw: string): string {
  let s = lightNormalize(raw);
  let prev: string;
  do {
    prev = s;
    s = s.replace(NOISE_PREFIX, '').trim();
  } while (s !== prev);
  s = s.replace(LOAD_SUFFIX, '').replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Resolve a normalized candidate against the GLOBAL alias map: exact key first,
 * then the longest word-window (up to 4 words) found ANYWHERE in the candidate —
 * so "8r db depth jump" and "db snatch" both resolve. Returns the catalog slug
 * or null. Deterministic (longest window wins, scanned left-to-right).
 */
function aliasToSlug(candidate: string): string | null {
  if (!candidate) return null;
  const exact = GLOBAL_ALIASES[candidate];
  if (exact) return exact;
  const words = candidate.split(' ');
  for (let len = Math.min(4, words.length); len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const slug = GLOBAL_ALIASES[words.slice(i, i + len).join(' ')];
      if (slug) return slug;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resolve + learn.
// ---------------------------------------------------------------------------

/** How a term resolved — for telemetry / debugging the importer's decisions. */
export type ResolveVia = 'synonym' | 'alias' | 'name_exact' | 'name_substring';
export type ResolveHit = { exercise_id: number; via: ResolveVia };
/** A miss carries the normalized key so the caller can escalate + later learn it. */
export type ResolveMiss = { exercise_id: null; normalized: string };
export type ResolveResult = ResolveHit | ResolveMiss;

/**
 * Resolve a free-text term to a catalog exercise for a given coach. Deterministic
 * cascade (see file header); NO LLM. `client` defaults to the shared pool but
 * callers inside a transaction (or a test) pass their own.
 */
export async function resolveExercise(
  coachId: number,
  term: string,
  client: Client = sql,
): Promise<ResolveResult> {
  const normalized = normalizeTerm(term);
  const light = lightNormalize(term);

  // (1) Coach synonym — the coach's own learned notation beats everything.
  if (normalized) {
    const syn = await client<Array<{ exercise_id: string }>>`
      select exercise_id::text as exercise_id
      from coach_exercise_synonyms
      where coach_id = ${coachId} and term_normalized = ${normalized}
      limit 1
    `;
    if (syn[0]) return { exercise_id: Number(syn[0].exercise_id), via: 'synonym' };
  }

  // (2) Global alias map → catalog slug. Try the light form first (keeps alias
  // keys that embed an equipment token, e.g. "db snatch"), then the aggressive
  // key (handles "front squat 70kg" → "front squat").
  //
  // Deliberately UNSCOPED by coach, and this is safe (not an oversight): `slug`
  // carries `exercises_slug_unique` (migration 0001), a single GLOBAL unique
  // constraint with no per-coach namespace — migration 0132 keeps it that way on
  // purpose. GLOBAL_ALIASES targets are always BASE catalog slugs (the corpus
  // parser mirrors our own product's canonical movements); a coach's PROPIO
  // exercise can never legally hold one of those slugs, because the BASE row
  // already owns it — the coach would get an auto-suffixed slug instead (e.g.
  // `sled-push-2`), which no alias key points to. So `slug = ${slug}` can only
  // ever match the (universally visible) BASE row: adding `visibleToCoach` here
  // would be a no-op, not a fix.
  const slug = aliasToSlug(light) ?? aliasToSlug(normalized);
  if (slug) {
    const bySlug = await client<Array<{ id: string }>>`
      select id::text as id from exercises where slug = ${slug} limit 1
    `;
    if (bySlug[0]) return { exercise_id: Number(bySlug[0].id), via: 'alias' };
  }

  if (normalized) {
    // Ownership tiebreak (layers 3/4): a coach can now match the SAME name via
    // two different rows — a base exercise they renamed to "X" via override, AND
    // an own exercise they separately created and called "X". `own` must win
    // (it is the more specific, more recently-authored intent). In Postgres,
    // boolean ordering is `false < true`, so `(e.coach_id is null) asc` sorts
    // owned rows (expression = false) BEFORE base rows (expression = true) —
    // verified directly against a live branch (see task report), not assumed.

    // (3) Catalog name, exact — matched against the coach's MERGED name
    // (override.name ?? base.name; see file header). Scoped to what this coach
    // may see so this can never resolve into another coach's PROPIO exercise.
    //
    // `unaccent(lower(...))` on BOTH sides (migration 0151): `normalized` is
    // already accent-free (TS-side NFD strip in normalizeTerm), but `lower()`
    // alone does NOT strip accents in SQL — an exercise named "Puente de
    // Glúteo" produced `puente de glúteo` here against `puente de gluteo` on
    // the TS side and could never match. Unaccenting BOTH sides (not just the
    // column) is belt-and-suspenders: `normalized` is a no-op under it today,
    // but it means the two sides can never silently drift onto different
    // folding rules again.
    const exact = await client<Array<{ id: string }>>`
      select e.id::text as id
      from exercises e
      ${joinCoachOverride(client, coachId)}
      where unaccent(lower(coalesce(ceo.name, e.name))) = unaccent(${normalized})
        and ${visibleToCoach(client, coachId)}
      order by (e.coach_id is null) asc, e.id asc
      limit 1
    `;
    if (exact[0]) return { exercise_id: Number(exact[0].id), via: 'name_exact' };

    // (4) Catalog name, substring — same merged-name + visibility scope as (3),
    // same unaccent fix. The term is contained in the (merged) name OR the
    // name is contained in the term. Deterministic: own-before-base first,
    // then shortest name (most specific), then id.
    const sub = await client<Array<{ id: string }>>`
      select e.id::text as id
      from exercises e
      ${joinCoachOverride(client, coachId)}
      where (
          position(unaccent(${normalized}) in unaccent(lower(coalesce(ceo.name, e.name)))) > 0
          or position(unaccent(lower(coalesce(ceo.name, e.name))) in unaccent(${normalized})) > 0
        )
        and ${visibleToCoach(client, coachId)}
      order by (e.coach_id is null) asc, length(coalesce(ceo.name, e.name)) asc, e.id asc
      limit 1
    `;
    if (sub[0]) return { exercise_id: Number(sub[0].id), via: 'name_substring' };
  }

  // (5) Miss — the caller sends this to the LLM / a manual pick, then feeds the
  // chosen exercise back through `learnSynonym`.
  return { exercise_id: null, normalized };
}

/**
 * Learn (or correct) a coach's mapping: upsert the NORMALIZED term → exercise for
 * this coach so it resolves via layer 1 next time. Re-learning the same term to a
 * new exercise overwrites the target (the coach changed his mind), never
 * duplicates. No-op on an empty/noise-only term (nothing learnable). The caller
 * must have verified the exercise exists (the FK would otherwise raise 23503).
 */
export async function learnSynonym(
  coachId: number,
  term: string,
  exerciseId: number,
  client: Client = sql,
): Promise<void> {
  const term_normalized = normalizeTerm(term);
  if (!term_normalized) return;
  await client`
    insert into coach_exercise_synonyms (coach_id, term_normalized, exercise_id)
    values (${coachId}, ${term_normalized}, ${exerciseId})
    on conflict (coach_id, term_normalized) do update set exercise_id = excluded.exercise_id
  `;
}
