/**
 * seed_demo_athlete_stations.ts — the STATION-PRACTICE half of DEMO athlete 1's
 * execution history (athlete_id 70, coach 29), so the training × race CROSS
 * (Fase 2) lights up all THREE evidence tiers on the real demo data:
 *
 *   · observado FRESCO   — standalone station practices (wall balls, sled push,
 *                          farmers): one segment at position 0 of its own session,
 *                          context 'sets', prior_work_s = 0. A real, fresh duration.
 *   · observado FATIGADO — ONE HYROX-simulation session (run + wall balls + sled
 *                          push) with context_format='hyrox_sim' and GROWING
 *                          prior_work_s, so the same movements read as fatigued.
 *   · estimado / sin_datos come for free: ski/row have no station practice (they
 *                          fall to the zone-profile threshold) and any station left
 *                          unseeded stays sin_datos — nothing fabricated.
 *
 * After this, the cross shows: run = observado (fresco+fatigado), ski/row =
 * estimado, wall balls + sled push = observado (fresco+fatigado), farmers =
 * observado (fresco), the rest sin_datos. All against the athlete's singles race.
 *
 * HONEST DATA — every segment is a real segment_executions row with real timings.
 * Durations are plausible-but-fresh vs the race split; prior_work is the cumulative
 * session work (a fact), never invented. No set_executions / scores are written.
 *
 * ⚠️ DEMO DATA — flagged + fully removable:
 *     delete from workout_executions where athlete_id = 70 and notes like '[demo-stations-history]%';
 *   (segment_executions cascade with the execution.)
 *
 * ORDERING: independent of the other athlete-70 seeds. Borrows SPARE assignments
 * (no execution yet), chosen by query — never the strength seed's sim day (666).
 *
 * HOST-GUARDED: refuses to run unless the DATABASE_URL host is the demo branch
 * (ep-flat-wind), OR the operator names the host via DEMO_SEED_ALLOW_HOST (for
 * ephemeral-fork verification). Touches ONLY athlete 70.
 *
 * RUN (against the DEMO DB — host must be ep-flat-wind):
 *   cd web && NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/seed_demo_athlete_stations.ts
 */
import './_load_web_env.ts';

import type { Sql } from '@/lib/db';

// ── CONFIG ───────────────────────────────────────────────────────────────────
const REQUIRED_HOST = 'ep-flat-wind';
const ATHLETE_ID = 70;
const COACH_ID = 29;
const EXEC_FLAG = '[demo-stations-history]';
const SEG_SOURCE = 'demo';
const MADRID_OFFSET = '+02:00'; // CEST
// Seconds of roxzone/transition between two efforts inside the simulation (used
// to accumulate the fatigue proxy honestly across the sim's segments).
const SIM_TRANSITION_S = 60;
// A fresh station practice is at position 0 of its own session → zero prior work.
const FRESH_PRIOR_WORK_S = 0;

// FRESH station practices — one segment each, plausible fresh durations (a touch
// faster than a race split, since they're isolated and unfatigued).
const FRESH_STATIONS: ReadonlyArray<{ slug: string; duration_s: number }> = [
  { slug: 'hyrox-wall-balls', duration_s: 300 }, // race split ~345
  { slug: 'hyrox-sled-push', duration_s: 120 }, //  race split ~138
  { slug: 'hyrox-farmer-carry', duration_s: 72 }, // race split ~80
];

// The HYROX-simulation session: a fatigued run + two stations, in order.
const SIM_RUN_PACE_S_PER_KM = 305; // fatigued race-like run pace
const SIM_RUN_DURATION_S = 305;
const SIM_STATIONS: ReadonlyArray<{ slug: string; duration_s: number }> = [
  { slug: 'hyrox-wall-balls', duration_s: 360 }, // slower than the fresh 300 (fatigue)
  { slug: 'hyrox-sled-push', duration_s: 150 }, //  slower than the fresh 120
];

const log = (...a: unknown[]) => console.log('[seed_demo_athlete_stations]', ...a); // eslint-disable-line no-console

// ── deps (dynamic import — mirrors seed_demo_athlete_strength.ts) ─────────────
type Deps = { sql: Sql };
let D: Deps;
async function loadDeps(): Promise<Deps> {
  const db = await import('@/lib/db');
  return { sql: db.sql };
}

// ── steps ────────────────────────────────────────────────────────────────────
async function assertOwnership(): Promise<void> {
  const rows = await D.sql<Array<{ coach_id: string }>>`
    select coach_id::text from athletes where id = ${ATHLETE_ID} limit 1
  `;
  if (rows.length === 0) throw new Error(`athlete ${ATHLETE_ID} not found on this DB`);
  if (Number(rows[0]!.coach_id) !== COACH_ID) {
    throw new Error(`athlete ${ATHLETE_ID} belongs to coach ${rows[0]!.coach_id}, expected ${COACH_ID}`);
  }
}

/** Resolve the station exercise ids by slug (never hardcode ids). */
async function resolveExerciseIds(slugs: string[]): Promise<Map<string, number>> {
  const rows = await D.sql<Array<{ id: string; slug: string }>>`
    select id::text as id, slug from exercises where slug in ${D.sql(slugs)}
  `;
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.slug, Number(r.id));
  return map;
}

/** Idempotent: drop this script's prior executions (segments cascade). */
async function wipePrior(): Promise<void> {
  const del = await D.sql`
    delete from workout_executions where athlete_id = ${ATHLETE_ID} and notes like ${EXEC_FLAG + '%'}
  `;
  log(`wiped ${del.count} prior station execution(s)`);
}

/** The latest HYROX-simulation assignment WITHOUT an execution (never 666). */
async function findSimAssignment(): Promise<{ id: number; day: string } | null> {
  const rows = await D.sql<Array<{ id: string; day: string }>>`
    select wa.id::text as id, to_char(wa.scheduled_for, 'YYYY-MM-DD') as day
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    left join workout_executions we on we.assignment_id = wa.id
    where wa.athlete_id = ${ATHLETE_ID}
      and t.format::text in ('hyrox_sim', 'simulation')
      and we.id is null
    order by wa.scheduled_for desc
    limit 1
  `;
  return rows[0] ? { id: Number(rows[0].id), day: rows[0].day } : null;
}

/** Up to N spare (no-execution) NON-sim assignments to host fresh practices,
 *  circuit/metcon days preferred; deterministic order. */
async function findFreshAssignments(excludeId: number, n: number): Promise<Array<{ id: number; day: string }>> {
  const rows = await D.sql<Array<{ id: string; day: string }>>`
    select wa.id::text as id, to_char(wa.scheduled_for, 'YYYY-MM-DD') as day
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    left join workout_executions we on we.assignment_id = wa.id
    where wa.athlete_id = ${ATHLETE_ID}
      and we.id is null
      and wa.id <> ${excludeId}
      and t.format::text not in ('hyrox_sim', 'simulation')
    order by (t.format::text = 'circuit') desc, wa.scheduled_for desc
    limit ${n}
  `;
  return rows.map((r: { id: string; day: string }) => ({ id: Number(r.id), day: r.day }));
}

/** Insert one workout_execution on a borrowed assignment (idempotent upsert). */
async function insertExecution(assignmentId: number, day: string, durationS: number, note: string): Promise<number> {
  const started = new Date(`${day}T18:30:00${MADRID_OFFSET}`);
  const ended = new Date(started.getTime() + durationS * 1000);
  const rows = await D.sql<Array<{ id: string }>>`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at,
      total_duration_seconds, perceived_exertion, notes, source
    ) values (
      ${assignmentId}, ${ATHLETE_ID},
      ${started.toISOString()}::timestamptz, ${ended.toISOString()}::timestamptz,
      ${durationS}, 7, ${`${EXEC_FLAG} ${note}`}, 'manual'
    )
    on conflict (assignment_id) do update set
      started_at = excluded.started_at, ended_at = excluded.ended_at,
      total_duration_seconds = excluded.total_duration_seconds,
      perceived_exertion = excluded.perceived_exertion,
      notes = excluded.notes, source = excluded.source, updated_at = now()
    returning id::text
  `;
  return Number(rows[0]!.id);
}

interface SegSpec {
  position: number;
  exercise_id: number | null;
  modality: string | null;
  avg_pace_s_per_km: number | null;
  distance_meters: number | null;
  duration_s: number;
  context_format: string;
  prior_work_s: number;
}

/** Insert one segment_execution with real timings, from a cursor. */
async function insertSegment(executionId: number, startMs: number, spec: SegSpec): Promise<void> {
  const started = new Date(startMs);
  const ended = new Date(startMs + spec.duration_s * 1000);
  await D.sql`
    insert into segment_executions (
      execution_id, template_segment_id, position, started_at, ended_at,
      modality, avg_pace_s_per_km, distance_meters,
      exercise_id, context_format, context_source, prescription_snapshot,
      prior_work_s, is_structural, source
    ) values (
      ${executionId}, null, ${spec.position},
      ${started.toISOString()}::timestamptz, ${ended.toISOString()}::timestamptz,
      ${spec.modality}, ${spec.avg_pace_s_per_km}, ${spec.distance_meters},
      ${spec.exercise_id}, ${spec.context_format}, 'block', null,
      ${spec.prior_work_s}, false, ${SEG_SOURCE}
    )
  `;
}

async function seedFreshPractices(exIds: Map<string, number>, assignments: Array<{ id: number; day: string }>): Promise<number> {
  let n = 0;
  for (let i = 0; i < assignments.length && i < FRESH_STATIONS.length; i++) {
    const st = FRESH_STATIONS[i]!;
    const asg = assignments[i]!;
    const exerciseId = exIds.get(st.slug);
    if (exerciseId == null) {
      log(`skip fresh ${st.slug}: exercise not found`);
      continue;
    }
    const execId = await insertExecution(asg.id, asg.day, st.duration_s, `práctica ${st.slug}`);
    const started = new Date(`${asg.day}T18:30:00${MADRID_OFFSET}`);
    await insertSegment(execId, started.getTime(), {
      position: 0,
      exercise_id: exerciseId,
      modality: null, // a station duration, not a paced effort — kept out of run/ski/row
      avg_pace_s_per_km: null,
      distance_meters: null,
      duration_s: st.duration_s,
      context_format: 'sets',
      prior_work_s: FRESH_PRIOR_WORK_S,
    });
    n += 1;
    log(`fresco ${st.slug} → ${st.duration_s}s on assignment ${asg.id} (${asg.day})`);
  }
  return n;
}

async function seedSimSession(exIds: Map<string, number>, sim: { id: number; day: string }): Promise<number> {
  const execDurationGuess =
    SIM_RUN_DURATION_S + SIM_STATIONS.reduce((s, st) => s + st.duration_s, 0) + SIM_STATIONS.length * SIM_TRANSITION_S;
  const execId = await insertExecution(sim.id, sim.day, execDurationGuess, 'simulación HYROX');
  const start = new Date(`${sim.day}T09:00:00${MADRID_OFFSET}`);
  let cursorMs = start.getTime();
  let priorWork = 0; // cumulative session work before each segment (the fatigue proxy)
  let position = 0;
  let segs = 0;

  // Segment 0: the fatigued run.
  await insertSegment(execId, cursorMs, {
    position,
    exercise_id: null,
    modality: 'run',
    avg_pace_s_per_km: SIM_RUN_PACE_S_PER_KM,
    distance_meters: 1000,
    duration_s: SIM_RUN_DURATION_S,
    context_format: 'hyrox_sim',
    prior_work_s: priorWork,
  });
  segs += 1;
  cursorMs += (SIM_RUN_DURATION_S + SIM_TRANSITION_S) * 1000;
  priorWork += SIM_RUN_DURATION_S + SIM_TRANSITION_S;
  position += 1;

  // The two fatigued stations.
  for (const st of SIM_STATIONS) {
    const exerciseId = exIds.get(st.slug);
    if (exerciseId == null) {
      log(`skip sim ${st.slug}: exercise not found`);
      continue;
    }
    await insertSegment(execId, cursorMs, {
      position,
      exercise_id: exerciseId,
      modality: null,
      avg_pace_s_per_km: null,
      distance_meters: null,
      duration_s: st.duration_s,
      context_format: 'hyrox_sim',
      prior_work_s: priorWork,
    });
    segs += 1;
    log(`fatigado ${st.slug} → ${st.duration_s}s (prior_work ${priorWork}s) in sim on assignment ${sim.id} (${sim.day})`);
    cursorMs += (st.duration_s + SIM_TRANSITION_S) * 1000;
    priorWork += st.duration_s + SIM_TRANSITION_S;
    position += 1;
  }
  return segs;
}

async function verify(): Promise<void> {
  const rows = await D.sql<Array<{ ctx: string; n: string }>>`
    select se.context_format as ctx, count(*)::text as n
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    where we.athlete_id = ${ATHLETE_ID} and se.source = ${SEG_SOURCE}
      and we.notes like ${EXEC_FLAG + '%'}
    group by se.context_format
    order by se.context_format
  `;
  log(
    'verify (seeded segments by context):',
    rows.map((r: { ctx: string; n: string }) => `${r.ctx}=${r.n}`).join(' · ') || '(none)',
  );
}

// ── entry ────────────────────────────────────────────────────────────────────
/** The seed body, host-guard free — importable for ephemeral-fork verification. */
export async function seedStationsHistory(): Promise<void> {
  D = await loadDeps();
  await assertOwnership();
  const slugs = [...new Set([...FRESH_STATIONS.map((s) => s.slug), ...SIM_STATIONS.map((s) => s.slug)])];
  const exIds = await resolveExerciseIds(slugs);
  await wipePrior();

  const sim = await findSimAssignment();
  const fresh = await findFreshAssignments(sim?.id ?? -1, FRESH_STATIONS.length);

  let freshCount = 0;
  if (fresh.length === 0) {
    log('no spare assignment for fresh practices — skipping (fresco tier will be empty)');
  } else {
    freshCount = await seedFreshPractices(exIds, fresh);
  }

  let simSegs = 0;
  if (!sim) {
    log('no spare HYROX-simulation assignment — skipping (fatigado tier will be empty)');
  } else {
    simSegs = await seedSimSession(exIds, sim);
  }

  await verify();
  log(`done — ${freshCount} fresh practice(s) + ${simSegs} simulation segment(s).`);
}

function assertHost(): string {
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/?]+)/)?.[1] ?? '';
  const allow = process.env.DEMO_SEED_ALLOW_HOST;
  if (host.includes(REQUIRED_HOST)) return host;
  if (allow && allow.length > 0 && host.includes(allow)) return host;
  throw new Error(
    `Refusing to run: DATABASE_URL host is "${host || '(unknown)'}", not the DEMO DB (${REQUIRED_HOST}). ` +
      'Set DEMO_SEED_ALLOW_HOST=<host-substring> to target another branch (e.g. an ephemeral fork).',
  );
}

async function main(): Promise<void> {
  log(`target host: ${assertHost()}`);
  await seedStationsHistory();
  await D.sql.end();
}

// Run as CLI only (not when imported by a verification harness).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (err) => {
    console.error('[seed_demo_athlete_stations] FAILED:', err); // eslint-disable-line no-console
    try {
      await D?.sql?.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
}
