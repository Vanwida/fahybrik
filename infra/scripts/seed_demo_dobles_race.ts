/**
 * Seed a DEMO doubles race for the demo pair (doubles_pairs id=2: athletes 70
 * "Atleta Demo 1" + 100 "Guillem Soler", coach 29) so the doubles race-gap board
 * (GET /api/athlete/dobles/race-gap) has something real to render in the demo.
 *
 * It creates (idempotently):
 *   1. a future catalog EVENT — "HYROX Madrid 2026" (~2026-09-26), visible to
 *      athletes;
 *   2. one `races` row PER athlete (70 & 100): format='doubles', same
 *      division/gender coherent with the pair (open/men), priority='secondary'
 *      (NOT 'target' — a doubles race must never hijack the singles goal-gap
 *      target), status='registered', goal_time_seconds=3900 (a 65:00 pair goal),
 *      linked to the event;
 *   3. sets the pair's dobles_simulations.target_event_id to the new event.
 *
 * DEMO ONLY — never run against prod. Idempotent: the event upserts on slug, the
 * two races are delete-then-inserted by (athlete, name, format).
 *
 * Run: pnpm --filter @fahybrid/infra exec tsx scripts/seed_demo_dobles_race.ts
 */
import { getSql } from './_db.js';

const PAIR_ID = 2;
const ATHLETE_A = 70;
const ATHLETE_B = 100;
const COACH_ID = 29;

const EVENT_SLUG = 'hyrox-madrid-2026-doubles-demo';
const EVENT_NAME = 'HYROX Madrid 2026';
const EVENT_DATE = '2026-09-26';
const RACE_NAME = 'HYROX Madrid 2026';
// A realistic HYROX Doubles Open pair goal: 1:05:00.
const PAIR_GOAL_SECONDS = 3900;
const DIVISION = 'open';
const GENDER = 'men';

async function main() {
  const sql = getSql();
  try {
    // 1) Upsert the future catalog event.
    const eventRows = await sql<Array<{ id: string }>>`
      insert into events (
        slug, name, type, location, country, region,
        start_date, end_date, division, division_options,
        is_visible_to_athletes, created_by_coach_id
      ) values (
        ${EVENT_SLUG}, ${EVENT_NAME}, 'hyrox', 'Madrid', 'España', 'Madrid',
        ${EVENT_DATE}, null, 'Doubles',
        ${['Open', 'Pro', 'Doubles', 'Mixed Doubles']},
        true, ${COACH_ID}
      )
      on conflict (slug) do update set
        name = excluded.name,
        start_date = excluded.start_date,
        is_visible_to_athletes = true,
        updated_at = now()
      returning id::text as id
    `;
    const eventId = Number(eventRows[0]!.id);
    console.log(`[seed] event "${EVENT_NAME}" id=${eventId} (${EVENT_DATE})`);

    // 2) One doubles race per athlete. Delete-then-insert for idempotency.
    for (const athleteId of [ATHLETE_A, ATHLETE_B]) {
      await sql`
        delete from races
        where athlete_id = ${athleteId}
          and name = ${RACE_NAME}
          and format = 'doubles'::race_format
      `;
      await sql`
        insert into races (
          athlete_id, created_by_coach_id, event_id, name, event_type, format,
          division, gender_category, priority, race_date, location,
          goal_time_seconds, status
        ) values (
          ${athleteId}, ${COACH_ID}, ${eventId}, ${RACE_NAME}, 'hyrox'::race_event_type,
          'doubles'::race_format, ${DIVISION}::race_division, ${GENDER}::race_gender,
          'secondary'::race_priority, ${EVENT_DATE}::date, 'Madrid',
          ${PAIR_GOAL_SECONDS}, 'registered'::race_status
        )
      `;
      console.log(`[seed] doubles race for athlete ${athleteId} → event ${eventId}, goal ${PAIR_GOAL_SECONDS}s`);
    }

    // 3) Point the pair's simulation at the event (target_event_id).
    const userRows = await sql<Array<{ a_user: string; b_user: string }>>`
      select
        (select user_id::text from athletes where id = ${ATHLETE_A}) as a_user,
        (select user_id::text from athletes where id = ${ATHLETE_B}) as b_user
    `;
    const aUser = Number(userRows[0]!.a_user);
    const bUser = Number(userRows[0]!.b_user);
    const simUpdate = await sql<Array<{ id: string }>>`
      update dobles_simulations set target_event_id = ${eventId}, updated_at = now()
      where (athlete_a_user_id = ${aUser} and athlete_b_user_id = ${bUser})
         or (athlete_a_user_id = ${bUser} and athlete_b_user_id = ${aUser})
      returning id::text as id
    `;
    console.log(`[seed] simulation target_event_id set on ${simUpdate.length} row(s) for pair ${PAIR_ID}`);

    // 4) Verify: the athlete's doubles race + active pair exist (⇒ race-gap
    //    availability can never be no_pair).
    const check = await sql<
      Array<{ race_id: string; athlete_id: string; format: string; goal: number | null; pair_status: string }>
    >`
      select r.id::text as race_id, r.athlete_id::text as athlete_id, r.format::text as format,
             r.goal_time_seconds as goal, dp.status::text as pair_status
      from races r
      join doubles_pairs dp on dp.id = ${PAIR_ID} and dp.status = 'active'
      where r.athlete_id = ${ATHLETE_A} and r.name = ${RACE_NAME} and r.format = 'doubles'::race_format
      limit 1
    `;
    if (check.length === 0) throw new Error('verification failed: no doubles race for athlete 70 with an active pair');
    console.log(`[seed] verified: race_id=${check[0]!.race_id} athlete=${check[0]!.athlete_id} format=${check[0]!.format} goal=${check[0]!.goal} pair=${check[0]!.pair_status}`);
    console.log('[seed] done.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
