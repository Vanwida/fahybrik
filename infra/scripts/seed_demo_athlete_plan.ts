/**
 * seed_demo_athlete_plan.ts — give DEMO athlete 1 (athlete_id 70, coach 29) a
 * REAL, published 2-week microciclo so the iOS athlete loop (Tu semana → día →
 * empezar entreno → registrar) has CONTENT to audit + demo on TestFlight.
 *
 * Built entirely through the REAL coach machinery (no fabricated rows that skip
 * the pipeline):
 *   1. CLASSIFY athlete 70 → level N3 (Rendimiento) + 5 training days
 *      (UPDATE athletes — the same write the /level + /training-days routes do).
 *   2. ZONES — copy coach 29's offset model from Pablo (coach 4) methodology_zones
 *      (demo coaches were born after the 0061 seed, so they have none → the
 *      resolver can't run). Then derive athlete 70's absolute zone profiles for
 *      run/row/ski/bike via the SAME path the POST /test-result endpoint uses
 *      (loadCoachZonesForUnit → resolveZonesForAthlete → insertZoneProfileVersion).
 *      These let @Zn prescriptions resolve to ABSOLUTE paces in the plan.
 *   3. MICROCICLO — a coach-29 program_month_templates (2 weeks) whose week
 *      slots reference Pablo's typed blocks (already cloned into coach 29's
 *      library): strength %RM, run zone-intervals, erg zone, a typed WOD (EMOM),
 *      strength kg, run threshold intervals. Built via createMonthTemplate +
 *      upsertWeekTemplate (blocks hydrate from block_exercises at assign time).
 *   4. ASSIGN + PUBLISH — assignMonthToAthlete (materializes microcycles +
 *      workout_assignments + snapshotted templates/segments) then publishMicrociclo
 *      (every week → weekly_plans.status='published'). The real production path.
 *
 * 2 weeks starting THIS week's Monday so the plan covers BOTH the current week
 * (audit today) AND next week (TestFlight demo tomorrow), regardless of run day.
 *
 * Demo athlete 2 (athlete_id 71, coach 30) is left UNTOUCHED — an honest
 * blank-slate athlete alongside a populated one.
 *
 * IDEMPOTENT: classify = UPDATE; zone copy = ON CONFLICT DO NOTHING; zone
 * profiles = skip if a current row exists; month template = find-or-create by a
 * stable name marker (weeks re-upserted); assignment = reuse if one already
 * exists for (athlete, template, start_date); publish = idempotent upsert.
 * Re-running converges, never duplicates.
 *
 * HOST-GUARDED: refuses to run unless DATABASE_URL host is the demo branch
 * (ep-flat-wind). Touches ONLY athlete 70 / coach 29 (+ coach-4 read for zones).
 *
 * RUN (against the DEMO DB — host must be ep-flat-wind):
 *   cd web && NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/seed_demo_athlete_plan.ts
 */
import './_load_web_env.ts';

import type { Sql } from '@/lib/db';

// ── CONFIG ───────────────────────────────────────────────────────────────────

const REQUIRED_HOST = 'ep-flat-wind'; // demo branch — the ONLY DB this may touch
const ATHLETE_ID = 70; // demo athlete 1 (gets the plan)
const COACH_ID = 29; //   demo coach 1 (owns athlete 70 + the cloned library)
const SOURCE_ZONE_COACH_ID = 4; // Pablo — source of the methodology_zones offset model
const LEVEL_NAME = 'N3'; // Rendimiento
const TRAINING_DAYS = 5;
const WEEK_COUNT = 2; // covers current week (audit) + next week (TestFlight demo)
const MONTH_NAME = 'Microciclo Demo · Atleta 1'; // stable idempotency marker

/** Athlete 70's test thresholds (Z4 lower bound) per modality → feed the resolver.
 *  Realistic N3 (Rendimiento) hybrid values. Unit is intrinsic to the modality:
 *  run → per_km, ergos → per_500m (mirrors paceUnitForModality in /test-result). */
const ZONE_TESTS: Array<{ modality: 'run' | 'row' | 'ski' | 'bike'; threshold_s: number; pace_unit: 'per_km' | 'per_500m' }> = [
  { modality: 'run', threshold_s: 255, pace_unit: 'per_km' }, //  4:15/km
  { modality: 'row', threshold_s: 112, pace_unit: 'per_500m' }, // 1:52/500m
  { modality: 'ski', threshold_s: 132, pace_unit: 'per_500m' }, // 2:12/500m
  { modality: 'bike', threshold_s: 78, pace_unit: 'per_500m' }, // 1:18/500m
];

/** Pablo's typed blocks, cloned into coach 29's library (slug suffix `--c29`).
 *  Resolved to ids at runtime so we never hardcode clone-specific block ids. */
const BLOCK_SLUGS = {
  STRENGTH_RM: 'g1-1-front-squat-5-rounds-10-10-8-8-6-al-65-80--c29', // %RM front squat
  RUN_ZONE: 'g4-38-fartlek-10-wu-5x5-z4-1-z5--c29', //                  run @Zn → resolves pace
  ERG_ZONE: 'g5-52-10-row-z2--c29', //                                  erg @Zn → resolves pace
  WOD_EMOM: 'g9-87-emom-15-20-bw-lunges--c29', //                       typed WOD (EMOM)
  STRENGTH_KG: 'g9-90-4r-20-reverse-lunge-30kg--c29', //               strength kg + sled + run
  RUN_INTERVALS: 'g4-33-threshold-3-bloques-3x5-a-15-5km-h--c29', //   run threshold intervals (pace)
} as const;
type BlockKey = keyof typeof BLOCK_SLUGS;

// templateFormat (slots vocab) per chosen block — REQUIRED, non-null.
type TemplateFormat = 'amrap' | 'for_time' | 'emom' | 'intervals' | 'strength_block' | 'hyrox_sim' | 'tempo' | 'circuit' | 'test';
type DaySpec = { dow: number; key: BlockKey; format: TemplateFormat };

// 5 training days/week (matches N3 × 5), 2 rest days (omitted → API renders rest).
// Week 1 and Week 2 differ (real microciclo, not a copy); all 6 blocks appear
// across the two weeks; each week has ≥1 @Zn cardio day so paces resolve.
const WEEK_PLANS: DaySpec[][] = [
  [
    { dow: 1, key: 'STRENGTH_RM', format: 'strength_block' },
    { dow: 2, key: 'RUN_ZONE', format: 'intervals' },
    { dow: 3, key: 'ERG_ZONE', format: 'tempo' },
    { dow: 4, key: 'WOD_EMOM', format: 'emom' },
    { dow: 5, key: 'STRENGTH_KG', format: 'circuit' },
  ],
  [
    { dow: 1, key: 'RUN_INTERVALS', format: 'intervals' },
    { dow: 2, key: 'STRENGTH_RM', format: 'strength_block' },
    { dow: 3, key: 'ERG_ZONE', format: 'tempo' },
    { dow: 4, key: 'WOD_EMOM', format: 'emom' },
    { dow: 5, key: 'STRENGTH_KG', format: 'circuit' },
  ],
];

// ── deps (dynamic import — server-only `@/` libs form cycles tsx's static linker
//    rejects; deferring to runtime under --conditions=react-server avoids it) ────
type Deps = {
  sql: Sql;
  createMonthTemplateWithEmptyWeeks: typeof import('@/lib/dashboard/coach/program-months')['createMonthTemplateWithEmptyWeeks'];
  upsertWeekTemplate: typeof import('@/lib/dashboard/coach/program-weeks')['upsertWeekTemplate'];
  assignMonthToAthlete: typeof import('@/lib/dashboard/programming/assign-month')['assignMonthToAthlete'];
  publishMicrociclo: typeof import('@/lib/coach/publish-microciclo')['publishMicrociclo'];
  loadCoachZonesForUnit: typeof import('@/lib/dashboard/v2/zone-derivation')['loadCoachZonesForUnit'];
  insertZoneProfileVersion: typeof import('@/lib/dashboard/v2/zone-derivation')['insertZoneProfileVersion'];
  resolveZonesForAthlete: typeof import('@fahybrid/shared/domain/methodology')['resolveZonesForAthlete'];
  loadAssignmentDetail: typeof import('@/lib/athlete/assignment-detail')['loadAssignmentDetail'];
  dates: typeof import('@fahybrid/shared/domain/dates');
};

let D: Deps;

async function loadDeps(): Promise<Deps> {
  const [db, months, weeks, assign, publish, zones, methodology, detail, dates] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/dashboard/coach/program-months'),
    import('@/lib/dashboard/coach/program-weeks'),
    import('@/lib/dashboard/programming/assign-month'),
    import('@/lib/coach/publish-microciclo'),
    import('@/lib/dashboard/v2/zone-derivation'),
    import('@fahybrid/shared/domain/methodology'),
    import('@/lib/athlete/assignment-detail'),
    import('@fahybrid/shared/domain/dates'),
  ]);
  return {
    sql: db.sql,
    createMonthTemplateWithEmptyWeeks: months.createMonthTemplateWithEmptyWeeks,
    upsertWeekTemplate: weeks.upsertWeekTemplate,
    assignMonthToAthlete: assign.assignMonthToAthlete,
    publishMicrociclo: publish.publishMicrociclo,
    loadCoachZonesForUnit: zones.loadCoachZonesForUnit,
    insertZoneProfileVersion: zones.insertZoneProfileVersion,
    resolveZonesForAthlete: methodology.resolveZonesForAthlete,
    loadAssignmentDetail: detail.loadAssignmentDetail,
    dates,
  };
}

const log = (...a: unknown[]) => console.log('[seed_demo_athlete_plan]', ...a); // eslint-disable-line no-console

// ── steps ──────────────────────────────────────────────────────────────────────

/** Verify athlete 70 belongs to coach 29 (guards against wrong-DB / wrong-id). */
async function assertOwnership(): Promise<void> {
  const rows = await D.sql<Array<{ coach_id: string }>>`
    select coach_id::text from athletes where id = ${ATHLETE_ID} limit 1
  `;
  if (rows.length === 0) throw new Error(`athlete ${ATHLETE_ID} not found on this DB`);
  if (Number(rows[0]!.coach_id) !== COACH_ID) {
    throw new Error(`athlete ${ATHLETE_ID} belongs to coach ${rows[0]!.coach_id}, expected ${COACH_ID}`);
  }
}

/** Classify athlete 70: level N3 + 5 training days (same writes as the routes). */
async function classifyAthlete(): Promise<{ level_id: number }> {
  const lvl = await D.sql<Array<{ id: string }>>`
    select id::text from athlete_levels where coach_id = ${COACH_ID} and name = ${LEVEL_NAME} limit 1
  `;
  if (lvl.length === 0) throw new Error(`coach ${COACH_ID} has no level "${LEVEL_NAME}" (athlete_levels)`);
  const level_id = Number(lvl[0]!.id);
  await D.sql`
    update athletes
       set level_id = ${level_id},
           level_source = 'coach',
           training_days_per_week = ${TRAINING_DAYS},
           updated_at = now()
     where id = ${ATHLETE_ID}
  `;
  log(`classified athlete ${ATHLETE_ID}: level ${LEVEL_NAME} (id ${level_id}), ${TRAINING_DAYS} days`);
  return { level_id };
}

/** Copy coach 4's 12 methodology_zones rows into coach 29 (idempotent). */
async function copyZoneModel(): Promise<void> {
  const res = await D.sql`
    insert into methodology_zones
      (coach_id, code, label, color, role, sort_order, anchor, pace_unit, low_offset_s, high_offset_s)
    select ${COACH_ID}, code, label, color, role, sort_order, anchor, pace_unit, low_offset_s, high_offset_s
    from methodology_zones
    where coach_id = ${SOURCE_ZONE_COACH_ID}
    on conflict (coach_id, pace_unit, code) do nothing
  `;
  const have = await D.sql<Array<{ n: string }>>`
    select count(*)::text as n from methodology_zones where coach_id = ${COACH_ID}
  `;
  log(`zone model coach ${COACH_ID}: ${have[0]!.n} rows (inserted ${res.count} this run)`);
}

/** Derive athlete 70's absolute zone profiles per modality via the real resolver. */
async function deriveZoneProfiles(): Promise<void> {
  for (const t of ZONE_TESTS) {
    const existing = await D.sql<Array<{ id: string }>>`
      select id::text from athlete_zone_profiles
      where athlete_id = ${ATHLETE_ID} and modality = ${t.modality} limit 1
    `;
    if (existing.length > 0) {
      log(`zone profile ${t.modality}: already present, skip`);
      continue;
    }
    const coachZones = await D.loadCoachZonesForUnit(D.sql, COACH_ID, t.pace_unit);
    if (coachZones.length !== 6) {
      throw new Error(`coach ${COACH_ID} has ${coachZones.length} zones for ${t.pace_unit} (need 6)`);
    }
    const resolved = D.resolveZonesForAthlete(
      { modality: t.modality, threshold_s: t.threshold_s, pace_unit: t.pace_unit },
      coachZones,
    );
    const ins = await D.insertZoneProfileVersion(
      {
        athlete_id: ATHLETE_ID,
        modality: t.modality,
        threshold_s: t.threshold_s,
        pace_unit: t.pace_unit,
        source_test_slug: null,
        source_benchmark_id: null,
        zones: resolved,
        source: 'coach_test',
        needs_review: false,
      },
      D.sql,
    );
    log(`zone profile ${t.modality}: v${ins.version} (threshold ${t.threshold_s}s/${t.pace_unit})`);
  }
}

/** Resolve the cloned block ids+titles for every key we wire into slots. */
async function resolveBlocks(): Promise<Record<BlockKey, { id: number; title: string }>> {
  const slugs = Object.values(BLOCK_SLUGS);
  const rows = await D.sql<Array<{ id: string; slug: string; title: string }>>`
    select id::text, slug, title from blocks
    where coach_id = ${COACH_ID} and slug = any(${slugs})
  `;
  const bySlug = new Map(rows.map((r) => [r.slug, { id: Number(r.id), title: r.title }]));
  const out = {} as Record<BlockKey, { id: number; title: string }>;
  for (const [key, slug] of Object.entries(BLOCK_SLUGS) as Array<[BlockKey, string]>) {
    const b = bySlug.get(slug);
    if (!b) throw new Error(`block not found in coach ${COACH_ID} library: ${slug} (clone the library first)`);
    out[key] = b;
  }
  return out;
}

/** slots_json for one week: one am workout/day, each referencing a typed block. */
function buildWeekSlots(weekIndex: number, plan: DaySpec[], blocks: Record<BlockKey, { id: number; title: string }>) {
  return {
    days: plan.map((d) => {
      const b = blocks[d.key];
      return {
        day_of_week: d.dow,
        sessions: [
          {
            kind: 'workout' as const,
            // `focus` becomes the materialized template name → the title the
            // athlete reads on the day card. Use Pablo's real block title.
            focus: b.title.slice(0, 120),
            blocks: [
              {
                uid: `w${weekIndex}-d${d.dow}-${b.id}`,
                format: d.format,
                title: b.title.slice(0, 120),
                source_block_id: b.id, // items hydrate from block_exercises at assign time
              },
            ],
          },
        ],
      };
    }),
  };
}

/** Find-or-create the demo month template and (re)populate its week slots. */
async function ensureMonthTemplate(
  level_id: number,
  blocks: Record<BlockKey, { id: number; title: string }>,
): Promise<{ monthId: number }> {
  const existing = await D.sql<Array<{ id: string }>>`
    select id::text from program_month_templates
    where coach_id = ${COACH_ID} and name = ${MONTH_NAME} limit 1
  `;

  let monthId: number;
  let weekIds: number[];

  if (existing.length > 0) {
    monthId = Number(existing[0]!.id);
    const wk = await D.sql<Array<{ week_template_id: string; position: number }>>`
      select week_template_id::text, position from program_month_weeks
      where month_template_id = ${monthId} order by position asc
    `;
    weekIds = wk.map((w) => Number(w.week_template_id));
    log(`month template reused (id ${monthId}, ${weekIds.length} weeks)`);
  } else {
    const created = await D.createMonthTemplateWithEmptyWeeks({
      coach_id: COACH_ID,
      payload: { name: MONTH_NAME, level_id, week_count: WEEK_COUNT },
    });
    monthId = Number(created.id);
    weekIds = [...created.weeks].sort((a, b) => a.week_index - b.week_index).map((w) => Number(w.id));
    log(`month template created (id ${monthId}, ${weekIds.length} weeks)`);
  }

  if (weekIds.length < WEEK_PLANS.length) {
    throw new Error(`month template has ${weekIds.length} weeks, need ${WEEK_PLANS.length}`);
  }

  for (let i = 0; i < WEEK_PLANS.length; i++) {
    await D.upsertWeekTemplate({
      coach_id: COACH_ID,
      id: weekIds[i],
      payload: {
        name: `Semana ${i + 1}`,
        focus: i === 0 ? 'Acumulación' : 'Acumulación · progresión',
        slots_json: buildWeekSlots(i, WEEK_PLANS[i]!, blocks),
      },
    });
    log(`week ${i + 1} slots set (${WEEK_PLANS[i]!.length} training days)`);
  }

  return { monthId };
}

/** Wipe athlete 70's materialized plan (idempotent rebuild — content is snapshotted
 *  at assign time, so a re-run must clear it to reflect the latest slots/titles).
 *  Scoped strictly to athlete 70; FK-ordered. The inline session templates the
 *  materializer created are 1:1 per assignment, so deleting them by athlete 70's
 *  assignment template_ids is safe. */
async function wipeAthletePlan(): Promise<void> {
  const tmpl = await D.sql<Array<{ template_id: string }>>`
    select distinct template_id::text from workout_assignments
    where athlete_id = ${ATHLETE_ID} and template_id is not null
  `;
  const templateIds = tmpl.map((r) => Number(r.template_id));

  await D.sql`delete from workout_executions where assignment_id in (
    select id from workout_assignments where athlete_id = ${ATHLETE_ID})`;
  await D.sql`delete from workout_assignments where athlete_id = ${ATHLETE_ID}`;
  if (templateIds.length > 0) {
    await D.sql`delete from template_segments where template_id = any(${templateIds}::bigint[])`;
    await D.sql`delete from templates where id = any(${templateIds}::bigint[])`;
  }
  await D.sql`delete from weekly_plans where athlete_id = ${ATHLETE_ID}`;
  await D.sql`delete from microcycles where athlete_id = ${ATHLETE_ID}`;
  await D.sql`delete from athlete_month_assignments where athlete_id = ${ATHLETE_ID}`;
  log(`wiped prior plan for athlete ${ATHLETE_ID} (${templateIds.length} inline templates)`);
}

/** Rebuild: wipe athlete 70's plan, materialize the month, publish all weeks. */
async function assignAndPublish(monthId: number, startDateIso: string): Promise<{ monthAssignmentId: number; weekStarts: string[] }> {
  await wipeAthletePlan();

  const res = await D.assignMonthToAthlete({
    coach_id: COACH_ID,
    athlete_id: ATHLETE_ID,
    month_template_id: monthId,
    start_date: startDateIso,
  });
  const monthAssignmentId = Number(res.month_assignment_id);
  log(`assigned: ${res.assignment_count} sessions, ${res.start_date}→${res.end_date} (id ${monthAssignmentId})`);

  const pub = await D.publishMicrociclo({
    coach_id: COACH_ID,
    athlete_id: ATHLETE_ID,
    month_assignment_id: monthAssignmentId,
  });
  log(`published weeks: ${pub.week_starts.join(', ')} (status ${pub.status}, notified ${pub.notified})`);
  return { monthAssignmentId, weekStarts: pub.week_starts };
}

// ── verification (read-only) ────────────────────────────────────────────────────

async function verify(): Promise<void> {
  const { startOfDayInBox, mondayOfWeek, isoDateString, addDays } = D.dates;
  const weekStart = mondayOfWeek(startOfDayInBox(new Date()));
  const weekStartIso = isoDateString(weekStart);
  const weekEndIso = isoDateString(addDays(weekStart, 6));

  log(`\n──────── VERIFY (current API week ${weekStartIso} → ${weekEndIso}) ────────`);

  // 1. The week the athlete plan endpoint will return (mirrors the route query).
  const days = await D.sql<Array<{ assignment_id: string; iso_date: string; title: string | null; modality: string | null }>>`
    select wa.id::text as assignment_id,
           to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso_date,
           t.name as title,
           (select e.modality from template_segments ts join exercises e on e.id = ts.exercise_id
              where ts.template_id = t.id order by ts.block_position nulls first, ts.position limit 1) as modality
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.athlete_id = ${ATHLETE_ID}
      and wa.scheduled_for >= ${weekStartIso}::date and wa.scheduled_for <= ${weekEndIso}::date
    order by wa.scheduled_for asc
  `;
  log(`athlete ${ATHLETE_ID} sessions this week: ${days.length}`);
  for (const d of days) log(`  ${d.iso_date}  ${d.modality ?? '?'}  ·  ${d.title ?? '(sin título)'}  [#${d.assignment_id}]`);

  // 2. weekly_plans publish gate for athlete 70 (both microciclo weeks).
  const wps = await D.sql<Array<{ week_start: string; status: string }>>`
    select to_char(week_start, 'YYYY-MM-DD') as week_start, status::text as status
    from weekly_plans where athlete_id = ${ATHLETE_ID} order by week_start asc
  `;
  log(`weekly_plans: ${wps.map((w) => `${w.week_start}=${w.status}`).join(', ') || '(none)'}`);

  // 3. Resolved absolute pace proof: pick a cardio session and load its detail.
  const cardio = days.find((d) => d.modality === 'run' || d.modality === 'row' || d.modality === 'ski' || d.modality === 'bike');
  if (cardio) {
    const detail = await D.loadAssignmentDetail({ sql: D.sql, athlete_id: ATHLETE_ID, assignment_id: Number(cardio.assignment_id) });
    const resolved = (detail?.workout?.blocks ?? []).flatMap((b) => b.items).filter((it) => it.resolved_intensity);
    log(`resolved paces in "${cardio.title}" (#${cardio.assignment_id}): ${resolved.length}`);
    for (const it of resolved) {
      const ri = it.resolved_intensity!;
      log(`  ${it.exercise_name}: ${ri.zone_label} · ${ri.range_label}`);
    }
  } else {
    log('no cardio session in the current week to resolve (week 1 cardio is Tue/Wed; ok if today is Sun)');
  }

  // 4. Honesty check: demo athlete 2 (71) must stay EMPTY.
  const other = await D.sql<Array<{ wa: string; wp: string }>>`
    select (select count(*) from workout_assignments where athlete_id = 71)::text as wa,
           (select count(*) from weekly_plans where athlete_id = 71)::text as wp
  `;
  log(`athlete 71 (demo 2): ${other[0]!.wa} assignments, ${other[0]!.wp} weekly_plans (expect 0/0)`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/?]+)/)?.[1] ?? '';
  if (!host.includes(REQUIRED_HOST)) {
    throw new Error(
      `Refusing to run: DATABASE_URL host is "${host || '(unknown)'}", not the DEMO DB (${REQUIRED_HOST}). ` +
        `Point DATABASE_URL at the demo branch.`,
    );
  }
  log(`target host: ${host}`);

  D = await loadDeps();

  const startDateIso = D.dates.isoDateString(D.dates.mondayOfWeek(D.dates.startOfDayInBox(new Date())));
  log(`microciclo start (this week's Monday): ${startDateIso}, ${WEEK_COUNT} weeks`);

  await assertOwnership();
  const { level_id } = await classifyAthlete();
  await copyZoneModel();
  await deriveZoneProfiles();
  const blocks = await resolveBlocks();
  const { monthId } = await ensureMonthTemplate(level_id, blocks);
  await assignAndPublish(monthId, startDateIso);
  await verify();

  await D.sql.end();
  log('done.');
}

main().catch(async (err) => {
  console.error('[seed_demo_athlete_plan] FAILED:', err); // eslint-disable-line no-console
  try {
    await D?.sql?.end();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
