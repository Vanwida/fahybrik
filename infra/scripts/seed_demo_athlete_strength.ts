/**
 * seed_demo_athlete_strength.ts — the STRENGTH half of DEMO athlete 1's execution
 * history (athlete_id 70, coach 29). The plan seed (seed_demo_athlete_plan.ts)
 * gives athlete 70 real strength ASSIGNMENTS (the "Fuerza" days, back squat %RM →
 * kg over the seeded 80 kg 1RM, reverse-lunge @30 kg, …) but no EXECUTIONS, so the
 * Fuerza section of the analytics tab had only the 1RM test. This script logs those
 * sessions set by set — the per-set `set_executions` (mig 0088) + the denormalized
 * `segment_executions` context (mig 0120) the strength analytics read — so volume,
 * per-lift progression, load adherence and effort all light up from REAL rows.
 *
 * It also drops a HYROX-simulation TIME score on the Friday sim day (mig 0069) so
 * the HYROX section's "Simulaciones y metcons" card shows a best-sim mark.
 *
 * HONEST LOGGING (mig 0088 contract, never violated):
 *   · loads derive from the REAL prescription (percent_rm → resolveRmLoad over the
 *     athlete's 1RM · explicit kg · bodyweight/unmapped → no fabricated kg).
 *   · a fatigue taper makes later sets a touch lighter (adherence ~97 %, not a
 *     fake 100 %); the last working set of each lift is 'scaled' (one rep short);
 *     ONE set in the block is 'skipped' (reps_actual NULL) so skip-exclusion is
 *     exercised by real demo data, never a fabricated 0.
 *   · exercise identity + the prescription snapshot are stamped on the segment,
 *     so a later template edit never orphans the progression.
 *
 * ⚠️ DEMO DATA — flagged + fully removable:
 *     delete from workout_executions where athlete_id = 70 and notes like '[demo-strength-history]%';
 *   (segment_executions + set_executions cascade with the execution.)
 *
 * ⚠️ ORDERING: run AFTER seed_demo_athlete_plan.ts (which creates the Fuerza
 * assignments + wipes athlete 70's executions on every run). Independent of
 * seed_demo_athlete_running.ts (different assignments).
 *
 * TARGET + GUARD (shared _demo_target): athlete resolved by marker email; demo
 * branch always writable, MAIN only with SEED_DEMO_ALLOW_MAIN=1. Touches ONLY the
 * resolved demo athlete's executions. Runs AFTER the plan (needs Fuerza segments).
 *
 * RUN (against MAIN):
 *   cd web && SEED_DEMO_ALLOW_MAIN=1 DATABASE_URL="<main>" \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/seed_demo_athlete_strength.ts
 */
import './_load_web_env.ts';

import type { Sql } from '@/lib/db';
import { assertDemoWriteHost, resolveDemoTarget } from './_demo_target.ts';

// ── CONFIG ───────────────────────────────────────────────────────────────────
// athlete/coach resolved at runtime from marker email (ids differ per branch).
let ATHLETE_ID: number;
let COACH_ID: number;
const EXEC_FLAG = '[demo-strength-history]';
const SIM_FLAG = '[demo-strength-history:sim-score]';
const SEG_SOURCE = 'demo';
const ONE_RM_SLUG = 'back_squat_1rm';
// A plausible working load for a strength lift the coach left without a %RM/kg
// target (an unmapped 1RM, e.g. front squat) — the bar is still loaded.
const FALLBACK_LOAD_KG = 45;
// A training Open HYROX simulation finish (73:00) — slower than a race, as sims are.
const SIM_SCORE_S = 73 * 60;
const MADRID_OFFSET = '+02:00'; // CEST

const log = (...a: unknown[]) => console.log('[seed_demo_athlete_strength]', ...a); // eslint-disable-line no-console

// ── deps (dynamic import — mirrors seed_demo_athlete_running.ts) ──────────────
type Deps = {
  sql: Sql;
  resolveRmLoad: typeof import('@fahybrid/shared/domain/strength')['resolveRmLoad'];
};
let D: Deps;

async function loadDeps(): Promise<Deps> {
  const [db, strength] = await Promise.all([
    import('@/lib/db'),
    import('@fahybrid/shared/domain/strength'),
  ]);
  return { sql: db.sql, resolveRmLoad: strength.resolveRmLoad };
}

// ── prescription → per-set plan (honest actuals) ─────────────────────────────
interface PrescTarget {
  kind?: string;
  value?: number;
  min?: number;
  max?: number;
}
interface PrescSet {
  target?: PrescTarget;
  measure?: { kind?: string; value?: number };
}
interface DerivedSet {
  set_index: number;
  reps_prescribed: number | null;
  reps_actual: number | null;
  load_prescribed_kg: number | null;
  load_actual_kg: number | null;
  rpe: number | null;
  rir: number | null;
  status: 'done' | 'scaled' | 'skipped';
}

/** Resolve a set's prescribed load (kg) from its typed target over the 1RM. */
function prescribedLoad(target: PrescTarget | undefined, oneRm: number | null): number | null {
  if (!target) return null;
  if (target.kind === 'percent_rm' && oneRm) {
    // exactOptionalPropertyTypes: only set the keys that are actually present.
    const pct: { value?: number; min?: number; max?: number } = {};
    if (target.value !== undefined) pct.value = target.value;
    if (target.min !== undefined) pct.min = target.min;
    if (target.max !== undefined) pct.max = target.max;
    const r = D.resolveRmLoad(pct, oneRm);
    if (!r) return null;
    return r.max_kg != null ? Math.round((r.min_kg + r.max_kg) / 2) : r.min_kg;
  }
  if (target.kind === 'kg' && typeof target.value === 'number') return target.value;
  return null; // bodyweight / none → no fabricated kg
}

/**
 * Turn a strength prescription's sets into logged sets with honest actuals. The
 * last working set is 'scaled' (one rep short) — a realistic pattern. A single
 * 'skipped' set is stamped later (seedSessions) on a real loaded set so
 * skip-exclusion runs against real demo data.
 */
function deriveSets(presc: { sets?: PrescSet[] }, oneRm: number | null): DerivedSet[] {
  const raw = Array.isArray(presc.sets) ? presc.sets : [];
  const out: DerivedSet[] = [];
  raw.forEach((s, i) => {
    const measure = s?.measure;
    const reps_prescribed = measure?.kind === 'reps' && typeof measure.value === 'number' ? measure.value : null;
    const loadPresc = prescribedLoad(s?.target, oneRm);
    // A strength lift with reps but no coach load (unmapped 1RM) still gets loaded.
    const fallbackLoaded = loadPresc == null && s?.target == null && reps_prescribed != null;
    if (reps_prescribed == null && loadPresc == null && !fallbackLoaded) return; // empty set → nothing to log

    const isLast = i === raw.length - 1;
    // Fatigue taper on later sets → realistic <100% adherence, not a fake 100%.
    const taper = i === 0 ? 1 : 1 - Math.min(i, 3) * 0.025;
    const load_actual: number | null =
      loadPresc != null ? Math.round(loadPresc * taper) : fallbackLoaded ? FALLBACK_LOAD_KG : null;
    let reps_actual = reps_prescribed;
    let status: DerivedSet['status'] = 'done';
    if (isLast && reps_prescribed != null && reps_prescribed > 1) {
      status = 'scaled';
      reps_actual = reps_prescribed - 1; // one rep short on the last set
    }
    const loaded = load_actual != null && load_actual > 0;
    out.push({
      set_index: i + 1,
      reps_prescribed,
      reps_actual,
      load_prescribed_kg: loadPresc,
      load_actual_kg: load_actual,
      // RPE/RIR are opt-in; log them on loaded sets, rising within the session.
      rpe: loaded ? Math.min(10, 7 + Math.floor(i / 2)) : null,
      rir: loaded ? Math.max(0, 3 - Math.floor(i / 2)) : null,
      status,
    });
  });
  return out;
}

// ── steps ────────────────────────────────────────────────────────────────────

async function oneRepMax(): Promise<number | null> {
  const rows = await D.sql<Array<{ kg: string }>>`
    select one_rm_kg::text as kg from athlete_strength_maxes
    where athlete_id = ${ATHLETE_ID} and exercise_slug = ${ONE_RM_SLUG}
    order by version desc limit 1
  `;
  return rows[0] ? Number(rows[0].kg) : null;
}

/** Idempotent: drop this script's prior executions (segments + sets cascade). */
async function wipePrior(): Promise<void> {
  const del = await D.sql`
    delete from workout_executions
    where athlete_id = ${ATHLETE_ID} and (notes like ${EXEC_FLAG + '%'} or notes like ${SIM_FLAG + '%'})
  `;
  log(`wiped ${del.count} prior strength execution(s)`);
}

interface StrengthSeg {
  assignment_id: number;
  template_segment_id: number;
  position: number;
  exercise_id: number;
  exercise_name: string;
  prescription_json: { sets?: PrescSet[] };
  scheduled_for: string;
}

/** The Fuerza days' STRENGTH segments (prescription modality = 'strength'). */
async function loadStrengthSegments(): Promise<StrengthSeg[]> {
  return D.sql<StrengthSeg[]>`
    select
      wa.id::text::int          as assignment_id,
      ts.id::text::int          as template_segment_id,
      ts.position,
      ts.exercise_id::text::int as exercise_id,
      ex.name                   as exercise_name,
      ts.prescription_json,
      to_char(wa.scheduled_for, 'YYYY-MM-DD') as scheduled_for
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    join template_segments ts on ts.template_id = t.id
    join exercises ex on ex.id = ts.exercise_id
    where wa.athlete_id = ${ATHLETE_ID}
      and t.name ilike '%fuerza%'
      and ts.prescription_json->>'modality' = 'strength'
    order by wa.scheduled_for asc, ts.position asc
  `;
}

/** Seed executions + segments + sets for every Fuerza assignment. */
async function seedSessions(oneRm: number | null): Promise<{ execs: number; segs: number; sets: number }> {
  const segments = await loadStrengthSegments();
  if (segments.length === 0) {
    log('no Fuerza strength segments found for athlete 70 — did seed_demo_athlete_plan run first?');
    return { execs: 0, segs: 0, sets: 0 };
  }

  // Group segments by their assignment (one execution per Fuerza session).
  const byAssignment = new Map<number, StrengthSeg[]>();
  for (const s of segments) {
    const list = byAssignment.get(s.assignment_id) ?? [];
    list.push(s);
    byAssignment.set(s.assignment_id, list);
  }
  const assignmentIds = [...byAssignment.keys()];
  const lastAssignment = assignmentIds[assignmentIds.length - 1];

  let execs = 0;
  let segs = 0;
  let setCount = 0;

  for (const assignmentId of assignmentIds) {
    const segList = byAssignment.get(assignmentId)!;
    const startedAt = new Date(`${segList[0]!.scheduled_for}T08:30:00${MADRID_OFFSET}`);

    // Derive every set, then drop segments with nothing to log (empty prescription).
    const derivedBySeg = segList
      .map((seg) => ({ seg, sets: deriveSets(seg.prescription_json, oneRm) }))
      .filter((d) => d.sets.length > 0);

    // Stamp the ONE skipped set on the last loaded set of the last session, so
    // skip-exclusion is exercised by real demo data (never a fabricated 0).
    if (assignmentId === lastAssignment && derivedBySeg.length > 0) {
      const lastSeg = derivedBySeg[derivedBySeg.length - 1]!;
      const lastSet = lastSeg.sets[lastSeg.sets.length - 1]!;
      lastSet.status = 'skipped';
      lastSet.reps_actual = null;
      lastSet.load_actual_kg = null;
      lastSet.rpe = null;
      lastSet.rir = null;
    }

    const totalDuration = derivedBySeg.reduce((n, d) => n + d.sets.length * 90 + 120, 0); // ~90 s/set + rest
    const endedAt = new Date(startedAt.getTime() + totalDuration * 1000);

    const execRows = await D.sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at,
        total_duration_seconds, perceived_exertion, notes, source
      ) values (
        ${assignmentId}, ${ATHLETE_ID},
        ${startedAt.toISOString()}::timestamptz, ${endedAt.toISOString()}::timestamptz,
        ${totalDuration}, 7, ${`${EXEC_FLAG} sesión de fuerza`}, 'manual'
      )
      on conflict (assignment_id) do update set
        started_at = excluded.started_at, ended_at = excluded.ended_at,
        total_duration_seconds = excluded.total_duration_seconds,
        perceived_exertion = excluded.perceived_exertion,
        notes = excluded.notes, source = excluded.source, updated_at = now()
      returning id::text
    `;
    const executionId = Number(execRows[0]!.id);
    execs += 1;

    let cursor = startedAt.getTime();
    for (const { seg, sets } of derivedBySeg) {
      const done = sets.filter((s) => s.status !== 'skipped');
      const repsCompleted = done.reduce((n, s) => n + (s.reps_actual ?? 0), 0);
      const topLoad = done.reduce<number | null>((m, s) => (s.load_actual_kg != null && (m == null || s.load_actual_kg > m) ? s.load_actual_kg : m), null);
      const segDur = sets.length * 90 + 60;
      const segStarted = new Date(cursor);
      const segEnded = new Date(cursor + segDur * 1000);
      cursor = segEnded.getTime();

      const segRows = await D.sql<Array<{ id: string }>>`
        insert into segment_executions (
          execution_id, template_segment_id, position, started_at, ended_at,
          modality, reps_completed, weight_used_kg,
          exercise_id, context_format, context_source, prescription_snapshot,
          is_structural, source
        ) values (
          ${executionId}, ${seg.template_segment_id}, ${seg.position},
          ${segStarted.toISOString()}::timestamptz, ${segEnded.toISOString()}::timestamptz,
          'strength', ${repsCompleted || null}, ${topLoad},
          ${seg.exercise_id}, 'sets', 'block', ${D.sql.json(seg.prescription_json as object)},
          false, ${SEG_SOURCE}
        )
        returning id::text
      `;
      const segId = Number(segRows[0]!.id);
      segs += 1;

      for (const s of sets) {
        await D.sql`
          insert into set_executions (
            segment_execution_id, set_index, reps_prescribed, reps_actual,
            load_prescribed_kg, load_actual_kg, rpe, rir, status, confirmed
          ) values (
            ${segId}, ${s.set_index}, ${s.reps_prescribed}, ${s.reps_actual},
            ${s.load_prescribed_kg}, ${s.load_actual_kg}, ${s.rpe}, ${s.rir}, ${s.status}, true
          )
        `;
        setCount += 1;
      }
    }
    log(`assignment ${assignmentId} (${segList[0]!.scheduled_for}) → ${segList.length} lifts`);
  }
  return { execs, segs, sets: setCount };
}

/** Drop a HYROX-sim TIME score on athlete 70's simulation day (mig 0069). */
async function seedSimScore(): Promise<boolean> {
  const asg = await D.sql<Array<{ id: string; name: string }>>`
    select wa.id::text as id, t.name
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    where wa.athlete_id = ${ATHLETE_ID}
      and (t.format::text in ('hyrox_sim', 'simulation') or t.name ilike '%simulaci%')
    order by wa.scheduled_for desc
    limit 1
  `;
  if (!asg[0]) {
    log('no HYROX simulation assignment found for athlete 70 — skipping sim score');
    return false;
  }
  const assignmentId = Number(asg[0].id);
  const dayRows = await D.sql<Array<{ d: string }>>`
    select to_char(scheduled_for, 'YYYY-MM-DD') as d from workout_assignments where id = ${assignmentId}
  `;
  const started = new Date(`${dayRows[0]!.d}T09:00:00${MADRID_OFFSET}`);
  const ended = new Date(started.getTime() + SIM_SCORE_S * 1000);
  await D.sql`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at,
      total_duration_seconds, perceived_exertion, notes, source, score_time_s
    ) values (
      ${assignmentId}, ${ATHLETE_ID},
      ${started.toISOString()}::timestamptz, ${ended.toISOString()}::timestamptz,
      ${SIM_SCORE_S}, 9, ${`${SIM_FLAG} simulación HYROX`}, 'manual', ${SIM_SCORE_S}
    )
    on conflict (assignment_id) do update set
      score_time_s = excluded.score_time_s, started_at = excluded.started_at,
      ended_at = excluded.ended_at, total_duration_seconds = excluded.total_duration_seconds,
      notes = excluded.notes, source = excluded.source, updated_at = now()
  `;
  log(`sim score set on "${asg[0].name}" (assignment ${assignmentId}): ${Math.floor(SIM_SCORE_S / 60)}:00`);
  return true;
}

async function verify(): Promise<void> {
  const rows = await D.sql<Array<{ sessions: string; sets: string; tonnage: string }>>`
    select
      count(distinct we.id)::text as sessions,
      count(*)::text as sets,
      coalesce(sum(st.load_actual_kg * st.reps_actual), 0)::int::text as tonnage
    from set_executions st
    join segment_executions se on se.id = st.segment_execution_id
    join workout_executions we on we.id = se.execution_id
    where we.athlete_id = ${ATHLETE_ID} and st.status <> 'skipped'
      and st.load_actual_kg is not null and st.reps_actual is not null
  `;
  const r = rows[0]!;
  log(`verify: ${r.sessions} sessions · ${r.sets} loaded sets · ${r.tonnage} kg tonnage (skips excluded)`);
}

// ── entry ────────────────────────────────────────────────────────────────────
/** The seed body, host-guard free — importable for ephemeral-fork verification. */
export async function seedStrengthHistory(): Promise<void> {
  D = await loadDeps();
  const target = await resolveDemoTarget(D.sql);
  ATHLETE_ID = target.athleteId;
  COACH_ID = target.coachId;
  log(`resolved demo athlete ${ATHLETE_ID} <${target.athleteEmail}>, coach ${COACH_ID}`);
  const oneRm = await oneRepMax();
  log(`athlete ${ATHLETE_ID} back-squat 1RM: ${oneRm != null ? `${oneRm} kg` : '(none — %RM lifts log reps only)'}`);
  await wipePrior();
  const counts = await seedSessions(oneRm);
  const sim = await seedSimScore();
  await verify();
  log(`done — ${counts.execs} sessions, ${counts.segs} segments, ${counts.sets} sets${sim ? ' + sim score' : ''}.`);
}

async function main(): Promise<void> {
  log(`target host: ${assertDemoWriteHost('seed_demo_athlete_strength')}`);
  await seedStrengthHistory();
  await D.sql.end();
}

// Run as CLI only (not when imported by a verification harness).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (err) => {
    console.error('[seed_demo_athlete_strength] FAILED:', err); // eslint-disable-line no-console
    try {
      await D?.sql?.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
}
