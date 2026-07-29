/**
 * Seed demo RACES for athlete 2 so the "days until race" countdown + the
 * target/tune-up distinction show up in the demo.
 *
 * Two races, to demo A/B/C-race periodization:
 *   1. TARGET   — "HYROX Barcelona 2026", priority='target'. race_date = the END
 *                 of athlete 2's plan (queried live from his microcycles;
 *                 ~2026-08-02). The plan peaks to this; it's the main countdown.
 *   2. TUNE-UP  — "DEKA Strong Barcelona", priority='tune_up'. An intermediate
 *                 race ~3 weeks BEFORE the target (no taper, used as a test). So
 *                 getTargetRace → the August HYROX, getNextRace → the July DEKA.
 *
 * Idempotent: upsert keyed on (athlete_id, name) via a partial unique match —
 * we delete-then-insert this exact pair each run so re-running never dupes and
 * always reflects the current plan end. Safe to run after every release.
 *
 * Run: pnpm --filter @fahybrid/infra exec tsx scripts/seed_demo_race.ts
 */
import { getSql } from './_db.js';

const ATHLETE_ID = 2;
const TARGET_NAME = 'HYROX Barcelona 2026';
const TUNE_UP_NAME = 'DEKA Strong Barcelona';
// Tune-up sits ~3 weeks before the target (no-taper intermediate test).
const TUNE_UP_DAYS_BEFORE_TARGET = 21;
// Realistic HYROX Singles Open target: 1:15:00.
const TARGET_GOAL_SECONDS = 4500;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const sql = getSql();
  try {
    // Resolve the END of athlete 2's active plan = last microcycle end_date.
    const planRows = await sql<Array<{ plan_end: string | null }>>`
      select to_char(max(mc.end_date), 'YYYY-MM-DD') as plan_end
      from microcycles mc
      where mc.athlete_id = ${ATHLETE_ID}
    `;
    const planEnd = planRows[0]?.plan_end;
    if (!planEnd) {
      throw new Error(
        `El atleta ${ATHLETE_ID} no tiene microciclos; no hay final de plan al que anclar la carrera.`,
      );
    }
    const targetDate = planEnd;
    const tuneUpDate = addDaysIso(targetDate, -TUNE_UP_DAYS_BEFORE_TARGET);

    // Resolve the athlete's coach for created_by_coach_id (nullable FK).
    const coachRows = await sql<Array<{ coach_id: string | null }>>`
      select coach_id::text as coach_id from athletes where id = ${ATHLETE_ID} limit 1
    `;
    const coachId = coachRows[0]?.coach_id ? Number(coachRows[0].coach_id) : null;

    // Idempotent: clear the exact two demo races for this athlete, then insert.
    await sql`
      delete from races
      where athlete_id = ${ATHLETE_ID}
        and name in (${TARGET_NAME}, ${TUNE_UP_NAME})
    `;

    await sql`
      insert into races (
        athlete_id, created_by_coach_id, name, event_type, format, division,
        gender_category, priority, age_group, race_date, location,
        goal_time_seconds, result_time_seconds, status, is_synthetic
      ) values
        (
          ${ATHLETE_ID}, ${coachId}, ${TARGET_NAME}, 'hyrox', 'singles', 'open',
          'men', 'target', null, ${targetDate}::date, 'Barcelona',
          ${TARGET_GOAL_SECONDS}, null, 'registered', true
        ),
        (
          ${ATHLETE_ID}, ${coachId}, ${TUNE_UP_NAME}, 'deka', 'singles', 'open',
          'men', 'tune_up', null, ${tuneUpDate}::date, 'Barcelona',
          null, null, 'registered', true
        )
    `;

    const check = await sql<
      Array<{ name: string; priority: string; race_date: string }>
    >`
      select name, priority::text as priority, to_char(race_date, 'YYYY-MM-DD') as race_date
      from races
      where athlete_id = ${ATHLETE_ID}
      order by race_date asc
    `;
    console.log(`Seeded ${check.length} race(s) for athlete ${ATHLETE_ID}:`);
    for (const r of check) {
      console.log(`  • ${r.race_date}  [${r.priority}]  ${r.name}`);
    }
    console.log(
      `(target=${targetDate} from plan end, tune-up=${tuneUpDate} = target − ${TUNE_UP_DAYS_BEFORE_TARGET}d)`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
