/**
 * seed_demo_dobles_race.ts — the full DOUBLES showcase for the demo athlete: a
 * training PARTNER, an active PAIR, a shared upcoming RACE, and the coach's joint
 * PREDICTION ("predicho conjunto"). Built through the REAL coach services so the
 * pair behaves exactly like one a coach creates.
 *
 * WHAT IT BUILDS (idempotent, all keyed to the resolved demo accounts):
 *   1. PARTNER  → "Guillem Soler" (athlete.demo.partner@demo.fahybrid.local) as a
 *      comp athlete of the demo coach (createCompAthlete). Reused if it exists.
 *   2. PAIR     → createDoublesPair(demo athlete + partner). reconcilePair aligns
 *      the partner onto the athlete's (level, days). Skipped if already paired.
 *   3. EVENT    → future catalog event "HYROX Madrid 2026" (visible to athletes).
 *   4. RACES    → one doubles `races` row per athlete (registered, pair goal 65:00,
 *      priority 'secondary' so it never hijacks the singles goal-gap), linked to
 *      the event. Delete-then-insert by (athlete, name, format).
 *   5. PREDICHO → a `dobles_simulations` row (per-station reparto + tactical notes,
 *      copied from the reference demo via fixtures/demo_athlete1_doubles_sim.json)
 *      pointed at the event, so the joint prediction board renders.
 *
 * TARGET + GUARD (shared _demo_target): coach/athlete/partner resolved by MARKER
 * EMAIL; demo branch always writable, MAIN only with SEED_DEMO_ALLOW_MAIN=1.
 *
 * RUN (against MAIN — AFTER seed_demo_athlete_races so the athlete's own race 31
 * is reconciled into the linked doubles race):
 *   cd web && SEED_DEMO_ALLOW_MAIN=1 DATABASE_URL="<main>" \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/seed_demo_dobles_race.ts
 */
import './_load_web_env.ts';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Sql } from '@/lib/db';
import { assertDemoWriteHost, resolveDemoTarget, DEMO_PARTNER_EMAIL } from './_demo_target.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIM_FIXTURE = resolve(HERE, 'fixtures', 'demo_athlete1_doubles_sim.json');

const PARTNER_NAME = 'Guillem Soler';
const EVENT_SLUG = 'hyrox-madrid-2026-doubles-demo';
const EVENT_NAME = 'HYROX Madrid 2026';
const EVENT_DATE = '2026-09-26';
const RACE_NAME = 'HYROX Madrid 2026';
/** A realistic HYROX Doubles Open pair goal: 1:05:00. */
const PAIR_GOAL_SECONDS = 3900;
const DIVISION = 'open';
const GENDER = 'men';

const log = (...a: unknown[]) => console.log('[seed_demo_dobles_race]', ...a); // eslint-disable-line no-console

interface SimFixture {
  station_splits: unknown;
  running_note: string | null;
  roxzone_note: string | null;
  tactical_note: string | null;
  last_edited_by_kind: string | null;
}

type Deps = {
  sql: Sql;
  createCompAthlete: typeof import('@/lib/dashboard/coach/comp-athletes')['createCompAthlete'];
  createDoublesPair: typeof import('@/lib/dashboard/coach/doubles-pairs')['createDoublesPair'];
  getActiveDoublesPairForAthlete: typeof import('@/lib/dashboard/coach/doubles-pairs')['getActiveDoublesPairForAthlete'];
};

let D: Deps;

async function loadDeps(): Promise<Deps> {
  const [db, comp, pairs] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/dashboard/coach/comp-athletes'),
    import('@/lib/dashboard/coach/doubles-pairs'),
  ]);
  return {
    sql: db.sql,
    createCompAthlete: comp.createCompAthlete,
    createDoublesPair: pairs.createDoublesPair,
    getActiveDoublesPairForAthlete: pairs.getActiveDoublesPairForAthlete,
  };
}

/** Find the partner comp-athlete by marker email, or create it under the coach. */
async function ensurePartner(coachId: number): Promise<{ id: number; userId: number }> {
  const existing = await D.sql<Array<{ id: string; user_id: string }>>`
    select a.id::text, a.user_id::text
    from athletes a join users u on u.id = a.user_id
    where lower(u.email) = ${DEMO_PARTNER_EMAIL.toLowerCase()}
    limit 1
  `;
  if (existing.length > 0) {
    log(`partner exists: athlete ${existing[0]!.id} <${DEMO_PARTNER_EMAIL}>`);
    return { id: Number(existing[0]!.id), userId: Number(existing[0]!.user_id) };
  }
  const created = await D.createCompAthlete({
    coach_id: coachId,
    input: { full_name: PARTNER_NAME, email: DEMO_PARTNER_EMAIL.toLowerCase(), modality: 'dobles' },
  });
  const userRow = await D.sql<Array<{ user_id: string }>>`
    select user_id::text from athletes where id = ${Number(created.id)} limit 1
  `;
  log(`partner created: athlete ${created.id} "${PARTNER_NAME}" <${DEMO_PARTNER_EMAIL}>`);
  return { id: Number(created.id), userId: Number(userRow[0]!.user_id) };
}

/** Ensure an active pair (athlete + partner) via the real service. Idempotent. */
async function ensurePair(coachId: number, athleteId: number, partnerId: number): Promise<number> {
  const active = await D.getActiveDoublesPairForAthlete(athleteId, D.sql);
  if (active) {
    if (active.partner_id !== partnerId) {
      throw new Error(`athlete ${athleteId} already paired with ${active.partner_id}, not the demo partner ${partnerId}`);
    }
    log(`pair exists: id ${active.pair_id} (${athleteId} + ${partnerId})`);
    return active.pair_id;
  }
  const pair = await D.createDoublesPair({ coach_id: coachId, athlete_a_id: athleteId, athlete_b_id: partnerId });
  log(`pair created: id ${pair.id} (${athleteId} + ${partnerId})`);
  return Number(pair.id);
}

/** Upsert the future catalog event; return its id. */
async function ensureEvent(coachId: number): Promise<number> {
  const rows = await D.sql<Array<{ id: string }>>`
    insert into events (
      slug, name, type, location, country, region,
      start_date, end_date, division, division_options,
      is_visible_to_athletes, created_by_coach_id
    ) values (
      ${EVENT_SLUG}, ${EVENT_NAME}, 'hyrox', 'Madrid', 'España', 'Madrid',
      ${EVENT_DATE}, null, 'Doubles',
      ${['Open', 'Pro', 'Doubles', 'Mixed Doubles']},
      true, ${coachId}
    )
    on conflict (slug) do update set
      name = excluded.name,
      start_date = excluded.start_date,
      is_visible_to_athletes = true,
      updated_at = now()
    returning id::text as id
  `;
  log(`event "${EVENT_NAME}" id=${rows[0]!.id} (${EVENT_DATE})`);
  return Number(rows[0]!.id);
}

/** One doubles race per athlete, linked to the event. Delete-then-insert. */
async function ensureJointRaces(coachId: number, eventId: number, athleteIds: number[]): Promise<void> {
  for (const athleteId of athleteIds) {
    await D.sql`
      delete from races
      where athlete_id = ${athleteId} and name = ${RACE_NAME} and format = 'doubles'::race_format
    `;
    await D.sql`
      insert into races (
        athlete_id, created_by_coach_id, event_id, name, event_type, format,
        division, gender_category, priority, race_date, location,
        goal_time_seconds, status
      ) values (
        ${athleteId}, ${coachId}, ${eventId}, ${RACE_NAME}, 'hyrox'::race_event_type,
        'doubles'::race_format, ${DIVISION}::race_division, ${GENDER}::race_gender,
        'secondary'::race_priority, ${EVENT_DATE}::date, 'Madrid',
        ${PAIR_GOAL_SECONDS}, 'registered'::race_status
      )
    `;
    log(`doubles race for athlete ${athleteId} → event ${eventId}, goal ${PAIR_GOAL_SECONDS}s`);
  }
}

/** Upsert the coach's joint prediction (station reparto + notes) for the pair. */
async function ensureSimulation(coachId: number, aUser: number, bUser: number, eventId: number): Promise<void> {
  const fix = JSON.parse(readFileSync(SIM_FIXTURE, 'utf8')) as SimFixture;
  // Idempotent: one prediction per user-pair (either order). Rebuild it.
  await D.sql`
    delete from dobles_simulations
    where (athlete_a_user_id = ${aUser} and athlete_b_user_id = ${bUser})
       or (athlete_a_user_id = ${bUser} and athlete_b_user_id = ${aUser})
  `;
  await D.sql`
    insert into dobles_simulations (
      athlete_a_user_id, athlete_b_user_id, target_event_id, station_splits,
      running_note, roxzone_note, tactical_note, created_by_coach_id,
      last_edited_by_kind, last_edited_by_user_id
    ) values (
      ${aUser}, ${bUser}, ${eventId}, ${D.sql.json(fix.station_splits as never)},
      ${fix.running_note}, ${fix.roxzone_note}, ${fix.tactical_note}, ${coachId},
      'coach', ${coachId}
    )
  `;
  log(`predicho conjunto set: users ${aUser}+${bUser} → event ${eventId} (${Array.isArray(fix.station_splits) ? fix.station_splits.length : 0} station splits)`);
}

async function main(): Promise<void> {
  const host = assertDemoWriteHost('seed_demo_dobles_race');
  log(`target host: ${host}`);

  D = await loadDeps();
  const target = await resolveDemoTarget(D.sql);
  const athleteId = target.athleteId;
  const coachId = target.coachId;
  const aUser = target.athleteUserId;
  log(`resolved demo athlete ${athleteId} <${target.athleteEmail}>, coach ${coachId}`);

  const partner = await ensurePartner(coachId);
  const pairId = await ensurePair(coachId, athleteId, partner.id);
  const eventId = await ensureEvent(coachId);
  await ensureJointRaces(coachId, eventId, [athleteId, partner.id]);
  await ensureSimulation(coachId, aUser, partner.userId, eventId);

  // ── verify ──
  const check = await D.sql<Array<{ race_id: string; goal: number | null; pair_status: string }>>`
    select r.id::text as race_id, r.goal_time_seconds as goal, dp.status::text as pair_status
    from races r
    join doubles_pairs dp on dp.id = ${pairId} and dp.status = 'active'
    where r.athlete_id = ${athleteId} and r.name = ${RACE_NAME} and r.format = 'doubles'::race_format
    limit 1
  `;
  if (check.length === 0) throw new Error('verification failed: no doubles race for the demo athlete with an active pair');
  log(`verified: race_id=${check[0]!.race_id} goal=${check[0]!.goal}s pair=${check[0]!.pair_status} (id ${pairId})`);
  log('done.');

  await D.sql.end();
}

main().catch(async (err) => {
  console.error('[seed_demo_dobles_race] FAILED:', err); // eslint-disable-line no-console
  try {
    await D?.sql?.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
