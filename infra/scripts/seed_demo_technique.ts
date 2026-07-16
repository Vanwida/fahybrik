/**
 * Seed the technique/strength demo data for the demo athlete (resolved by marker
 * email). Two things, both idempotent:
 *   1. A back-squat 1RM (80 kg) in `athlete_strength_maxes` for the demo athlete —
 *      athlete-scoped, so the %RM → kg resolution surfaces an absolute load.
 *   2. Real YouTube technique URLs on the exercises that appear in the plan.
 *
 * ── GLOBAL-WRITE SAFETY ──────────────────────────────────────────────────────
 * `exercises.video_url` is GLOBAL, shared catalog content — NOT tied to a demo
 * account. On the demo branch the whole DB is demo-isolated, so enriching it is
 * fine. On MAIN it would leak to every real athlete, which the demo-seed HARD
 * RULE forbids ("only write rows tied to demo accounts"). So the video writes are
 * SKIPPED on main and only applied on the demo branch. The 1RM (athlete-scoped)
 * always runs.
 *
 * URLs are real, public, ground-truthed videos (verified via YouTube oEmbed) —
 * official Concept2 / Global Triathlon Network / HYROX-partner channels.
 *
 * TARGET + GUARD (shared _demo_target): athlete resolved by marker email; demo
 * branch always writable, MAIN only with SEED_DEMO_ALLOW_MAIN=1.
 *
 * RUN (against MAIN):
 *   cd web && SEED_DEMO_ALLOW_MAIN=1 DATABASE_URL="<main>" \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/seed_demo_technique.ts
 */
import './_load_web_env.ts';
import { getSql } from './_db.js';
import { assertDemoWriteHost, resolveDemoTarget, currentHost } from './_demo_target.ts';

/** On this host the exercises catalog is demo-isolated → safe to enrich. */
const DEMO_HOST = 'ep-flat-wind';

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
  const host = assertDemoWriteHost('seed_demo_technique');
  log(`target host: ${host}`);

  const sql = getSql();
  try {
    const target = await resolveDemoTarget(sql);
    const ATHLETE_ID = target.athleteId;
    log(`resolved demo athlete ${ATHLETE_ID} <${target.athleteEmail}>, coach ${target.coachId}`);

    // 1. video_url — GLOBAL catalog content. Only enrich it on the demo-isolated
    //    branch; on main it would leak to every real athlete (HARD RULE), so skip.
    if (currentHost().includes(DEMO_HOST)) {
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
    } else {
      log('videos: SKIPPED (global exercises.video_url is shared catalog on main — HARD RULE: demo-account rows only)');
    }

    // 2. back-squat 1RM (version 1, coach test, confirmed) — athlete-scoped,
    //    idempotent upsert. Runs on every host.
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
