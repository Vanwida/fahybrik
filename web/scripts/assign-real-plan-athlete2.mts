/**
 * ONE-OFF (demo setup) — assign athlete 2 the REAL 12-week HYROX plan as 12
 * sequential MICROCYCLES (the assignment unit in FAHYBRIK), grouped under the
 * already-created ATR macrocycle (macrocycle 2: ACC w1-5 / TRANS w6-9 / REAL
 * w10-12). Reuses the production per-week internals (instantiateWeekIntoMicrocycle)
 * — NO program_month / athlete_month_assignments wrapper.
 *
 * Each week → one microcycle bound to the ATR block covering its dates → that
 * week's workout_assignments (+ inline-materialized templates as needed).
 *
 * W1 Monday = 2026-05-11 so TODAY (2026-06-05) lands in W4 (current microcycle),
 * with W1-3 past (executed) and W5-12 upcoming.
 *
 * Run (server-only neutralized + web tsconfig):
 *   TSX_TSCONFIG_PATH=web/tsconfig.json tsx web/scripts/assign-real-plan-athlete2.mts
 */
const { instantiateWeekIntoMicrocycle } = await import('@/lib/dashboard/coach/instantiate-program');
const { sql } = await import('@/lib/db');
const { parseIsoDate, mondayOfWeek, addDays, isoDateString } = await import(
  '@fahybrid/shared/domain/atr/dates'
);

const COACH_ID = 4;
const ATHLETE_ID = 2;
const W1_MONDAY = '2026-05-11';

// week_number (1-based) → balanced program_week_template id, in plan order.
const WEEK_TEMPLATES: number[] = [51, 80, 81, 89, 92, 54, 55, 56, 57, 86, 87, 88];

async function main(): Promise<void> {
  // Guard: athlete must have no existing workout_assignments (legacy removed).
  const existingWa = await sql<{ n: string }[]>`
    select count(*)::text as n from workout_assignments where athlete_id = ${ATHLETE_ID}
  `;
  if (Number(existingWa[0]!.n) > 0) {
    throw new Error(
      `athlete ${ATHLETE_ID} already has ${existingWa[0]!.n} workout_assignments — refusing. Clean first.`,
    );
  }

  // The macrocycle + ATR blocks must already exist and cover all 12 weeks.
  const macroRows = await sql<{ id: string }[]>`
    select id::text from atr_macrocycles
    where athlete_id = ${ATHLETE_ID} and status in ('planned', 'active')
    order by start_date desc limit 1
  `;
  if (!macroRows[0]) {
    throw new Error(`no active/planned macrocycle for athlete ${ATHLETE_ID} — create ATR blocks first.`);
  }
  const macrocycleId = macroRows[0].id;

  const startMonday = mondayOfWeek(parseIsoDate(W1_MONDAY));
  let totalAssignments = 0;
  const microcycleIds: string[] = [];

  await sql.begin(async (tx) => {
    for (let wi = 0; wi < WEEK_TEMPLATES.length; wi++) {
      const weekStart = addDays(startMonday, wi * 7);
      const res = await instantiateWeekIntoMicrocycle({
        client: tx as never,
        coach_id: COACH_ID,
        athlete_id: ATHLETE_ID,
        macrocycle_id: macrocycleId,
        week_template_id: WEEK_TEMPLATES[wi]!,
        week_start: weekStart,
        week_number: wi + 1,
      });
      microcycleIds.push(res.microcycle_id);
      totalAssignments += res.assignment_count;
      console.log(
        `[assign] W${wi + 1} (pwt ${WEEK_TEMPLATES[wi]}) ${isoDateString(weekStart)} -> ` +
          `microcycle ${res.microcycle_id}, ${res.assignment_count} workouts`,
      );
    }
  });

  console.log(
    `[assign] DONE — ${microcycleIds.length} microcycles, ${totalAssignments} workout_assignments for athlete ${ATHLETE_ID}.`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error('[assign] FAILED:', err);
  process.exit(1);
});
