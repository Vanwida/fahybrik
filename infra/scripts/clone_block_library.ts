/**
 * clone_block_library.ts — clone a SOURCE coach's Biblioteca de Bloques to a
 * TARGET coach. Reusable + idempotent. Deep-copies every `blocks` row (new id,
 * coach_id = target) and all its `block_exercises` rows (new block_id), keeping
 * the full typed prescription intact so the copies are identical content.
 *
 * WHY
 * ---
 * The block library is now PER-COACH content (commit 77eb173): each coach sees
 * only `blocks` where coach_id = themselves. A brand-new coach (the demo
 * colleagues; a real coach onboarding later) therefore starts with an EMPTY
 * library. This script hands them the raw material — a private COPY of another
 * coach's blocks — without touching their roster, athletes, or microciclos.
 *
 * WHAT IS COPIED (per block)
 * --------------------------
 *  blocks:          slug(derived, see below), title, description,
 *                   methodology_group_id, format, source_ref, default_modifiers,
 *                   needs_review, days_per_week, min_level_id/max_level_id
 *                   (REMAPPED by level name → target coach's own athlete_levels),
 *                   coach_id = TARGET. id/created_at are fresh.
 *  block_exercises: position, block_position, exercise_id, params_json,
 *                   reps_scheme, notes, prescription_json, needs_review,
 *                   block_format, block_title, block_id = the new block.
 *                   id/created_at/updated_at are fresh.
 *
 * CROSS-COACH REFERENCE HANDLING (build-right)
 * --------------------------------------------
 *  - `slug` is GLOBALLY unique (blocks_slug_key), so a verbatim copy would
 *    collide. We derive a deterministic per-target slug: `${slug}${SLUG_SUFFIX}${target}`.
 *    Deterministic ⇒ it is also our idempotency key (see below).
 *  - `min_level_id` / `max_level_id` reference `athlete_levels`, which are
 *    PER-COACH rows. Copying the source ids verbatim would point the target's
 *    block at the SOURCE coach's level rows. We REMAP by level NAME to the target
 *    coach's own level of the same name; if the target has no such name, NULL.
 *  - `methodology_group_id` → `methodology_groups` is GLOBAL (no coach_id) and
 *    `exercise_id` → `exercises` is the shared global catalog. Both copy as-is.
 *
 * IDEMPOTENCY
 * -----------
 *  Keyed on the derived slug (NOT the title). The source library can hold
 *  duplicate titles (Pablo's has 4, e.g. "10' row z2" ×3) — a title key would
 *  silently DROP those, so the target would never reach parity. The derived slug
 *  is unique and deterministic, so re-running skips exactly the blocks already
 *  cloned and never duplicates.
 *
 * GUARDED (shared _demo_target): the demo branch (ep-flat-wind) is always
 * writable; MAIN (ep-aged-base) only with SEED_DEMO_ALLOW_MAIN=1. Every TARGET
 * must be a demo coach account (assertDemoCoach) — refuses a real coach.
 *
 * SOURCE can be a coach id OR `global` (blocks.coach_id IS NULL): on MAIN the
 * methodology library is GLOBAL/unowned, so the demo coaches are seeded from it.
 *
 * RUN (against MAIN, from web/ so `@/` + the shared guard resolve):
 *   cd web && SEED_DEMO_ALLOW_MAIN=1 DATABASE_URL="<main>" \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/clone_block_library.ts --source=global --target=62
 *
 *   Args (either form): --source=<id|global> / SOURCE_COACH_ID=<id>,
 *                       --target=<id> (repeatable) / TARGET_COACH_IDS=62,63
 *   --dry-run reports the plan without writing.
 */
import { getSql } from './_db.js';
import { assertDemoWriteHost, assertDemoCoach } from './_demo_target.ts';

/** Deterministic per-target slug suffix → also the idempotency key. */
const SLUG_SUFFIX = '--c';

const DRY_RUN = process.argv.includes('--dry-run');

// ── arg parsing (flags win over env) ────────────────────────────────────────
function flagValues(name: string): string[] {
  const out: string[] = [];
  for (const a of process.argv.slice(2)) {
    const m = a.match(new RegExp(`^--${name}=(.+)$`));
    if (m?.[1] !== undefined) out.push(m[1]);
  }
  return out;
}

/** A clone source: a specific coach id, or the GLOBAL library (blocks.coach_id IS
 *  NULL). On main the methodology library is global (unowned); on the demo branch
 *  it was owned by a coach — both are valid sources for cloning into a coach. */
type Source = number | 'global';

function parseIds(): { source: Source; targets: number[] } {
  const srcRaw = (flagValues('source')[0] ?? process.env.SOURCE_COACH_ID ?? '').trim();
  let source: Source;
  if (srcRaw.toLowerCase() === 'global') {
    source = 'global';
  } else {
    const n = Number(srcRaw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('Missing/invalid --source=<coachId|global> (or SOURCE_COACH_ID).');
    }
    source = n;
  }
  const targetsRaw = [
    ...flagValues('target'),
    ...(process.env.TARGET_COACH_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  ];
  const targets = targetsRaw.map(Number);
  if (targets.length === 0 || targets.some((t) => !Number.isInteger(t) || t <= 0)) {
    throw new Error('Missing/invalid --target=<coachId> (repeatable) or TARGET_COACH_IDS=29,30.');
  }
  if (typeof source === 'number' && targets.includes(source)) {
    throw new Error('A target coach must differ from the source coach.');
  }
  return { source, targets: [...new Set(targets)] };
}

type Sql = ReturnType<typeof getSql>;

interface BlockRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  methodology_group_id: string;
  format: string | null;
  source_ref: string | null;
  default_modifiers: unknown;
  needs_review: boolean;
  min_level_id: string | null;
  max_level_id: string | null;
  days_per_week: number | null;
}

interface BlockExerciseRow {
  position: number;
  block_position: number;
  exercise_id: string;
  params_json: unknown;
  reps_scheme: string | null;
  notes: string | null;
  prescription_json: unknown;
  needs_review: boolean;
  block_format: string | null;
  block_title: string | null;
}

interface CloneResult {
  target: number;
  sourceBlocks: number;
  inserted: number;
  skipped: number;
  exercisesCopied: number;
}

/** name→id map of a coach's athlete_levels (for level remapping). */
async function levelNameToId(sql: Sql, coachId: number): Promise<Map<string, string>> {
  const rows = await sql<Array<{ id: string; name: string }>>`
    select id::text, name from athlete_levels where coach_id = ${coachId}
  `;
  return new Map(rows.map((r) => [r.name, r.id]));
}

/** id→name map of a coach's athlete_levels. */
async function levelIdToName(sql: Sql, coachId: number): Promise<Map<string, string>> {
  const rows = await sql<Array<{ id: string; name: string }>>`
    select id::text, name from athlete_levels where coach_id = ${coachId}
  `;
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Clone source coach's blocks into target coach. One transaction; idempotent by
 * derived slug. Returns counts. THE single clone routine (DRY) — main() just
 * loops targets through it.
 */
async function cloneLibrary(sql: Sql, source: Source, target: number): Promise<CloneResult> {
  // GLOBAL source has no athlete_levels of its own → empty map → level bounds NULL
  // out on the copies (a global block references no per-coach level).
  const srcIdToName = source === 'global' ? new Map<string, string>() : await levelIdToName(sql, source);
  const tgtNameToId = await levelNameToId(sql, target);

  // Remap a source level id → the target coach's level of the same NAME (NULL if
  // the source had none or the target lacks that name).
  const remapLevel = (srcLevelId: string | null): string | null => {
    if (!srcLevelId) return null;
    const name = srcIdToName.get(srcLevelId);
    if (!name) return null;
    return tgtNameToId.get(name) ?? null;
  };

  const blocks =
    source === 'global'
      ? await sql<BlockRow[]>`
          select id::text, slug, title, description, methodology_group_id::text,
                 format, source_ref, default_modifiers, needs_review,
                 min_level_id::text, max_level_id::text, days_per_week
          from blocks
          where coach_id is null
          order by id
        `
      : await sql<BlockRow[]>`
          select id::text, slug, title, description, methodology_group_id::text,
                 format, source_ref, default_modifiers, needs_review,
                 min_level_id::text, max_level_id::text, days_per_week
          from blocks
          where coach_id = ${source}
          order by id
        `;

  let inserted = 0;
  let skipped = 0;
  let exercisesCopied = 0;

  await sql.begin(async (tx) => {
    for (const b of blocks) {
      const derivedSlug = `${b.slug}${SLUG_SUFFIX}${target}`;

      const exists = await tx<Array<{ id: string }>>`
        select id::text from blocks where coach_id = ${target} and slug = ${derivedSlug} limit 1
      `;
      if (exists.length > 0) {
        skipped += 1;
        continue;
      }
      if (DRY_RUN) {
        inserted += 1;
        const n = await tx<Array<{ c: number }>>`
          select count(*)::int as c from block_exercises where block_id = ${b.id}
        `;
        exercisesCopied += n[0]!.c;
        continue;
      }

      const newBlock = await tx<Array<{ id: string }>>`
        insert into blocks
          (slug, title, description, methodology_group_id, format, source_ref,
           default_modifiers, coach_id, needs_review, min_level_id, max_level_id,
           days_per_week)
        values
          (${derivedSlug}, ${b.title}, ${b.description}, ${b.methodology_group_id},
           ${b.format}, ${b.source_ref}, ${b.default_modifiers as never}, ${target},
           ${b.needs_review}, ${remapLevel(b.min_level_id)}, ${remapLevel(b.max_level_id)},
           ${b.days_per_week})
        returning id::text
      `;
      const newBlockId = newBlock[0]!.id;
      inserted += 1;

      const exs = await tx<BlockExerciseRow[]>`
        select position, block_position, exercise_id::text, params_json, reps_scheme,
               notes, prescription_json, needs_review, block_format, block_title
        from block_exercises
        where block_id = ${b.id}
        order by position
      `;
      for (const e of exs) {
        await tx`
          insert into block_exercises
            (block_id, position, block_position, exercise_id, params_json,
             reps_scheme, notes, prescription_json, needs_review, block_format,
             block_title)
          values
            (${newBlockId}, ${e.position}, ${e.block_position}, ${e.exercise_id},
             ${e.params_json as never}, ${e.reps_scheme}, ${e.notes},
             ${e.prescription_json as never}, ${e.needs_review}, ${e.block_format},
             ${e.block_title})
        `;
      }
      exercisesCopied += exs.length;
    }
  });

  return { target, sourceBlocks: blocks.length, inserted, skipped, exercisesCopied };
}

async function main() {
  // Demo branch always ok; main only with SEED_DEMO_ALLOW_MAIN=1 (shared guard).
  const host = assertDemoWriteHost('clone_block_library');

  const { source, targets } = parseIds();
  const sql = getSql();

  // Target-safety: every target MUST be a demo coach account. Refuses to clone a
  // library onto a real coach even if the operator passes a wrong id.
  for (const target of targets) {
    const email = await assertDemoCoach(sql, target);
    // eslint-disable-next-line no-console
    console.log(`[clone_block_library] target coach ${target} verified demo: <${email}>`);
  }

  // eslint-disable-next-line no-console
  console.log(
    `[clone_block_library] host=${host} source=${source} targets=${targets.join(',')}` +
      (DRY_RUN ? ' (DRY RUN)' : ''),
  );

  const results: CloneResult[] = [];
  for (const target of targets) {
    results.push(await cloneLibrary(sql, source, target));
  }

  // eslint-disable-next-line no-console
  console.log('\n===================== BLOCK LIBRARY CLONE =====================');
  for (const r of results) {
    const targetTotal = (
      await sql<Array<{ c: number }>>`select count(*)::int as c from blocks where coach_id = ${r.target}`
    )[0]!.c;
    // eslint-disable-next-line no-console
    console.log(
      `coach ${r.target}: +${r.inserted} cloned, ${r.skipped} skipped ` +
        `(source had ${r.sourceBlocks}), ${r.exercisesCopied} block_exercises copied ` +
        `→ now owns ${targetTotal} blocks`,
    );
  }

  await sql.end();
  // eslint-disable-next-line no-console
  console.log('\n[clone_block_library] done.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[clone_block_library] FAILED:', err);
  process.exitCode = 1;
});
