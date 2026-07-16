/**
 * seed_demo_athlete_races.ts — give the demo athlete a realistic HYROX race
 * history (hyresult-style, with per-run/per-station splits, ranks and doubles
 * partners), copied from the reference demo athlete's imported races.
 *
 * WHY A COPY (not a re-import): the demo athlete's 8 races were IMPORTED through
 * the app's race-import UI, never a seed — so there is no service to re-run. Their
 * exact shape (run_splits_json / station_splits_json / roxzone / ranks / partners)
 * is the showcase, so we snapshot those rows into a committed fixture
 * (fixtures/demo_athlete1_races.json, dumped from the demo branch) and replay them
 * here. Self-contained + reproducible: no live demo-branch dependency at run time.
 *
 * WHAT IT WRITES (all keyed to the resolved DEMO athlete + coach):
 *   - one `races` row per fixture race (athlete_id = demo athlete, created_by =
 *     demo coach). event_id is REMAPPED by event NAME to main's own events (the
 *     demo ids don't exist here); unmatched → NULL (FK is ON DELETE SET NULL).
 *   - its `race_partners` rows (doubles partner names on completed doubles races).
 *
 * IDEMPOTENT: per race, keyed on (athlete_id, name, race_date) — the reference set
 * has two "HYROX Barcelona" races on different dates, so name alone would collide.
 * Re-running deletes the matching race (partners cascade) and re-inserts. Scoped to
 * exactly the fixture races, so a separately-seeded doubles joint race is untouched.
 *
 * TARGET + GUARD (shared _demo_target): athlete resolved by marker email; demo
 * branch always writable, MAIN only with SEED_DEMO_ALLOW_MAIN=1.
 *
 * RUN (against MAIN):
 *   cd web && SEED_DEMO_ALLOW_MAIN=1 DATABASE_URL="<main>" \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/seed_demo_athlete_races.ts
 */
import './_load_web_env.ts';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_db.js';
import { assertDemoWriteHost, resolveDemoTarget } from './_demo_target.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, 'fixtures', 'demo_athlete1_races.json');

const log = (...a: unknown[]) => console.log('[seed_demo_athlete_races]', ...a); // eslint-disable-line no-console

interface PartnerFix {
  position: number;
  name: string;
  slug: string | null;
  nation: string | null;
  source_idp: string | null;
}

interface RaceFix {
  name: string;
  event_type: string;
  format: string;
  division: string | null;
  gender_category: string | null;
  priority: string | null;
  age_group: string | null;
  race_date: string | null;
  location: string | null;
  goal_time_seconds: number | null;
  result_time_seconds: number | null;
  status: string;
  run_splits_json: unknown | null;
  station_splits_json: unknown | null;
  roxzone_seconds: number | null;
  run_total_seconds: number | null;
  best_run_lap_seconds: number | null;
  overall_rank: number | null;
  age_group_rank: number | null;
  field_size: number | null;
  nationality: string | null;
  bib: string | null;
  source: string | null;
  source_idp: string | null;
  source_event: string | null;
  source_season: string | null;
  source_url: string | null;
  event_name: string | null;
  partners: PartnerFix[];
}

type Sql = ReturnType<typeof getSql>;

async function resolveEventId(sql: Sql, eventName: string | null): Promise<number | null> {
  if (!eventName) return null;
  const rows = await sql<Array<{ id: string }>>`
    select id::text from events where name = ${eventName} order by id asc limit 1
  `;
  return rows[0] ? Number(rows[0].id) : null;
}

/** Scale every split/time by `f` (DEMO_RACES_SCALE) — used to give the doubles
 *  PARTNER a race history that is CLOSE to but not IDENTICAL to the main athlete's,
 *  so the pair's two solo predictions read as two real people (not a copy). */
function scaleRace(r: RaceFix, f: number): RaceFix {
  const s = (n: number | null) => (n == null ? n : Math.round(n * f));
  const runSplits = Array.isArray(r.run_splits_json)
    ? (r.run_splits_json as unknown[]).map((v) => (typeof v === 'number' ? Math.round(v * f) : v))
    : r.run_splits_json;
  const stnSplits = Array.isArray(r.station_splits_json)
    ? (r.station_splits_json as Array<Record<string, unknown>>).map((st) =>
        st && typeof st === 'object' && typeof st.seconds === 'number' ? { ...st, seconds: Math.round(st.seconds * f) } : st,
      )
    : r.station_splits_json;
  return {
    ...r,
    goal_time_seconds: s(r.goal_time_seconds),
    result_time_seconds: s(r.result_time_seconds),
    run_total_seconds: s(r.run_total_seconds),
    roxzone_seconds: s(r.roxzone_seconds),
    best_run_lap_seconds: s(r.best_run_lap_seconds),
    run_splits_json: runSplits,
    station_splits_json: stnSplits,
  };
}

async function main(): Promise<void> {
  const host = assertDemoWriteHost('seed_demo_athlete_races');
  log(`target host: ${host}`);

  const all = JSON.parse(readFileSync(FIXTURE, 'utf8')) as RaceFix[];
  // DEMO_RACES_ONLY_COMPLETED=1 seeds ONLY completed races (with splits) — used for
  // the doubles PARTNER, whose own recent completed race drives the pair prediction
  // (the singles predict layer reads own-race splits), without copying the main
  // athlete's future singles targets.
  const completedOnly = (process.env.DEMO_RACES_ONLY_COMPLETED ?? '').trim() === '1';
  const scaleRaw = (process.env.DEMO_RACES_SCALE ?? '').trim();
  const scale = scaleRaw ? Number(scaleRaw) : null;
  if (scale != null && (!Number.isFinite(scale) || scale <= 0)) throw new Error(`invalid DEMO_RACES_SCALE: ${scaleRaw}`);
  const selected = completedOnly ? all.filter((r) => r.status === 'completed') : all;
  const races = scale != null ? selected.map((r) => scaleRace(r, scale)) : selected;
  const sql = getSql();
  try {
    const target = await resolveDemoTarget(sql);
    const A = target.athleteId;
    const C = target.coachId;
    log(`resolved demo athlete ${A} <${target.athleteEmail}>, coach ${C}; ${races.length}/${all.length} races${completedOnly ? ' (completed-only)' : ''}${scale != null ? ` (scaled ×${scale})` : ''}`);

    let inserted = 0;
    let partnersInserted = 0;
    let eventsLinked = 0;
    const eventMisses: string[] = [];

    for (const r of races) {
      const eventId = await resolveEventId(sql, r.event_name);
      if (r.event_name) {
        if (eventId != null) eventsLinked++;
        else eventMisses.push(r.event_name);
      }

      // Idempotent: drop any prior copy of THIS race (partners cascade), re-insert.
      await sql`
        delete from races
        where athlete_id = ${A} and name = ${r.name}
          and race_date is not distinct from ${r.race_date}::date
      `;

      const ins = await sql<Array<{ id: string }>>`
        insert into races (
          athlete_id, created_by_coach_id, name,
          event_type, format, division, gender_category, priority,
          age_group, race_date, location, goal_time_seconds, result_time_seconds, status,
          run_splits_json, station_splits_json, roxzone_seconds, run_total_seconds, best_run_lap_seconds,
          overall_rank, age_group_rank, field_size, nationality, bib,
          source, source_idp, source_event, source_season, source_url,
          event_id, imported_at, auto_import_attempts
        ) values (
          ${A}, ${C}, ${r.name},
          ${r.event_type}::race_event_type, ${r.format}::race_format, ${r.division}::race_division,
          ${r.gender_category}::race_gender, ${r.priority}::race_priority,
          ${r.age_group}, ${r.race_date}::date, ${r.location}, ${r.goal_time_seconds}, ${r.result_time_seconds},
          ${r.status}::race_status,
          ${r.run_splits_json ? sql.json(r.run_splits_json as never) : null},
          ${r.station_splits_json ? sql.json(r.station_splits_json as never) : null},
          ${r.roxzone_seconds}, ${r.run_total_seconds}, ${r.best_run_lap_seconds},
          ${r.overall_rank}, ${r.age_group_rank}, ${r.field_size}, ${r.nationality}, ${r.bib},
          ${r.source}, ${r.source_idp}, ${r.source_event}, ${r.source_season}, ${r.source_url},
          ${eventId}, ${r.source ? sql`now()` : null}, 0
        )
        returning id::text
      `;
      const raceId = Number(ins[0]!.id);
      inserted++;

      for (const p of r.partners) {
        await sql`
          insert into race_partners (race_id, position, name, slug, nation, source_idp)
          values (${raceId}, ${p.position}, ${p.name}, ${p.slug}, ${p.nation}, ${p.source_idp})
        `;
        partnersInserted++;
      }
      log(
        `race "${r.name}" (${r.race_date}, ${r.status}/${r.format}) → id ${raceId}` +
          `${eventId != null ? ` · event ${eventId}` : ''}${r.partners.length ? ` · ${r.partners.length} partner(s)` : ''}`,
      );
    }

    // ── verify ──
    const counts = await sql<Array<{ races: string; withRun: string; partners: string }>>`
      select
        (select count(*)::text from races where athlete_id = ${A}) as races,
        (select count(*)::text from races where athlete_id = ${A} and run_splits_json is not null) as "withRun",
        (select count(*)::text from race_partners rp join races r on r.id = rp.race_id where r.athlete_id = ${A}) as partners
    `;
    log(
      `done — inserted ${inserted} races (${partnersInserted} partners); ` +
        `athlete now has ${counts[0]!.races} races (${counts[0]!.withRun} with run splits, ${counts[0]!.partners} partner rows). ` +
        `events linked ${eventsLinked}${eventMisses.length ? `; unmatched: ${eventMisses.join(', ')} (event_id NULL)` : ''}`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('[seed_demo_athlete_races] FAILED:', err); // eslint-disable-line no-console
  process.exit(1);
});
