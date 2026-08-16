/**
 * seed_review_account.ts — an App Store REVIEW account: a self-contained coach +
 * one onboarded athlete with a REAL, published current-week microciclo the Apple
 * reviewer can navigate. Paired with the env-gated review login (REVIEW_ACCESS_EMAIL
 * / REVIEW_ACCESS_CODE, see web/app/api/auth/email/verify/route.ts): the reviewer
 * signs in with the fixed email+code and lands on this athlete's published plan.
 *
 * WHAT IT BUILDS (all through the REAL services — no fabricated rows that skip the
 * pipeline), idempotent + re-runnable:
 *   1. Coach "FAHYBRID Review" (review-coach@fahybrid.com) — a DEDICATED account,
 *      never a real coach → D.findOrCreateCoachByEmail (idempotent).
 *   2. Canonical levels N1–N5 for that coach (config a new coach lacks; the classify
 *      scale + the month template's level_id must reference one of them).
 *   3. Athlete "Review FAHYBRID" (review@fahybrid.com) under that coach, ONBOARDED
 *      (level N2 + 3 training days + onboarded_at) → D.createCompAthlete (comp =
 *      full access, no billing) + an UPDATE that classifies & marks onboarded.
 *   4. A small TYPED library in the review coach: warmups, three principals
 *      (functional circuit / run intervals / Z2 ergos) and a cooldown — every dose
 *      is RPE / duration / reps / distance (NO @zone targets → no athlete-specific
 *      zone derivation needed; the plan renders concrete numbers out of the box).
 *   5. A 1-week month template composing 3 training days (Mon/Wed/Fri), each
 *      Calentamiento → principal → Vuelta a la calma, referencing library blocks by
 *      source_block_id (items hydrate at assign time) → createMonthTemplateWithEmptyWeeks
 *      + upsertWeekTemplate.
 *   6. ASSIGN + PUBLISH the current week → assignMonthToAthlete + publishMicrociclo
 *      (weekly_plans.status='published'). The real production path.
 *
 * HONESTY: NOTHING fabricated beyond the prescribed plan + editable defaults — zero
 * executions, results or activity. The reviewer's Analíticas are honestly empty.
 *
 * SCOPE / SAFETY: touches ONLY the two review accounts (by email). It NEVER wipes or
 * edits another coach or athlete, so the blast radius is contained even if pointed
 * at the wrong DB. Supports --dry-run (reports, writes nothing).
 *
 * RUN (against PROD — export the prod DATABASE_URL; _load_web_env never overwrites an
 * already-set var, so the exported one wins):
 *   cd web && DATABASE_URL="<prod>" NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/seed_review_account.ts [--dry-run]
 */
import './_load_web_env.ts';

import type { Sql } from '@/lib/db';
import type { Measure, Prescription } from '@fahybrid/shared/domain/prescription';
import type { BlockWrite, BlockExerciseWrite } from '@fahybrid/shared/schema/blocks';
import { blockWriteSchema } from '@fahybrid/shared/schema/blocks';
import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';

// ── CONFIG ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

const COACH_EMAIL = 'review-coach@fahybrid.com';
const COACH_NAME = 'FAHYBRID Review';
const ATHLETE_EMAIL = 'review@fahybrid.com';
const ATHLETE_NAME = 'Review FAHYBRID';
const ATHLETE_MODALITY = 'individual' as const;

const LEVEL_NAME = 'N2'; // Desarrollo — a sensible mid-low review level
const TRAINING_DAYS = 3;
const WEEK_COUNT = 1; // just the current week
/** Athlete-facing periodization phase name (agnostic, athlete-readable). */
const MONTH_NAME = 'Adaptación';
const WEEK_FOCUS = 'Semana de adaptación: volumen suave y técnica';

/** Real coach/athlete emails this script must NEVER be pointed at (sanity guard). */
const PROTECTED_EMAILS = new Set(
  (process.env.PROTECTED_COACH_EMAILS ?? 'coach@example.com,coach2@example.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/** Canonical N1–N5 (mirrors migration 0057 / seed_demo_coaches). */
const CANONICAL_LEVELS: Array<{ name: string; label: string; description: string; sort_order: number }> = [
  { name: 'N1', label: 'Iniciación', description: 'Primera experiencia estructurada. Sin carreras o >90min.', sort_order: 1 },
  { name: 'N2', label: 'Desarrollo', description: 'Base aeróbica, 0-1 carreras. 75-90min.', sort_order: 2 },
  { name: 'N3', label: 'Rendimiento', description: '1-3 carreras, entiende zonas. 65-75min.', sort_order: 3 },
  { name: 'N4', label: 'Competición', description: 'Open competitivo, múltiples carreras. 55-65min.', sort_order: 4 },
  { name: 'N5', label: 'Elite', description: 'Pro o sub-elite. <55min (H) / <65min (M).', sort_order: 5 },
];

// Methodology group ids (migration 0030 — seeded in EVERY environment). 8 = Core,
// Movilidad y Preventivos; 9 = Circuitos Funcionales; 4 = Series de Running;
// 5 = Zona 2 / Recuperación.
const GROUP_CORE_MOBILITY = 8;
const GROUP_FUNCTIONAL = 9;
const GROUP_RUNNING = 4;
const GROUP_ZONE2 = 5;

// ── Exercise catalog slugs (canonical rows from seed_exercises.ts, guaranteed
//    present in every seeded catalog). Resolved to ids at runtime so the seed is
//    portable across DBs; a missing slug hard-fails loudly. ─────────────────────
const SLUGS = {
  // Cardio rows are the plain modality exercises — the Z2/interval dose lives in
  // the typed prescription, not the slug (verified against the real 79-row prod
  // catalog: no per-dose cardio slugs exist there).
  bike: 'bike-erg',
  runEasy: 'run',
  runIntervals: 'run',
  row: 'row',
  ski: 'ski-erg',
  hipFlow: 'mobility-hip-flow-15min',
  foamRoll: 'foam-roll-lower-15min',
  lunges: 'hyrox-sandbag-lunges',
  wallBalls: 'hyrox-wall-balls',
  farmerCarry: 'hyrox-farmer-carry',
} as const;
type SlugKey = keyof typeof SLUGS;

// ── Prescription builders (typed, no free text) ──────────────────────────────
const reps = (value: number): Measure => ({ kind: 'reps', value });
const dur = (seconds: number): Measure => ({ kind: 'duration', seconds });
const dist = (meters: number): Measure => ({ kind: 'distance', meters });

/** One typed block_exercise line (single sub-block → block_position 0). */
function line(exercise_id: number, blockTitle: string, blockFormat: string, prescription: Prescription): BlockExerciseWrite {
  return {
    exercise_id,
    block_position: 0,
    block_format: blockFormat,
    block_title: blockTitle,
    prescription_json: prescription,
  };
}

// ── Library blocks (typed) the review coach owns. Keyed; each maps to one library
//    block created via the real createBlock/updateBlockFull (idempotent by title). ─
type BlockKey = 'WU_GENERAL' | 'WU_RUN' | 'COOLDOWN' | 'FUNCTIONAL' | 'RUN_INTERVALS' | 'ERGOS_Z2';

function buildBlockSpecs(id: Record<SlugKey, number>): Record<BlockKey, BlockWrite> {
  const WU = 'Calentamiento';
  const CD = 'Vuelta a la calma';
  return {
    WU_GENERAL: {
      title: 'Calentamiento general',
      description: 'Activación cardiovascular suave + movilidad de cadera antes del bloque principal.',
      methodology_group_id: GROUP_CORE_MOBILITY,
      format: 'core_mobility',
      exercises: [
        line(id.bike, WU, 'core_mobility', { scheme: 'steady', modality: 'bike', total_s: 300, target: { kind: 'rpe', value: 3 } }),
        line(id.hipFlow, WU, 'core_mobility', { scheme: 'steady', modality: 'mobility', total_s: 300 }),
      ],
    },
    WU_RUN: {
      title: 'Calentamiento de carrera',
      description: 'Trote muy suave + movilidad de cadera antes de las series de carrera.',
      methodology_group_id: GROUP_CORE_MOBILITY,
      format: 'core_mobility',
      exercises: [
        line(id.runEasy, WU, 'core_mobility', { scheme: 'steady', modality: 'run', total_s: 480, target: { kind: 'rpe', value: 3 } }),
        line(id.hipFlow, WU, 'core_mobility', { scheme: 'steady', modality: 'mobility', total_s: 300 }),
      ],
    },
    COOLDOWN: {
      title: 'Vuelta a la calma',
      description: 'Foam roll de tren inferior para bajar pulsaciones y favorecer la recuperación.',
      methodology_group_id: GROUP_CORE_MOBILITY,
      format: 'core_mobility',
      exercises: [
        line(id.foamRoll, CD, 'core_mobility', { scheme: 'steady', modality: 'mobility', total_s: 300 }),
      ],
    },
    FUNCTIONAL: {
      title: 'Circuito funcional HYROX',
      description: 'Tres vueltas: zancadas con saco, wall balls y farmer carry — estaciones clave de HYROX.',
      methodology_group_id: GROUP_FUNCTIONAL,
      format: 'functional_circuit',
      exercises: [
        line(id.lunges, 'Circuito funcional', 'functional_circuit', {
          scheme: 'sets',
          modality: 'functional',
          sets: [{ measure: dist(20) }, { measure: dist(20) }, { measure: dist(20) }],
        }),
        line(id.wallBalls, 'Circuito funcional', 'functional_circuit', {
          scheme: 'sets',
          modality: 'functional',
          sets: [{ measure: reps(15) }, { measure: reps(15) }, { measure: reps(15) }],
        }),
        line(id.farmerCarry, 'Circuito funcional', 'functional_circuit', {
          scheme: 'sets',
          modality: 'functional',
          sets: [{ measure: dist(40) }, { measure: dist(40) }, { measure: dist(40) }],
        }),
      ],
    },
    RUN_INTERVALS: {
      title: 'Series de carrera',
      description: 'Cinco series de 1 km a ritmo exigente (RPE 8) con recuperación entre series.',
      methodology_group_id: GROUP_RUNNING,
      format: 'run_intervals',
      exercises: [
        line(id.runIntervals, 'Series de carrera', 'run_intervals', {
          scheme: 'intervals',
          modality: 'run',
          rounds: 5,
          rest_s: 90,
          sets: [{ measure: dist(1000), target: { kind: 'rpe', value: 8 } }],
        }),
      ],
    },
    ERGOS_Z2: {
      title: 'Ergómetros en Zona 2',
      description: 'Trabajo aeróbico continuo suave en remo y ski erg (RPE 4).',
      methodology_group_id: GROUP_ZONE2,
      format: 'zone2',
      exercises: [
        line(id.row, 'Ergómetros Z2', 'zone2', { scheme: 'steady', modality: 'row', total_s: 1200, target: { kind: 'rpe', value: 4 } }),
        line(id.ski, 'Ergómetros Z2', 'zone2', { scheme: 'steady', modality: 'ski', total_s: 600, target: { kind: 'rpe', value: 4 } }),
      ],
    },
  };
}

// A composed DAY: warmup + principal + cooldown. `format` here is the day-part
// display format (TemplateFormat enum — distinct from the library block's format).
type DaySpec = {
  dow: number;
  focus: string;
  warmup: 'WU_GENERAL' | 'WU_RUN';
  principal: { key: BlockKey; format: TemplateFormat; title: string };
};

const DAYS: DaySpec[] = [
  { dow: 1, focus: 'Fuerza funcional y estaciones', warmup: 'WU_GENERAL', principal: { key: 'FUNCTIONAL', format: 'circuit', title: 'Circuito funcional' } },
  { dow: 3, focus: 'Series de carrera', warmup: 'WU_RUN', principal: { key: 'RUN_INTERVALS', format: 'intervals', title: 'Series de carrera' } },
  { dow: 5, focus: 'Ergómetros en Zona 2', warmup: 'WU_GENERAL', principal: { key: 'ERGOS_Z2', format: 'steady', title: 'Ergómetros Z2' } },
];

const WARMUP_FORMAT: Record<'WU_GENERAL' | 'WU_RUN', TemplateFormat> = { WU_GENERAL: 'circuit', WU_RUN: 'tempo' };
const COOLDOWN_FORMAT: TemplateFormat = 'cooldown';

// ── deps (dynamic import — the server-only `@/` libs form cycles tsx's static
//    linker rejects; defer to runtime under --conditions=react-server) ──────────
type Deps = {
  sql: Sql;
  findOrCreateCoachByEmail: typeof import('@/lib/auth/users')['findOrCreateCoachByEmail'];
  createCompAthlete: typeof import('@/lib/dashboard/coach/comp-athletes')['createCompAthlete'];
  createBlock: typeof import('@/lib/dashboard/coach/blocks')['createBlock'];
  updateBlockFull: typeof import('@/lib/dashboard/coach/blocks')['updateBlockFull'];
  safeParsePrescription: typeof import('@fahybrid/shared/domain/prescription')['safeParsePrescription'];
  createMonthTemplateWithEmptyWeeks: typeof import('@/lib/dashboard/coach/program-months')['createMonthTemplateWithEmptyWeeks'];
  upsertWeekTemplate: typeof import('@/lib/dashboard/coach/program-weeks')['upsertWeekTemplate'];
  assignMonthToAthlete: typeof import('@/lib/dashboard/programming/assign-month')['assignMonthToAthlete'];
  publishMicrociclo: typeof import('@/lib/coach/publish-microciclo')['publishMicrociclo'];
  dates: typeof import('@fahybrid/shared/domain/dates');
};

let D: Deps;

async function loadDeps(): Promise<Deps> {
  const [db, users, comp, blocks, presc, months, weeks, assign, publish, dates] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/auth/users'),
    import('@/lib/dashboard/coach/comp-athletes'),
    import('@/lib/dashboard/coach/blocks'),
    import('@fahybrid/shared/domain/prescription'),
    import('@/lib/dashboard/coach/program-months'),
    import('@/lib/dashboard/coach/program-weeks'),
    import('@/lib/dashboard/programming/assign-month'),
    import('@/lib/coach/publish-microciclo'),
    import('@fahybrid/shared/domain/dates'),
  ]);
  return {
    sql: db.sql,
    findOrCreateCoachByEmail: users.findOrCreateCoachByEmail,
    createCompAthlete: comp.createCompAthlete,
    createBlock: blocks.createBlock,
    updateBlockFull: blocks.updateBlockFull,
    safeParsePrescription: presc.safeParsePrescription,
    createMonthTemplateWithEmptyWeeks: months.createMonthTemplateWithEmptyWeeks,
    upsertWeekTemplate: weeks.upsertWeekTemplate,
    assignMonthToAthlete: assign.assignMonthToAthlete,
    publishMicrociclo: publish.publishMicrociclo,
    dates,
  };
}

const log = (...a: unknown[]) => console.log('[seed_review_account]', ...a); // eslint-disable-line no-console

// ── steps ────────────────────────────────────────────────────────────────────

/** Resolve every catalog slug → id; hard-fail listing any missing (guards against a
 *  DB whose exercises catalog was never seeded). */
async function resolveExerciseIds(): Promise<Record<SlugKey, number>> {
  const slugs = Object.values(SLUGS);
  const rows = await D.sql<Array<{ id: string; slug: string }>>`
    select id::text, slug from exercises where slug = any(${slugs})
  `;
  const bySlug = new Map(rows.map((r) => [r.slug, Number(r.id)]));
  const out = {} as Record<SlugKey, number>;
  const missing: string[] = [];
  for (const [key, slug] of Object.entries(SLUGS) as Array<[SlugKey, string]>) {
    const id = bySlug.get(slug);
    if (id == null) missing.push(slug);
    else out[key] = id;
  }
  if (missing.length > 0) {
    throw new Error(
      `exercises catalog is missing ${missing.length} required slug(s): ${missing.join(', ')}. ` +
        `Seed the catalog first (pnpm --filter @fahybrid/infra seed:exercises against this DB).`,
    );
  }
  return out;
}

/** Validate every block spec (schema + each prescription) BEFORE persisting. */
function assertSpecsValid(specs: Record<BlockKey, BlockWrite>): void {
  for (const [key, spec] of Object.entries(specs) as Array<[BlockKey, BlockWrite]>) {
    blockWriteSchema.parse(spec); // throws loudly on any invalid field
    spec.exercises.forEach((ex, i) => {
      const parsed = D.safeParsePrescription(ex.prescription_json);
      if (!parsed.success) {
        throw new Error(`invalid prescription in block ${key}[${i}] (exercise ${ex.exercise_id}): ${parsed.error?.message ?? 'parse failed'}`);
      }
    });
  }
}

/** Create-or-replace each library block (idempotent by title). Returns id per key. */
async function seedBlocks(coachId: number, specs: Record<BlockKey, BlockWrite>): Promise<Record<BlockKey, number>> {
  const out = {} as Record<BlockKey, number>;
  for (const [key, spec] of Object.entries(specs) as Array<[BlockKey, BlockWrite]>) {
    const existing = await D.sql<Array<{ id: string }>>`
      select id::text from blocks where coach_id = ${coachId} and title = ${spec.title} limit 1
    `;
    if (existing.length > 0) {
      const id = Number(existing[0]!.id);
      await D.updateBlockFull(coachId, id, spec, D.sql);
      out[key] = id;
      log(`block "${spec.title}" updated (id ${id})`);
    } else {
      const id = await D.createBlock(coachId, spec, D.sql);
      out[key] = id;
      log(`block "${spec.title}" created (id ${id})`);
    }
  }
  return out;
}

/** slots_json for the week: per training day one workout session = warmup →
 *  principal → cooldown, each referencing a library block by source_block_id. */
function buildWeekSlots(blockId: Record<BlockKey, number>) {
  return {
    days: DAYS.map((d) => ({
      day_of_week: d.dow,
      sessions: [
        {
          kind: 'workout' as const,
          focus: d.focus.slice(0, 120),
          blocks: [
            { uid: `d${d.dow}-wu`, format: WARMUP_FORMAT[d.warmup], title: 'Calentamiento', source_block_id: blockId[d.warmup] },
            { uid: `d${d.dow}-main`, format: d.principal.format, title: d.principal.title.slice(0, 120), source_block_id: blockId[d.principal.key] },
            { uid: `d${d.dow}-cd`, format: COOLDOWN_FORMAT, title: 'Vuelta a la calma', source_block_id: blockId.COOLDOWN },
          ],
        },
      ],
    })),
  };
}

/** Find-or-create the review month template and (re)populate its single week. */
async function ensureMonthTemplate(coachId: number, levelId: number, blockId: Record<BlockKey, number>): Promise<number> {
  const existing = await D.sql<Array<{ id: string }>>`
    select id::text from program_month_templates where coach_id = ${coachId} and name = ${MONTH_NAME} limit 1
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
    log(`month template reused (id ${monthId}, ${weekIds.length} week(s))`);
  } else {
    const created = await D.createMonthTemplateWithEmptyWeeks({
      coach_id: coachId,
      payload: { name: MONTH_NAME, level_id: levelId, week_count: WEEK_COUNT },
    });
    monthId = Number(created.id);
    weekIds = [...created.weeks].sort((a, b) => a.week_index - b.week_index).map((w) => Number(w.id));
    log(`month template created (id ${monthId}, ${weekIds.length} week(s))`);
  }
  if (weekIds.length < 1) throw new Error(`month template ${monthId} has no weeks`);

  await D.upsertWeekTemplate({
    coach_id: coachId,
    id: weekIds[0],
    payload: { name: 'Semana 1', focus: WEEK_FOCUS, slots_json: buildWeekSlots(blockId) },
  });
  log(`week 1 slots set (${DAYS.length} composed days × 3 bloques)`);
  return monthId;
}

/** Wipe the review athlete's materialized plan so a re-run reflects the latest slots
 *  (content is snapshotted at assign time). Scoped strictly to this athlete; FK-ordered.
 *  Library blocks are NOT touched (reusable). Mirrors seed_demo_athlete_plan. */
async function wipeAthletePlan(athleteId: number): Promise<void> {
  const tmpl = await D.sql<Array<{ template_id: string }>>`
    select distinct template_id::text from workout_assignments
    where athlete_id = ${athleteId} and template_id is not null
  `;
  const templateIds = tmpl.map((r) => Number(r.template_id));
  await D.sql`delete from workout_executions where assignment_id in (
    select id from workout_assignments where athlete_id = ${athleteId})`;
  await D.sql`delete from workout_assignments where athlete_id = ${athleteId}`;
  if (templateIds.length > 0) {
    await D.sql`delete from template_segments where template_id = any(${templateIds}::bigint[])`;
    await D.sql`delete from templates where id = any(${templateIds}::bigint[])`;
  }
  await D.sql`delete from weekly_plans where athlete_id = ${athleteId}`;
  await D.sql`delete from microcycles where athlete_id = ${athleteId}`;
  await D.sql`delete from athlete_month_assignments where athlete_id = ${athleteId}`;
  log(`wiped prior plan for athlete ${athleteId} (${templateIds.length} inline templates)`);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/?]+)/)?.[1] ?? '(unknown)';
  log(`target DB host: ${host}${DRY_RUN ? '  ·  DRY-RUN (no writes)' : ''}`);

  if (PROTECTED_EMAILS.has(COACH_EMAIL) || PROTECTED_EMAILS.has(ATHLETE_EMAIL)) {
    throw new Error('review emails collide with a protected real account — refusing to run');
  }

  D = await loadDeps();

  // Validate the plan content up front (fails loud before any write).
  const exerciseIds = await resolveExerciseIds();
  const blockSpecs = buildBlockSpecs(exerciseIds);
  assertSpecsValid(blockSpecs);
  const startDateIso = D.dates.isoDateString(D.dates.mondayOfWeek(D.dates.startOfDayInBox(new Date())));

  if (DRY_RUN) {
    log('exercise slugs all present:', Object.values(SLUGS).join(', '));
    log(`would create coach "${COACH_NAME}" <${COACH_EMAIL}> + athlete "${ATHLETE_NAME}" <${ATHLETE_EMAIL}>`);
    log(`would classify athlete: level ${LEVEL_NAME}, ${TRAINING_DAYS} days, onboarded`);
    log(`would build ${Object.keys(blockSpecs).length} library blocks and publish week starting ${startDateIso}`);
    log(`days: ${DAYS.map((d) => `dow${d.dow}(${d.principal.title})`).join(', ')}`);
    await D.sql.end();
    log('dry-run done — nothing written.');
    return;
  }

  // 1. Coach (idempotent) + display name.
  const { user: coachUser, coach } = await D.findOrCreateCoachByEmail(COACH_EMAIL);
  const coachId = Number(coach.id);
  await D.sql`update coaches set full_name = ${COACH_NAME}, updated_at = now() where id = ${coachId}`;
  log(`coach ready: id ${coachId}, user ${coachUser.id}`);

  // 2. Canonical levels (config a new coach lacks). Idempotent.
  for (const lv of CANONICAL_LEVELS) {
    await D.sql`
      insert into athlete_levels (coach_id, name, label, description, sort_order)
      values (${coachId}, ${lv.name}, ${lv.label}, ${lv.description}, ${lv.sort_order})
      on conflict (coach_id, name) do nothing
    `;
  }
  const lvl = await D.sql<Array<{ id: string }>>`
    select id::text from athlete_levels where coach_id = ${coachId} and name = ${LEVEL_NAME} limit 1
  `;
  if (lvl.length === 0) throw new Error(`level ${LEVEL_NAME} not present for coach ${coachId}`);
  const levelId = Number(lvl[0]!.id);

  // 3. Athlete (comp = full access, no billing). Idempotent.
  const created = await D.createCompAthlete({
    coach_id: coachId,
    input: { full_name: ATHLETE_NAME, email: ATHLETE_EMAIL, modality: ATHLETE_MODALITY },
  });
  const athleteId = Number(created.id);
  // Classify + mark onboarded (same writes as the /level + /training-days routes,
  // plus onboarded_at so the reviewer skips onboarding and lands on the plan).
  await D.sql`
    update athletes
       set level_id = ${levelId}, level_source = 'coach',
           training_days_per_week = ${TRAINING_DAYS},
           onboarded_at = coalesce(onboarded_at, now()),
           updated_at = now()
     where id = ${athleteId}
  `;
  log(`athlete ready: id ${athleteId}, user ${created.user_id}, level ${LEVEL_NAME}, ${TRAINING_DAYS} days, onboarded`);

  // 4. Library blocks (idempotent by title).
  const blockId = await seedBlocks(coachId, blockSpecs);

  // 5. Month template + week slots.
  const monthId = await ensureMonthTemplate(coachId, levelId, blockId);

  // 6. Assign + publish the current week (rebuild-safe).
  await wipeAthletePlan(athleteId);
  const assigned = await D.assignMonthToAthlete({
    coach_id: coachId,
    athlete_id: athleteId,
    month_template_id: monthId,
    start_date: startDateIso,
  });
  const monthAssignmentId = Number(assigned.month_assignment_id);
  log(`assigned: ${assigned.assignment_count} sessions, ${assigned.start_date}→${assigned.end_date} (id ${monthAssignmentId})`);
  const pub = await D.publishMicrociclo({ coach_id: coachId, athlete_id: athleteId, month_assignment_id: monthAssignmentId });
  log(`published weeks: ${pub.week_starts.join(', ')} (status ${pub.status})`);

  // ── summary (ids only; NEVER prints the review code) ──
  log('\n===================== REVIEW ACCOUNT SEEDED =====================');
  log(JSON.stringify({
    coach: { id: coachId, email: COACH_EMAIL, name: COACH_NAME },
    athlete: { id: athleteId, user_id: created.user_id, email: ATHLETE_EMAIL, name: ATHLETE_NAME, level: LEVEL_NAME, training_days: TRAINING_DAYS },
    plan: { month_template_id: monthId, month_assignment_id: monthAssignmentId, week_starts: pub.week_starts, sessions: assigned.assignment_count },
    login: { email: ATHLETE_EMAIL, code: 'set via REVIEW_ACCESS_CODE env (not shown)' },
  }, null, 2));

  await D.sql.end();
  log('done.');
}

main().catch(async (err) => {
  console.error('[seed_review_account] FAILED:', err); // eslint-disable-line no-console
  try {
    await D?.sql?.end();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
