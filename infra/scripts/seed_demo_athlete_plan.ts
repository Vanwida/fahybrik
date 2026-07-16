/**
 * seed_demo_athlete_plan.ts — give DEMO athlete 1 (athlete_id 70, coach 29) a
 * REAL, published 2-week microciclo whose every training DAY is a COMPOSED session
 * the way a real coach builds it:
 *
 *     Calentamiento  →  Bloque principal  →  Vuelta a la calma
 *
 * Each part is a distinct, role-TITLED, fully-TYPED block (archetype + items with
 * measure + target). The week varies the principal block so the typed
 * differentiation is visible end-to-end:
 *   Lun Fuerza (%RM → kg) · Mar Series de carrera (zona→ritmo) · Mié Metcon (EMOM) ·
 *   Jue Z2/Recuperación (zona→ritmo) · Vie Simulación HYROX (distancia + cargas).
 *
 * The Monday strength block is the BACK-SQUAT block (back-squat is the mapped lift,
 * back-squat → back_squat_1rm). athlete 70 has a seeded back_squat_1rm of 80 kg, so
 * its 65–80% band RESOLVES to an absolute "52–64 kg" via the real load resolver —
 * the %RM→kg chip is visible end-to-end. Front-squat is intentionally unmapped
 * (we never borrow another lift's 1RM), so a front-squat %RM can only show "% · —".
 *
 * Built entirely through the REAL coach machinery (no fabricated rows that skip
 * the pipeline):
 *   1. CLASSIFY athlete 70 → level N3 (Rendimiento) + 5 training days
 *      (UPDATE athletes — the same write the /level + /training-days routes do).
 *   2. ZONES — copy coach 29's offset model from Pablo (coach 4) methodology_zones,
 *      then derive athlete 70's absolute zone profiles for run/row/ski/bike via the
 *      SAME path POST /test-result uses. These let @Zn prescriptions resolve to
 *      ABSOLUTE paces in the plan.
 *   3. LIBRARY — the demo coach's library lacks warmup/cooldown blocks, and Pablo's
 *      HYROX/race_sim blocks are untyped (0 structured exercises → would hydrate
 *      nothing). So we create, in coach 29's library, the typed blocks it lacks:
 *      "Calentamiento general", "Calentamiento de carrera", "Vuelta a la calma" and
 *      "Simulación HYROX (Open)" (the canonical 16-leg race template). Created via
 *      the real createBlock / updateBlockFull (validated BlockWrite), idempotent by
 *      title. The principal blocks reuse Pablo's already-typed library blocks; the
 *      back-squat principal additionally gets a %1RM band on its mapped lift (via the
 *      same validated BlockWrite + updateBlockFull) so the %RM→kg chip resolves.
 *   4. MICROCICLO — a coach-29 program_month_templates (2 weeks) whose week slots
 *      compose each day as warmup + principal + cooldown, every block referencing a
 *      library block by source_block_id (items hydrate from block_exercises at
 *      assign time). Built via createMonthTemplate + upsertWeekTemplate.
 *   5. ASSIGN + PUBLISH — assignMonthToAthlete (materializes microcycles +
 *      workout_assignments + snapshotted templates/segments, one segment-block per
 *      composed block) then publishMicrociclo (every week → weekly_plans.status
 *      ='published'). The real production path.
 *
 * 2 weeks starting THIS week's Monday so the plan covers BOTH the current week
 * (audit today) AND next week (TestFlight demo tomorrow), regardless of run day.
 *
 * Demo athlete 2 (athlete_id 71, coach 30) is left UNTOUCHED — an honest
 * blank-slate athlete alongside a populated one.
 *
 * IDEMPOTENT: classify = UPDATE; zone copy = ON CONFLICT DO NOTHING; zone
 * profiles = skip if a current row exists; library blocks = find-by-title →
 * updateBlockFull (same id) else createBlock; month template = find-or-create by a
 * stable name marker (weeks re-upserted); assignment = wiped + rebuilt; publish =
 * idempotent upsert. Re-running converges, never duplicates.
 *
 * TARGET + GUARD (shared _demo_target): coach + athlete resolved by MARKER EMAIL
 * (demo athlete 70/coach 29 on the demo branch; athlete 67/coach 62 on main), never
 * hardcoded ids. Demo branch always writable; MAIN only with SEED_DEMO_ALLOW_MAIN=1.
 * Touches ONLY the resolved demo athlete + coach (+ coach-4 read for zones).
 * PRE-REQ on a blank-slate coach (e.g. main coach 62): clone the methodology library
 * first (clone_block_library --source=global --target=<coachId>) so the 6 principal
 * blocks exist as `--c<coachId>` slugs.
 *
 * RUN (against MAIN):
 *   cd web && SEED_DEMO_ALLOW_MAIN=1 DATABASE_URL="<main>" \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/seed_demo_athlete_plan.ts
 */
import './_load_web_env.ts';

import type { Sql } from '@/lib/db';
import type { Measure, Prescription } from '@fahybrid/shared/domain/prescription';
import type { BlockWrite, BlockExerciseWrite } from '@fahybrid/shared/schema/blocks';
import { blockWriteSchema } from '@fahybrid/shared/schema/blocks';
import { EXERCISE_TO_1RM_BENCHMARK } from '@fahybrid/shared/domain/strength';
import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import { assertDemoWriteHost, resolveDemoTarget } from './_demo_target.ts';

// ── CONFIG ───────────────────────────────────────────────────────────────────

// Resolved at runtime from the demo MARKER EMAILS (see _demo_target) — ids differ
// per branch (demo athlete 70/coach 29; main athlete 67/coach 62), so we never
// hardcode them. Populated in main() before any step runs.
let ATHLETE_ID: number; // demo athlete 1 (gets the plan)
let COACH_ID: number; //   demo coach 1 (owns the athlete + the cloned library)
const SOURCE_ZONE_COACH_ID = 4; // Pablo — source of the methodology_zones offset model
const LEVEL_NAME = 'N3'; // Rendimiento
const TRAINING_DAYS = 5;
const WEEK_COUNT = 2; // covers current week (audit) + next week (TestFlight demo)
// Athlete-facing periodization PHASE name. This is the value surfaced to the
// athlete on iOS Inicio/Plan as the week's microciclo label (week.microcicloName
// ← resolveMicrocicloName ← program_month_templates.name). It MUST read like a
// real phase the athlete understands — never internal jargon ("microciclo",
// "Demo", "Atleta N"). "Acumulación" is agnostic coach DATA (a real ATR-style
// phase name), not a hardcoded system concept. Doubles as the stable idempotency
// marker: coach 29 owns exactly this one month template in the demo.
const MONTH_NAME = 'Acumulación';

/** %1RM band applied to the MAPPED strength lift of the STRENGTH_RM principal block
 *  (mirrors Pablo's front-squat block encoding). With athlete 70's back_squat_1rm
 *  of 80 kg this resolves to "65–80% → 52–64 kg" via the real load resolver. */
const STRENGTH_RM_PCT = { min: 65, max: 80 } as const;

// Methodology group ids (0030 methodology_groups). Warmups/cooldown live in the
// movilidad/preventivos group; the HYROX sim in the race-simulation group.
const GROUP_CORE_MOBILITY = 8; // Core, Movilidad y Preventivos
const GROUP_RACE_SIM = 7; //     Simulaciones de Carrera (HYROX / DEKA)

/** Athlete 70's test thresholds (Z4 lower bound) per modality → feed the resolver.
 *  Realistic N3 (Rendimiento) hybrid values. Unit is intrinsic to the modality:
 *  run → per_km, ergos → per_500m (mirrors paceUnitForModality in /test-result). */
const ZONE_TESTS: Array<{ modality: 'run' | 'row' | 'ski' | 'bike'; threshold_s: number; pace_unit: 'per_km' | 'per_500m' }> = [
  { modality: 'run', threshold_s: 255, pace_unit: 'per_km' }, //  4:15/km
  { modality: 'row', threshold_s: 112, pace_unit: 'per_500m' }, // 1:52/500m
  { modality: 'ski', threshold_s: 132, pace_unit: 'per_500m' }, // 2:12/500m
  { modality: 'bike', threshold_s: 78, pace_unit: 'per_500m' }, // 1:18/500m
];

// ── Catalog exercise ids (verified live in `exercises`, demo branch) ──────────
const EX = {
  bikeErg: 3482, // BikeErg (bike)
  run: 3479, //     Run (run)
  legSwings: 3522, // Leg Swings (mobility)
  thoracic: 3521, // Thoracic Rotation (mobility)
  airSquat: 3509, // Air Squat (functional, bodyweight)
  runDrills: 3572, // Run Technique Drills (run)
  foamRoll: 2809, // Foam roll lower body (mobility)
  breathing: 3576, // Breathing Work (mobility)
} as const;

// ── Prescription builders (typed, no free text) ──────────────────────────────
const reps = (value: number): Measure => ({ kind: 'reps', value });
const dur = (seconds: number): Measure => ({ kind: 'duration', seconds });
const dist = (meters: number): Measure => ({ kind: 'distance', meters });

/** One typed block_exercise line for a support block (block_position 0). */
function line(exercise_id: number, blockTitle: string, blockFormat: TemplateFormat, prescription: Prescription): BlockExerciseWrite {
  return {
    exercise_id,
    block_position: 0,
    block_format: blockFormat,
    block_title: blockTitle,
    prescription_json: prescription,
  };
}

// ── Support library blocks the demo coach lacks (typed) ───────────────────────
// Created in coach 29's library so the day editor can compose them by reference,
// exactly like Pablo's principal blocks. Roles match the app's STRUCTURE_GROUP
// vocabulary (Calentamiento / Vuelta a la calma).
type SupportKey = 'WU_GENERAL' | 'WU_RUN' | 'COOLDOWN' | 'HYROX_SIM';

const WU = 'Calentamiento';
const CD = 'Vuelta a la calma';

/** Build the 4 support-block specs. `hyroxExercises` is the canonical 16-leg HYROX
 *  template, mapped to block_exercises by the caller (where deps are loaded). */
function buildSupportSpecs(hyroxExercises: BlockExerciseWrite[]): Record<SupportKey, BlockWrite> {
  return {
    WU_GENERAL: {
      title: 'Calentamiento general',
      description:
        'Calentamiento general: activación cardiovascular suave + movilidad + sentadillas al aire antes del bloque de fuerza o metcon.',
      methodology_group_id: GROUP_CORE_MOBILITY,
      format: 'circuit',
      exercises: [
        line(EX.bikeErg, WU, 'circuit', { scheme: 'steady', modality: 'bike', total_s: 300, target: { kind: 'rpe', value: 3 } }),
        line(EX.legSwings, WU, 'circuit', { scheme: 'sets', modality: 'mobility', sets: [{ measure: reps(10) }, { measure: reps(10) }] }),
        line(EX.thoracic, WU, 'circuit', { scheme: 'sets', modality: 'mobility', sets: [{ measure: reps(10) }, { measure: reps(10) }] }),
        line(EX.airSquat, WU, 'circuit', {
          scheme: 'sets',
          modality: 'functional',
          sets: [
            { measure: reps(15), target: { kind: 'bodyweight' } },
            { measure: reps(15), target: { kind: 'bodyweight' } },
          ],
        }),
      ],
    },
    WU_RUN: {
      title: 'Calentamiento de carrera',
      description:
        'Calentamiento de carrera: trote suave + técnica de carrera + movilidad + progresiones (strides) antes de las series o el rodaje.',
      methodology_group_id: GROUP_CORE_MOBILITY,
      format: 'tempo',
      exercises: [
        line(EX.run, WU, 'tempo', { scheme: 'steady', modality: 'run', total_s: 480, target: { kind: 'rpe', value: 3 } }),
        line(EX.runDrills, WU, 'tempo', { scheme: 'sets', modality: 'run', sets: [{ measure: dur(40) }, { measure: dur(40) }, { measure: dur(40) }] }),
        line(EX.legSwings, WU, 'tempo', { scheme: 'sets', modality: 'mobility', sets: [{ measure: reps(10) }, { measure: reps(10) }] }),
        line(EX.run, WU, 'tempo', {
          scheme: 'intervals',
          modality: 'run',
          rounds: 4,
          rest_s: 60,
          sets: [{ measure: dist(80), target: { kind: 'rpe', value: 7 } }],
        }),
      ],
    },
    COOLDOWN: {
      title: 'Vuelta a la calma',
      description: 'Vuelta a la calma: cardio muy suave + foam roll + respiración para bajar pulsaciones y favorecer la recuperación.',
      methodology_group_id: GROUP_CORE_MOBILITY,
      format: 'tempo',
      exercises: [
        line(EX.bikeErg, CD, 'tempo', { scheme: 'steady', modality: 'bike', total_s: 300, target: { kind: 'rpe', value: 2 } }),
        line(EX.foamRoll, CD, 'tempo', { scheme: 'steady', modality: 'mobility', total_s: 300 }),
        line(EX.breathing, CD, 'tempo', { scheme: 'steady', modality: 'mobility', total_s: 180 }),
      ],
    },
    HYROX_SIM: {
      title: 'Simulación HYROX (Open)',
      description: 'Simulación HYROX completa (cargas Open): 8 × 1 km de carrera intercalados con las 8 estaciones en orden oficial.',
      methodology_group_id: GROUP_RACE_SIM,
      format: 'hyrox_sim',
      exercises: hyroxExercises,
    },
  };
}

/** Pablo's typed PRINCIPAL blocks, cloned into the demo coach's library. The clone
 *  (clone_block_library) derives per-coach slugs as `${base}--c${coachId}`, so we
 *  keep the BASE slugs here and append the suffix for the resolved COACH_ID at
 *  lookup time (demo coach 29 → `--c29`, main coach 62 → `--c62`). */
const MAIN_BASE_SLUGS = {
  // %RM back squat — the MAPPED lift (back-squat → back_squat_1rm). The athlete has
  // a seeded back_squat_1rm, so its %RM band resolves to an ABSOLUTE kg load in the
  // brief ("65–80% → 52–64 kg"). Front-squat is intentionally unmapped (we don't
  // borrow another lift's 1RM), so the front-squat block's %RM can only show "% · —".
  STRENGTH_RM: 'g1-5-back-squat-4r-10-8-8-6', //                   %RM back squat → resolves kg
  RUN_FARTLEK: 'g4-38-fartlek-10-wu-5x5-z4-1-z5', //               run @Zn → resolves pace
  ERG_Z2: 'g5-52-10-row-z2', //                                    erg @Zn → resolves pace
  WOD_EMOM: 'g9-87-emom-15-20-bw-lunges', //                       typed WOD (EMOM)
  STRENGTH_KG: 'g9-90-4r-20-reverse-lunge-30kg', //                strength kg circuit
  RUN_THRESHOLD: 'g4-33-threshold-3-bloques-3x5-a-15-5km-h', //    run threshold intervals
} as const;
type MainKey = keyof typeof MAIN_BASE_SLUGS;

// A composed DAY: warmup variant + principal block (role title + slot format) +
// cooldown. cooldown is always "Vuelta a la calma" (tempo). Each warmup is titled
// "Calentamiento"; the variant only changes which library block hydrates.
type Principal = { key: MainKey | 'HYROX_SIM'; format: TemplateFormat; title: string };
type DaySpec = { dow: number; focus: string; warmup: 'WU_GENERAL' | 'WU_RUN'; principal: Principal };

// 5 training days/week, 2 rest days (omitted → API renders rest). Week 1 shows the
// full type spread; week 2 swaps the strength + run principals (real microciclo).
const WEEK_PLANS: DaySpec[][] = [
  [
    { dow: 1, focus: 'Fuerza de pierna', warmup: 'WU_GENERAL', principal: { key: 'STRENGTH_RM', format: 'strength_block', title: 'Fuerza' } },
    { dow: 2, focus: 'Series de carrera', warmup: 'WU_RUN', principal: { key: 'RUN_FARTLEK', format: 'intervals', title: 'Series de carrera' } },
    { dow: 3, focus: 'Metcon', warmup: 'WU_GENERAL', principal: { key: 'WOD_EMOM', format: 'emom', title: 'Metcon' } },
    { dow: 4, focus: 'Rodaje Z2', warmup: 'WU_RUN', principal: { key: 'ERG_Z2', format: 'tempo', title: 'Recuperación Z2' } },
    { dow: 5, focus: 'Simulación HYROX', warmup: 'WU_GENERAL', principal: { key: 'HYROX_SIM', format: 'hyrox_sim', title: 'Simulación HYROX' } },
  ],
  [
    { dow: 1, focus: 'Fuerza · circuito de pierna', warmup: 'WU_GENERAL', principal: { key: 'STRENGTH_KG', format: 'circuit', title: 'Fuerza' } },
    { dow: 2, focus: 'Series umbral', warmup: 'WU_RUN', principal: { key: 'RUN_THRESHOLD', format: 'intervals', title: 'Series de carrera' } },
    { dow: 3, focus: 'Metcon', warmup: 'WU_GENERAL', principal: { key: 'WOD_EMOM', format: 'emom', title: 'Metcon' } },
    { dow: 4, focus: 'Rodaje Z2', warmup: 'WU_RUN', principal: { key: 'ERG_Z2', format: 'tempo', title: 'Recuperación Z2' } },
    { dow: 5, focus: 'Simulación HYROX', warmup: 'WU_GENERAL', principal: { key: 'HYROX_SIM', format: 'hyrox_sim', title: 'Simulación HYROX' } },
  ],
];

const WARMUP_FORMAT: Record<'WU_GENERAL' | 'WU_RUN', TemplateFormat> = { WU_GENERAL: 'circuit', WU_RUN: 'tempo' };
const COOLDOWN_FORMAT: TemplateFormat = 'tempo';

// Athlete-facing "Foco de la semana" per week-of-month (program_week_templates.focus,
// surfaced as week.focus on iOS). Descriptive coach voice, athlete-readable, and
// deliberately NON-redundant with the phase NAME (MONTH_NAME = "Acumulación") so the
// athlete never reads the same word twice. Index = week position; the last entry
// covers any extra week beyond the list.
const WEEK_FOCUS = [
  'Subir volumen aeróbico y técnica de estaciones',
  'Más volumen y ritmo en las estaciones',
] as const;

// ── deps (dynamic import — server-only `@/` libs form cycles tsx's static linker
//    rejects; deferring to runtime under --conditions=react-server avoids it) ────
type Deps = {
  sql: Sql;
  createBlock: typeof import('@/lib/dashboard/coach/blocks')['createBlock'];
  updateBlockFull: typeof import('@/lib/dashboard/coach/blocks')['updateBlockFull'];
  getBlockById: typeof import('@/lib/dashboard/coach/blocks')['getBlockById'];
  buildHyroxItems: typeof import('@/lib/dashboard/v2/hyrox-template')['buildHyroxItems'];
  safeParsePrescription: typeof import('@fahybrid/shared/domain/prescription')['safeParsePrescription'];
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
  const [db, blocks, hyrox, presc, months, weeks, assign, publish, zones, methodology, detail, dates] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/dashboard/coach/blocks'),
    import('@/lib/dashboard/v2/hyrox-template'),
    import('@fahybrid/shared/domain/prescription'),
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
    createBlock: blocks.createBlock,
    updateBlockFull: blocks.updateBlockFull,
    getBlockById: blocks.getBlockById,
    buildHyroxItems: hyrox.buildHyroxItems,
    safeParsePrescription: presc.safeParsePrescription,
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

/** Classify the athlete: level N3 + 5 training days (same writes as the routes). */
async function classifyAthlete(): Promise<{ level_id: number }> {
  const lvl = await D.sql<Array<{ id: string }>>`
    select id::text from athlete_levels where coach_id = ${COACH_ID} and name = ${LEVEL_NAME} limit 1
  `;
  if (lvl.length === 0) throw new Error(`coach ${COACH_ID} has no level "${LEVEL_NAME}" (athlete_levels)`);
  const level_id = Number(lvl[0]!.id);
  // Classify AND mark onboarded (coalesce → idempotent) so the athlete lands on
  // the plan, not the onboarding flow — same as the /level + /training-days routes
  // followed by a completed onboarding.
  await D.sql`
    update athletes
       set level_id = ${level_id},
           level_source = 'coach',
           training_days_per_week = ${TRAINING_DAYS},
           onboarded_at = coalesce(onboarded_at, now()),
           updated_at = now()
     where id = ${ATHLETE_ID}
  `;
  log(`classified athlete ${ATHLETE_ID}: level ${LEVEL_NAME} (id ${level_id}), ${TRAINING_DAYS} days, onboarded`);
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

/** Validate every support-block prescription parses (so materialization keeps the
 *  structured dose) BEFORE we persist. Build-right auto-QA: fail loud, not silent. */
function assertValidPrescriptions(specs: Record<SupportKey, BlockWrite>): void {
  for (const [key, spec] of Object.entries(specs) as Array<[SupportKey, BlockWrite]>) {
    spec.exercises.forEach((ex, i) => {
      const parsed = D.safeParsePrescription(ex.prescription_json);
      if (!parsed.success) {
        throw new Error(`invalid prescription in support block ${key}[${i}] (exercise ${ex.exercise_id}): ${parsed.error?.message ?? 'parse failed'}`);
      }
    });
  }
}

/** Create-or-replace the typed support blocks in coach 29's library (idempotent by
 *  title). Returns the library block id per support key. */
async function seedSupportBlocks(): Promise<Record<SupportKey, number>> {
  // Map the canonical HYROX template (8 runs + 8 stations, race order) → typed
  // block_exercises. Every leg carries a real exercise_id; runs/ergs have no
  // default target, the load stations carry the Open kg standard (editable).
  const hyroxExercises: BlockExerciseWrite[] = D.buildHyroxItems('open')
    .filter((it) => it.exercise_id != null)
    .map((it) => line(Number(it.exercise_id), 'Simulación HYROX', 'hyrox_sim', it.prescription));

  const specs = buildSupportSpecs(hyroxExercises);
  assertValidPrescriptions(specs);

  const out = {} as Record<SupportKey, number>;
  for (const [key, spec] of Object.entries(specs) as Array<[SupportKey, BlockWrite]>) {
    const existing = await D.sql<Array<{ id: string }>>`
      select id::text from blocks where coach_id = ${COACH_ID} and title = ${spec.title} limit 1
    `;
    if (existing.length > 0) {
      const id = Number(existing[0]!.id);
      await D.updateBlockFull(COACH_ID, id, spec, D.sql);
      out[key] = id;
      log(`support block "${spec.title}" updated (id ${id}, ${spec.exercises.length} items)`);
    } else {
      const id = await D.createBlock(COACH_ID, spec, D.sql);
      out[key] = id;
      log(`support block "${spec.title}" created (id ${id}, ${spec.exercises.length} items)`);
    }
  }
  return out;
}

/** Resolve Pablo's cloned PRINCIPAL block ids by slug (in the demo coach's library).
 *  Slugs are suffixed with the resolved COACH_ID (`--c62` on main). */
async function resolveMainBlocks(): Promise<Record<MainKey, number>> {
  const suffix = `--c${COACH_ID}`;
  const wanted = Object.fromEntries(
    (Object.entries(MAIN_BASE_SLUGS) as Array<[MainKey, string]>).map(([k, base]) => [k, `${base}${suffix}`]),
  ) as Record<MainKey, string>;
  const slugs = Object.values(wanted);
  const rows = await D.sql<Array<{ id: string; slug: string }>>`
    select id::text, slug from blocks where coach_id = ${COACH_ID} and slug = any(${slugs})
  `;
  const bySlug = new Map(rows.map((r) => [r.slug, Number(r.id)]));
  const out = {} as Record<MainKey, number>;
  for (const [key, slug] of Object.entries(wanted) as Array<[MainKey, string]>) {
    const id = bySlug.get(slug);
    if (id == null) throw new Error(`principal block not found in coach ${COACH_ID} library: ${slug} (clone the library first)`);
    out[key] = id;
  }
  return out;
}

/** Give the STRENGTH_RM principal block a %1RM band on its MAPPED strength lift, so
 *  the %RM→kg chip resolves to an absolute load (the whole point of the demo). The
 *  block is rebuilt through the REAL validated BlockWrite + updateBlockFull (same
 *  path the coach editor uses) — Pablo's content (exercises, rep schemes, order) is
 *  preserved; we only ADD the intensity target. Only lifts in EXERCISE_TO_1RM_BENCHMARK
 *  (tracked, resolvable) get the band — unmapped accessories (e.g. front-squat) stay
 *  reps-only, honestly. Idempotent: re-applies the same band; runs BEFORE assignment
 *  (which snapshots block_exercises into template_segments). */
async function ensureStrengthRmTarget(blockId: number): Promise<void> {
  const block = await D.getBlockById(COACH_ID, blockId);
  if (!block) throw new Error(`STRENGTH_RM block ${blockId} not found in coach ${COACH_ID} library`);

  const rows = await D.sql<
    Array<{
      block_position: number;
      block_format: string | null;
      block_title: string | null;
      exercise_id: string;
      exercise_slug: string;
      prescription_json: unknown;
      notes: string | null;
    }>
  >`
    select be.block_position, be.block_format, be.block_title,
           be.exercise_id::text as exercise_id, e.slug as exercise_slug,
           be.prescription_json, be.notes
    from block_exercises be
    join exercises e on e.id = be.exercise_id
    where be.block_id = ${blockId}
    order by be.position
  `;
  if (rows.length === 0) throw new Error(`STRENGTH_RM block ${blockId} has no exercises to type`);

  let injected = 0;
  const exercises: BlockExerciseWrite[] = rows.map((r) => {
    const parsed = D.safeParsePrescription(r.prescription_json);
    if (!parsed.success) {
      throw new Error(`STRENGTH_RM block ${blockId} exercise ${r.exercise_id} has an invalid prescription`);
    }
    let prescription = parsed.data as Prescription;
    // Only the MAPPED, resolvable lift (back-squat → back_squat_1rm) carries the
    // %RM band; unmapped variants (front-squat) are left reps-only — we never
    // fabricate an intensity the resolver can't honestly turn into kg.
    if (EXERCISE_TO_1RM_BENCHMARK[r.exercise_slug] && Array.isArray(prescription.sets) && prescription.sets.length > 0) {
      prescription = {
        ...prescription,
        sets: prescription.sets.map((s) => ({
          ...s,
          target: { kind: 'percent_rm', min: STRENGTH_RM_PCT.min, max: STRENGTH_RM_PCT.max },
        })),
      };
      injected++;
    }
    return {
      exercise_id: Number(r.exercise_id),
      block_position: r.block_position,
      block_format: r.block_format,
      block_title: r.block_title,
      prescription_json: prescription,
      notes: r.notes,
    };
  });

  if (injected === 0) {
    throw new Error(
      `STRENGTH_RM block ${blockId} has no mapped strength lift (EXERCISE_TO_1RM_BENCHMARK) — cannot demo the %RM→kg resolution`,
    );
  }

  const write = blockWriteSchema.parse({
    title: block.title,
    description: block.description,
    methodology_group_id: block.methodology_group_id,
    format: block.format,
    exercises,
  } satisfies BlockWrite); // build-right auto-QA: fail loud before persisting

  await D.updateBlockFull(COACH_ID, blockId, write, D.sql);
  log(
    `STRENGTH_RM block ${blockId} "${block.title}": %RM band ${STRENGTH_RM_PCT.min}–${STRENGTH_RM_PCT.max}% on ${injected} mapped lift(s)`,
  );
}

/** slots_json for one week: per training day, ONE workout session composed of three
 *  role-titled blocks — Calentamiento → principal → Vuelta a la calma — each
 *  referencing a library block by source_block_id (items hydrate at assign time). */
function buildWeekSlots(weekIndex: number, plan: DaySpec[], main: Record<MainKey, number>, support: Record<SupportKey, number>) {
  return {
    days: plan.map((d) => {
      const principalId = d.principal.key === 'HYROX_SIM' ? support.HYROX_SIM : main[d.principal.key];
      return {
        day_of_week: d.dow,
        sessions: [
          {
            kind: 'workout' as const,
            focus: d.focus.slice(0, 120),
            blocks: [
              {
                uid: `w${weekIndex}-d${d.dow}-wu`,
                format: WARMUP_FORMAT[d.warmup],
                title: 'Calentamiento',
                source_block_id: support[d.warmup],
              },
              {
                uid: `w${weekIndex}-d${d.dow}-main`,
                format: d.principal.format,
                title: d.principal.title.slice(0, 120),
                source_block_id: principalId,
              },
              {
                uid: `w${weekIndex}-d${d.dow}-cd`,
                format: COOLDOWN_FORMAT,
                title: 'Vuelta a la calma',
                source_block_id: support.COOLDOWN,
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
  main: Record<MainKey, number>,
  support: Record<SupportKey, number>,
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
        focus: WEEK_FOCUS[i] ?? WEEK_FOCUS[WEEK_FOCUS.length - 1]!,
        slots_json: buildWeekSlots(i, WEEK_PLANS[i]!, main, support),
      },
    });
    log(`week ${i + 1} slots set (${WEEK_PLANS[i]!.length} composed days × 3 bloques)`);
  }

  return { monthId };
}

/** Wipe athlete 70's materialized plan (idempotent rebuild — content is snapshotted
 *  at assign time, so a re-run must clear it to reflect the latest slots/titles).
 *  Scoped strictly to athlete 70; FK-ordered. The inline session templates the
 *  materializer created are 1:1 per assignment, so deleting them by athlete 70's
 *  assignment template_ids is safe. Library blocks are NOT touched (reusable). */
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

  // 1. Sessions the athlete plan endpoint will return this week.
  const days = await D.sql<Array<{ assignment_id: string; iso_date: string; title: string | null }>>`
    select wa.id::text as assignment_id,
           to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso_date,
           t.name as title
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.athlete_id = ${ATHLETE_ID}
      and wa.scheduled_for >= ${weekStartIso}::date and wa.scheduled_for <= ${weekEndIso}::date
    order by wa.scheduled_for asc
  `;
  log(`athlete ${ATHLETE_ID} sessions this week: ${days.length}`);

  // 2. Per-session 3-part structure + typed/resolved proof, via the REAL detail loader.
  for (const d of days) {
    const detail = await D.loadAssignmentDetail({ sql: D.sql, athlete_id: BigInt(ATHLETE_ID), assignment_id: BigInt(d.assignment_id) });
    const blocks = detail?.workout?.blocks ?? [];
    const roles = blocks.map((b) => `${b.title ?? '?'}[${b.format ?? '?'}·${b.items.length}]`).join(' → ');
    log(`  ${d.iso_date}  «${d.title ?? '(sin título)'}»  ${blocks.length} bloques: ${roles}`);
    // Sample one typed line per block so we can eyeball measure+target survived.
    for (const b of blocks) {
      const it = b.items[0];
      if (!it) continue;
      const presc = it.prescription_json ? JSON.stringify((it.prescription_json as { sets?: unknown[]; scheme?: string }).scheme) : 'null';
      const ri = it.resolved_intensity ? ` → ${it.resolved_intensity.zone_label} ${it.resolved_intensity.range_label}` : '';
      log(`       ${b.title}: ${it.exercise_name} scheme=${presc}${ri}`);
      // %RM→kg proof: surface any item whose %RM target resolved to an absolute kg
      // load (the demo's whole point — "65–80% → 52–64 kg" from the athlete's 1RM).
      for (const item of b.items) {
        const rl = item.resolved_load;
        if (rl) log(`         ↳ %RM→kg  ${item.exercise_name}: ${rl.pct_label} → ${rl.kg_label} (1RM ${rl.one_rm_kg} kg)`);
      }
    }
  }

  // 3. weekly_plans publish gate for athlete 70 (both microciclo weeks).
  const wps = await D.sql<Array<{ week_start: string; status: string }>>`
    select to_char(week_start, 'YYYY-MM-DD') as week_start, status::text as status
    from weekly_plans where athlete_id = ${ATHLETE_ID} order by week_start asc
  `;
  log(`weekly_plans: ${wps.map((w) => `${w.week_start}=${w.status}`).join(', ') || '(none)'}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const host = assertDemoWriteHost('seed_demo_athlete_plan');
  log(`target host: ${host}`);

  D = await loadDeps();

  // Resolve the demo coach + athlete by marker email (hard-asserts demo-only).
  const target = await resolveDemoTarget(D.sql);
  ATHLETE_ID = target.athleteId;
  COACH_ID = target.coachId;
  log(`resolved demo target: athlete ${ATHLETE_ID} <${target.athleteEmail}>, coach ${COACH_ID} <${target.coachEmail}>`);

  const startDateIso = D.dates.isoDateString(D.dates.mondayOfWeek(D.dates.startOfDayInBox(new Date())));
  log(`microciclo start (this week's Monday): ${startDateIso}, ${WEEK_COUNT} weeks`);

  const { level_id } = await classifyAthlete();
  await copyZoneModel();
  await deriveZoneProfiles();
  const support = await seedSupportBlocks();
  const main = await resolveMainBlocks();
  await ensureStrengthRmTarget(main.STRENGTH_RM); // %RM band on the mapped lift → resolves to kg
  const { monthId } = await ensureMonthTemplate(level_id, main, support);
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
