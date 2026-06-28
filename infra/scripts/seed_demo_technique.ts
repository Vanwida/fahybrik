/**
 * Seed the technique-video demo data for athlete 70 on the DEMO branch.
 *
 * Two things, both idempotent and host-guarded to ep-flat-wind:
 *   1. Real YouTube technique URLs on the exercises that appear in athlete 70's
 *      published plan, so the iOS "Ver técnica" affordance + the in-workout
 *      video button + ExerciseDetailView render with real data.
 *   2. A back-squat 1RM (80 kg) for athlete 70 in `athlete_strength_maxes`, so
 *      the %RM → kg resolution can surface an absolute load.
 *
 * URLs are real, public, ground-truthed videos (verified via YouTube oEmbed) —
 * official Concept2 / Global Triathlon Network / HYROX-partner channels. None
 * are fabricated ids.
 *
 * NOTE on the %RM → kg demo: athlete 70's plan prescribes its %RM strength block
 * on FRONT SQUAT (`front-squat`), which is intentionally NOT mapped to a 1RM
 * benchmark (shared/domain/strength/exercises.ts — "we don't borrow another
 * lift's 1RM"). So this back_squat_1rm only renders an absolute load once the
 * plan's %RM block uses a mapped lift (back-squat); see the report for the
 * one-line root fix in seed_demo_athlete_plan.ts.
 *
 * Run:
 *   cd infra && DATABASE_URL=<ep-flat-wind url> npx tsx scripts/seed_demo_technique.ts
 *   (DATABASE_URL is read from repo-root .env.local when unset.)
 */
import { getSql } from './_db.js';

const REQUIRED_HOST = 'ep-flat-wind'; // demo branch — the ONLY DB this may touch
const ATHLETE_ID = 70;
const COACH_ID = 29;

// exercise slug (catalog) → real public technique video. These are the
// principal exercises across athlete 70's 5 training days + HYROX simulation.
const VIDEOS: Array<{ slug: string; url: string; source: string }> = [
  { slug: 'front-squat', url: 'https://www.youtube.com/watch?v=tCS4p5lS5rk', source: 'Runna' },
  { slug: 'run', url: 'https://www.youtube.com/watch?v=brFHyOtTwH4', source: 'Global Triathlon Network' },
  { slug: 'row', url: 'https://www.youtube.com/watch?v=QPvYrfyGHi8', source: 'ErgFit / Concept2 NZ' },
  { slug: 'ski-erg', url: 'https://www.youtube.com/watch?v=B0lIgT5PHc8', source: 'Concept2 (concept2usa)' },
  { slug: 'hyrox-wall-balls', url: 'https://www.youtube.com/watch?v=eVpVh2czEyI', source: 'The Progrm' },
  { slug: 'hyrox-sled-push', url: 'https://www.youtube.com/watch?v=IVv_WDafLO4', source: 'Core Blend Training' },
  { slug: 'hyrox-burpee-broad-jump', url: 'https://www.youtube.com/watch?v=W5gc1Inyha0', source: 'Rox Lyfe' },
  { slug: 'hyrox-farmer-carry', url: 'https://www.youtube.com/watch?v=QB1CzHqrgtY', source: 'Velites' },
  { slug: 'hyrox-sandbag-lunges', url: 'https://www.youtube.com/watch?v=xYucnNaRfNg', source: 'Velites' },
];

// back-squat 1RM for athlete 70 (benchmark-slug vocabulary, kg implicit).
const BACK_SQUAT_1RM_KG = 80;

const log = (...a: unknown[]) => console.log('[seed_demo_technique]', ...a); // eslint-disable-line no-console

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  const host = url.match(/@([^/?]+)/)?.[1] ?? '';
  if (!host.includes(REQUIRED_HOST)) {
    throw new Error(
      `Refusing to run: DATABASE_URL host is "${host || '(unknown)'}", not the DEMO DB (${REQUIRED_HOST}). ` +
        `Point DATABASE_URL at the demo branch.`,
    );
  }
  log(`target host: ${host}`);

  const sql = getSql();
  try {
    // Guard against wrong-DB / wrong-id: athlete 70 must belong to coach 29.
    const owner = await sql<Array<{ coach_id: string }>>`
      select coach_id::text from athletes where id = ${ATHLETE_ID} limit 1
    `;
    if (owner.length === 0) throw new Error(`athlete ${ATHLETE_ID} not found on this DB`);
    if (Number(owner[0]!.coach_id) !== COACH_ID) {
      throw new Error(`athlete ${ATHLETE_ID} belongs to coach ${owner[0]!.coach_id}, expected ${COACH_ID}`);
    }

    // 1. video_url — idempotent (sets the canonical url; re-runs are no-ops).
    let updated = 0;
    const missing: string[] = [];
    for (const v of VIDEOS) {
      const res = await sql`
        update exercises set video_url = ${v.url}, updated_at = now()
        where slug = ${v.slug} and coalesce(video_url, '') <> ${v.url}
      `;
      const exists = await sql<Array<{ n: string }>>`
        select count(*)::text as n from exercises where slug = ${v.slug}
      `;
      if (Number(exists[0]!.n) === 0) missing.push(v.slug);
      else updated += res.count;
      log(`video ${v.slug} ← ${v.url} (${v.source})${res.count ? ' [set]' : ' [already]'}`);
    }
    if (missing.length) log(`WARNING: slugs not found in catalog: ${missing.join(', ')}`);
    log(`videos: ${updated} row(s) changed this run, ${VIDEOS.length - missing.length}/${VIDEOS.length} target exercises present`);

    // 2. back-squat 1RM (version 1, coach test, confirmed) — idempotent upsert.
    await sql`
      insert into athlete_strength_maxes
        (athlete_id, exercise_slug, one_rm_kg, source, needs_review, version, notes, recorded_at)
      values
        (${ATHLETE_ID}, 'back_squat_1rm', ${BACK_SQUAT_1RM_KG}, 'coach_test', false, 1, 'Demo seed', now())
      on conflict (athlete_id, exercise_slug, version) do update
        set one_rm_kg = excluded.one_rm_kg,
            source = excluded.source,
            needs_review = excluded.needs_review,
            notes = excluded.notes,
            recorded_at = now()
    `;
    const max = await sql<Array<{ one_rm_kg: string }>>`
      select one_rm_kg::text from athlete_strength_maxes
      where athlete_id = ${ATHLETE_ID} and exercise_slug = 'back_squat_1rm'
      order by version desc limit 1
    `;
    log(`back_squat_1rm athlete ${ATHLETE_ID}: ${max[0]?.one_rm_kg ?? '(none)'} kg`);

    log('done.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('[seed_demo_technique] FAILED:', err); // eslint-disable-line no-console
  process.exit(1);
});
