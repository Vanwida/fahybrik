/**
 * seed_demo_athlete_running.ts — give DEMO athlete 1 (athlete_id 70, coach 29) a
 * REAL, coherent RUNNING history so the athlete "Tu progreso · carrera" block
 * (GET /api/athlete/running-analysis → buildRunningAnalysis) renders populated,
 * honest data instead of empty tiles.
 *
 * GROUND TRUTH BEFORE THIS SEED (queried live, demo branch ep-flat-wind):
 *   • athlete_zone_profiles : run threshold 255 s/km (4:15/km) + row/ski/bike — present.
 *   • biometric_streams vo2max : 773 rows (rich HealthKit-style history) — present.
 *   • races : 4 PAST HYROX *doubles* with run_splits_json + station_splits_json,
 *             plus 2 future events — present (team-level splits; doubles).
 *   • athlete_strength_maxes : back_squat_1rm 80 kg — present (the strength half).
 *   • athlete_benchmarks : EMPTY → no run_5k → NO VDOT / threshold / pace-zone tiles.
 *   • segment_executions run : 4 rows, all null distance + null pace (junk from a
 *             manual-logging test) → NO best-1k / weekly volume / pace progression.
 *
 * So the two HONEST GAPS this script fills (everything else already exists):
 *   1. run_5k benchmark, 3 versions over ~12 weeks (improving) → a real Jack-Daniels
 *      VDOT + threshold pace + pace zones + a 5k TREND. The latest version (19:58)
 *      derives a Daniels T-pace of 4:16/km — coherent with the seeded run zone
 *      profile (4:15/km). Values & VDOT verified with the app's own computeVdot().
 *   2. A ~7-week run-training history (easy + threshold + VO₂ intervals + a long
 *      run today logged as per-km splits) as dedicated, clearly-flagged demo
 *      workout_assignments + workout_executions + run segment_executions → populates
 *      best-1k, weekly volume, the splits chart (+ drift note) and the per-week pace
 *      progression. Paces are internally consistent with VDOT ~50 (E ~5:05, T ~4:16,
 *      I ~3:52/km) and drift slightly slower week-over-week so the trend is real.
 *      Each day is a COACH-PRESCRIBED session: it points at a real, structured run
 *      template (one per kind — see RUN_TEMPLATES) whose template_segments carry a
 *      validated run prescription (distance + zone, resolved to a pace band by the
 *      athlete's run profile). The prescribed segment structure mirrors the executed
 *      splits, so each split links 1:1 to its segment (template_segment_id) and the
 *      done-detail reads prescrito → hecho. This replaces the old single EMPTY-segment
 *      template (the non-null-workout-with-zero-blocks shape that broke every view).
 *
 * We DO NOT seed another race: athlete 70 already has 4 past HYROX results with run
 * splits, so the "if no race with run splits" condition is false — faking a 5th
 * would be dishonest. (Caveat surfaced to Alex: those 4 are DOUBLES = team-level
 * splits, not a clean solo run-pace source.)
 *
 * FLAGGED + REMOVABLE (demo data, honestly marked):
 *   • benchmarks      : exercise_slug='run_5k', notes start with DEMO_FLAG.
 *   • assignments     : notes = ASSIGN_FLAG ('[demo-run-history]').
 *   • executions      : notes start with DEMO_FLAG; segment_executions.source='demo'.
 *   To remove: delete from athlete_benchmarks where athlete_id=70 and exercise_slug='run_5k';
 *              delete from workout_executions where assignment_id in
 *                (select id from workout_assignments where athlete_id=70 and notes='[demo-run-history]');
 *              delete from workout_assignments where athlete_id=70 and notes='[demo-run-history]';
 *
 * IDEMPOTENT: benchmarks = delete-by-(athlete,slug) then re-insert; run history =
 * delete its own flagged assignments/executions (segments cascade) then rebuild;
 * templates = delete-by-(coach, name) [legacy + the 4 kind templates] then recreate
 * with fresh segments AFTER the assignments are wiped (FK-safe). Converges, no dupes.
 *
 * ⚠️ ORDERING: seed_demo_athlete_plan.ts wipes ALL of athlete 70's
 * workout_assignments (+ executions) on every run. Run THIS script AFTER it. The
 * run_5k benchmarks are independent of that wipe and always survive.
 *
 * HOST-GUARDED: refuses to run unless DATABASE_URL host is the demo branch
 * (ep-flat-wind). Touches ONLY athlete 70.
 *
 * RUN (against the DEMO DB — host must be ep-flat-wind):
 *   cd web && NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/seed_demo_athlete_running.ts
 */
import './_load_web_env.ts';

import type { Sql } from '@/lib/db';

// ── CONFIG ───────────────────────────────────────────────────────────────────
const REQUIRED_HOST = 'ep-flat-wind';
const ATHLETE_ID = 70;
const COACH_ID = 29;
const DEMO_FLAG = '[demo-seed:run-history]';
const ASSIGN_FLAG = '[demo-run-history]';
const SEG_SOURCE = 'demo';
// Legacy single empty-segment template these run-history days used to point at —
// the ROOT of the cross-view bug (a non-null workout with zero blocks). Deleted on
// every run now that each day points at a real, structured run template below.
const LEGACY_TEMPLATE_NAME = 'Carrera — historial (demo)';
const RUN_EXERCISE_SLUG = 'run'; // catalog Run (id 3479 on demo) — looked up by slug
const BENCH_SLUG = 'run_5k';
const BENCH_UNIT = 'seconds'; // MUST match running-analysis.ts (unit = 'seconds')
const MADRID_OFFSET = '+02:00'; // CEST (summer) — demo dates are all in June

/** 5k TT history → real VDOT + improving trend. Times verified with computeVdot():
 *  21:00 → VDOT 47.0 (T 4:28) · 20:25 → VDOT 48.6 (T 4:21) · 19:58 → VDOT 49.9 (T 4:16). */
const FIVE_K_HISTORY: Array<{ seconds: number; weeks_ago: number; note: string }> = [
  { seconds: 21 * 60 + 0, weeks_ago: 12, note: `${DEMO_FLAG} 5k TT pista` },
  { seconds: 20 * 60 + 25, weeks_ago: 6, note: `${DEMO_FLAG} 5k TT pista` },
  { seconds: 19 * 60 + 58, weeks_ago: 2, note: `${DEMO_FLAG} 5k TT pista` },
];

// ── Run-history model (coherent with VDOT ~50: E ~5:05, T ~4:16, I ~3:52 /km) ──
type RunSeg = { distance_m: number; pace_s_per_km: number; hr: number };
type RunKind = 'easy' | 'threshold' | 'intervals' | 'tempo';
interface RunSession {
  days_ago: number; // from this week's Monday (box tz)
  start_hour: number;
  kind: RunKind;
  rpe: number;
  segments: RunSeg[];
}

// ── Run-history PRESCRIPTION templates (one reusable template per session kind) ─
// Each completed run day is a COACH-PRESCRIBED session the athlete executed, so it
// carries a real, structured prescription — not an empty shell. Per the domain
// matrix a run line = distance (measure) + zone (target); the athlete's stored run
// zone profile resolves each zone to an absolute pace band at read time (the loader
// does this — we never hardcode a pace that could drift from the profile). The
// prescription's SEGMENT STRUCTURE mirrors the executed splits exactly, so each
// measured split maps 1:1 to its prescribed segment in the done-detail
// (prescrito → hecho) — see the template_segment_id linkage in seedRunHistory.
interface RunSegSpec {
  distance_m: number;
  zone: number; // 1-5 — resolved to a pace band via the athlete's run zone profile
  block_position: number;
  block_title: string;
  block_format: string; // display format for the block (steady | tempo | intervals)
}
interface RunTemplateSpec {
  name: string;
  format: string; // templates.format enum (steady | tempo | intervals)
  segments: RunSegSpec[];
}

// Zones: easy Z2, threshold warm-up Z1 + Z4 block, VO₂ warm-up Z1 + Z5 reps,
// tempo Z3. Distances mirror buildSessions() so prescrito and hecho line up.
const RUN_TEMPLATES: Record<RunKind, RunTemplateSpec> = {
  easy: {
    name: 'Carrera fácil · Z2 (demo)',
    format: 'steady',
    segments: [
      { distance_m: 9500, zone: 2, block_position: 0, block_title: 'Rodaje suave', block_format: 'steady' },
    ],
  },
  threshold: {
    name: 'Carrera de umbral (demo)',
    format: 'tempo',
    segments: [
      { distance_m: 1500, zone: 1, block_position: 0, block_title: 'Calentamiento', block_format: 'steady' },
      { distance_m: 4800, zone: 4, block_position: 1, block_title: 'Bloque de umbral', block_format: 'tempo' },
    ],
  },
  intervals: {
    name: 'Series VO₂ (demo)',
    format: 'intervals',
    segments: [
      { distance_m: 2000, zone: 1, block_position: 0, block_title: 'Calentamiento', block_format: 'steady' },
      // 5 × 1 km reps — one block (block_position 1), modeled as 5 distinct
      // segments so each rep maps 1:1 to its measured split in the done-detail.
      ...Array.from({ length: 5 }, (): RunSegSpec => ({
        distance_m: 1000, zone: 5, block_position: 1, block_title: 'Series 1 km', block_format: 'intervals',
      })),
    ],
  },
  tempo: {
    name: 'Tempo continuo (demo)',
    format: 'tempo',
    segments: [
      { distance_m: 8000, zone: 3, block_position: 0, block_title: 'Tempo continuo', block_format: 'tempo' },
    ],
  },
};

type RunTemplate = { templateId: number; segmentIds: number[] };

const r1 = (n: number) => Math.round(n);
// Week-over-week drift: older weeks slightly slower (s/km added per week back).
const easyPace = (w: number) => 305 + r1(1.8 * w);
const thrPace = (w: number) => 256 + r1(1.5 * w);
const wuPace = (w: number) => 332 + r1(1.6 * w);
const intRep = (w: number) => 232 + r1(1.6 * w);

/** Today's controlled tempo run, logged as 8 per-km splits with a mild fade
 *  (≈ +10 s/km in the second half) → drives the splits chart + the drift note.
 *  A quality session (not an easy run) so the current-week representative pace is
 *  honestly fast — the progression chart's latest bar reads as improvement, not a
 *  composition artefact. Its fastest km (4:25) never beats the 1k-rep PR (3:50). */
const TODAY_TEMPO_SPLITS: number[] = [266, 265, 267, 268, 274, 278, 280, 276];

function buildSessions(): RunSession[] {
  const out: RunSession[] = [];

  // Current week (today = Monday): one controlled tempo run, per-km splits. Late
  // hour so it is the MOST RECENT run execution (→ splits source) over the plan's
  // earlier same-day executions.
  out.push({
    days_ago: 0,
    start_hour: 19,
    kind: 'tempo',
    rpe: 7,
    segments: TODAY_TEMPO_SPLITS.map((p) => ({ distance_m: 1000, pace_s_per_km: p, hr: 162 })),
  });

  // Six prior full weeks × 3 sessions (Mon easy · Wed VO₂ intervals · Fri threshold).
  for (let w = 1; w <= 6; w++) {
    const base = w * 7;

    // Mon — easy continuous Z2.
    out.push({
      days_ago: base,
      start_hour: 8,
      kind: 'easy',
      rpe: 4,
      segments: [{ distance_m: 9500, pace_s_per_km: easyPace(w), hr: 148 }],
    });

    // Wed — VO₂ intervals: easy warm-up + 5 × 1 km reps. The MOST RECENT intervals
    // session (w=1) carries the fastest rep (3:50/km) → the best-1k PR.
    const reps =
      w === 1
        ? [238, 234, 232, 230, 233] // best 1k = 230 s = 3:50/km
        : [intRep(w) + 4, intRep(w) + 1, intRep(w), intRep(w) - 1, intRep(w) + 2];
    out.push({
      days_ago: base - 2,
      start_hour: 18,
      kind: 'intervals',
      rpe: 9,
      segments: [
        { distance_m: 2000, pace_s_per_km: wuPace(w), hr: 142 },
        ...reps.map((p) => ({ distance_m: 1000, pace_s_per_km: p, hr: 178 })),
      ],
    });

    // Fri — threshold: easy warm-up + a continuous tempo block.
    out.push({
      days_ago: base - 4,
      start_hour: 18,
      kind: 'threshold',
      rpe: 8,
      segments: [
        { distance_m: 1500, pace_s_per_km: wuPace(w), hr: 140 },
        { distance_m: 4800, pace_s_per_km: thrPace(w), hr: 168 },
      ],
    });
  }
  return out;
}

// ── deps (dynamic import — mirrors seed_demo_athlete_plan.ts) ──────────────────
type Prescription = import('@fahybrid/shared/domain/prescription').Prescription;
type Deps = {
  sql: Sql;
  buildRunningAnalysis: typeof import('@/lib/athlete/running-analysis')['buildRunningAnalysis'];
  dates: typeof import('@fahybrid/shared/domain/dates');
  safeParsePrescription: typeof import('@fahybrid/shared/domain/prescription')['safeParsePrescription'];
  prescriptionToParams: typeof import('@fahybrid/shared/domain/prescription')['prescriptionToParams'];
};
let D: Deps;

async function loadDeps(): Promise<Deps> {
  const [db, ra, dates, rx] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/athlete/running-analysis'),
    import('@fahybrid/shared/domain/dates'),
    import('@fahybrid/shared/domain/prescription'),
  ]);
  return {
    sql: db.sql,
    buildRunningAnalysis: ra.buildRunningAnalysis,
    dates,
    safeParsePrescription: rx.safeParsePrescription,
    prescriptionToParams: rx.prescriptionToParams,
  };
}

/** Build the structured run prescription for one segment: distance + zone target.
 *  The zone resolves to a pace band against the athlete's run profile at read time. */
function runPrescription(seg: RunSegSpec): Prescription {
  const scheme = seg.block_format === 'intervals' ? 'intervals' : 'steady';
  return {
    scheme,
    modality: 'run',
    target: { kind: 'hr_zone', value: seg.zone },
    sets: [{ measure: { kind: 'distance', meters: seg.distance_m } }],
  } as Prescription;
}

const log = (...a: unknown[]) => console.log('[seed_demo_athlete_running]', ...a); // eslint-disable-line no-console
const pace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

// ── steps ──────────────────────────────────────────────────────────────────────

async function assertOwnership(): Promise<void> {
  const rows = await D.sql<Array<{ coach_id: string }>>`
    select coach_id::text from athletes where id = ${ATHLETE_ID} limit 1
  `;
  if (rows.length === 0) throw new Error(`athlete ${ATHLETE_ID} not found on this DB`);
  if (Number(rows[0]!.coach_id) !== COACH_ID) {
    throw new Error(`athlete ${ATHLETE_ID} belongs to coach ${rows[0]!.coach_id}, expected ${COACH_ID}`);
  }
}

/** Seed the 3 run_5k benchmarks (idempotent: clear this athlete's run_5k, re-insert). */
async function seedBenchmarks(): Promise<void> {
  await D.sql`delete from athlete_benchmarks where athlete_id = ${ATHLETE_ID} and exercise_slug = ${BENCH_SLUG}`;
  for (const b of FIVE_K_HISTORY) {
    const recordedAt = D.dates.isoDateString(D.dates.addDays(weekMonday(), -b.weeks_ago * 7));
    await D.sql`
      insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, recorded_at, notes)
      values (${ATHLETE_ID}, ${BENCH_SLUG}, ${b.seconds}, ${BENCH_UNIT}, ${recordedAt}::timestamptz, ${b.note})
    `;
  }
  log(`run_5k benchmarks: ${FIVE_K_HISTORY.map((b) => pace(b.seconds)).join(' → ')} (unit '${BENCH_UNIT}')`);
}

/** Resolve the catalog Run exercise id by slug (id is env-stable but we look it
 *  up so a re-seeded catalog never silently mis-points the segments). */
async function runExerciseId(): Promise<number> {
  const rows = await D.sql<Array<{ id: string }>>`
    select id::text from exercises where slug = ${RUN_EXERCISE_SLUG} limit 1
  `;
  if (!rows[0]) throw new Error(`run exercise (slug '${RUN_EXERCISE_SLUG}') not found in catalog`);
  return Number(rows[0].id);
}

/** Drop the run-history templates this script owns (legacy + the 4 kind templates)
 *  so a re-run rebuilds them cleanly. Their template_segments cascade. Safe ONLY
 *  after wipePriorHistory() has removed the assignments that referenced them. */
async function cleanupRunTemplates(): Promise<void> {
  const names = [LEGACY_TEMPLATE_NAME, ...Object.values(RUN_TEMPLATES).map((t) => t.name)];
  const del = await D.sql`
    delete from templates where coach_id = ${COACH_ID} and name = any(${names})
  `;
  log(`cleaned ${del.count} prior run-history template(s)`);
}

/** Create the 4 structured run templates (easy / threshold / intervals / tempo),
 *  each with real template_segments carrying a validated run prescription. Returns
 *  per-kind { templateId, ordered segmentIds } so seedRunHistory can point each
 *  assignment at its template and link each measured split to its prescribed segment. */
async function ensureTemplates(): Promise<Record<RunKind, RunTemplate>> {
  const exerciseId = await runExerciseId();
  const out = {} as Record<RunKind, RunTemplate>;

  for (const kind of Object.keys(RUN_TEMPLATES) as RunKind[]) {
    const spec = RUN_TEMPLATES[kind];
    const ins = await D.sql<Array<{ id: string }>>`
      insert into templates (coach_id, name, description, format, is_draft)
      values (
        ${COACH_ID}, ${spec.name},
        ${'Plantilla de carrera para el historial de demo (no se asigna a semanas).'},
        ${spec.format}::template_format, true
      )
      returning id::text
    `;
    const templateId = Number(ins[0]!.id);

    const segmentIds: number[] = [];
    let position = 1;
    for (const seg of spec.segments) {
      const prescription = runPrescription(seg);
      // Validate against the SAME schema the API reads — never seed a shape the
      // loader would silently drop (which would re-create the empty-blocks bug).
      const parsed = D.safeParsePrescription(prescription);
      if (!parsed.success) {
        throw new Error(`invalid run prescription for ${kind}: ${parsed.error?.message ?? 'parse failed'}`);
      }
      const params = D.prescriptionToParams(parsed.data);
      const segIns = await D.sql<Array<{ id: string }>>`
        insert into template_segments (
          template_id, position, exercise_id, params_json, prescription_json,
          block_position, block_format, block_title
        ) values (
          ${templateId}, ${position}, ${exerciseId},
          ${D.sql.json(params as unknown as Parameters<typeof D.sql.json>[0])},
          ${D.sql.json(parsed.data as unknown as Parameters<typeof D.sql.json>[0])},
          ${seg.block_position}, ${seg.block_format}, ${seg.block_title}
        )
        returning id::text
      `;
      segmentIds.push(Number(segIns[0]!.id));
      position += 1;
    }

    out[kind] = { templateId, segmentIds };
    log(`template "${spec.name}" created (id ${templateId}, ${spec.segments.length} segs)`);
  }
  return out;
}

/** Remove any prior run-history this script created (idempotent rebuild). */
async function wipePriorHistory(): Promise<void> {
  await D.sql`
    delete from workout_executions where assignment_id in (
      select id from workout_assignments where athlete_id = ${ATHLETE_ID} and notes = ${ASSIGN_FLAG}
    )`; // segment_executions cascade with their parent execution
  const del = await D.sql`delete from workout_assignments where athlete_id = ${ATHLETE_ID} and notes = ${ASSIGN_FLAG}`;
  log(`wiped prior run-history (${del.count} flagged assignments)`);
}

let _weekMonday: Date | null = null;
function weekMonday(): Date {
  if (!_weekMonday) _weekMonday = D.dates.mondayOfWeek(D.dates.startOfDayInBox(new Date()));
  return _weekMonday;
}

/** Insert the run sessions as assignment → execution → run segments. Each session
 *  points at its kind's structured template, and each measured split is linked to
 *  its prescribed template_segment (template_segment_id) when the executed segment
 *  structure matches the prescription 1:1 — so the done-detail reads prescrito →
 *  hecho per segment. (The today-tempo run logs 8 GPS auto-splits against a single
 *  continuous prescription; those don't map 1:1 and stay unlinked — honest.) */
async function seedRunHistory(
  templates: Record<RunKind, RunTemplate>,
): Promise<{ sessions: number; segments: number }> {
  const sessions = buildSessions();
  let segCount = 0;

  for (const s of sessions) {
    const tpl = templates[s.kind];
    const dayIso = D.dates.isoDateString(D.dates.addDays(weekMonday(), -s.days_ago));
    const startedAt = new Date(`${dayIso}T${String(s.start_hour).padStart(2, '0')}:00:00${MADRID_OFFSET}`);
    const totalDur = s.segments.reduce((n, seg) => n + r1((seg.pace_s_per_km * seg.distance_m) / 1000), 0);
    const endedAt = new Date(startedAt.getTime() + totalDur * 1000);

    // Link splits to prescribed segments only when the structures line up 1:1
    // (easy / threshold / intervals); a count mismatch (the tempo auto-splits)
    // leaves them unlinked rather than mis-attributing a split to a segment.
    const linkable = s.segments.length === tpl.segmentIds.length;

    const asg = await D.sql<Array<{ id: string }>>`
      insert into workout_assignments (athlete_id, template_id, template_version, scheduled_for, status, notes)
      values (${ATHLETE_ID}, ${tpl.templateId}, 1, ${dayIso}::date, 'completed', ${ASSIGN_FLAG})
      returning id::text
    `;
    const assignmentId = Number(asg[0]!.id);

    const exec = await D.sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at,
        total_duration_seconds, perceived_exertion, notes, source
      ) values (
        ${assignmentId}, ${ATHLETE_ID},
        ${startedAt.toISOString()}::timestamptz, ${endedAt.toISOString()}::timestamptz,
        ${totalDur}, ${s.rpe}, ${`${DEMO_FLAG} ${s.kind}`}, 'manual'
      ) returning id::text
    `;
    const executionId = Number(exec[0]!.id);

    let cursor = startedAt.getTime();
    let position = 1;
    for (const [idx, seg] of s.segments.entries()) {
      const segDur = r1((seg.pace_s_per_km * seg.distance_m) / 1000);
      const segStart = new Date(cursor);
      const segEnd = new Date(cursor + segDur * 1000);
      cursor = segEnd.getTime();
      const templateSegmentId = linkable ? tpl.segmentIds[idx]! : null;
      await D.sql`
        insert into segment_executions (
          execution_id, template_segment_id, position, started_at, ended_at,
          modality, distance_meters, avg_pace_s_per_km, avg_hr, max_hr, source
        ) values (
          ${executionId}, ${templateSegmentId}, ${position},
          ${segStart.toISOString()}::timestamptz, ${segEnd.toISOString()}::timestamptz,
          'run', ${seg.distance_m}, ${seg.pace_s_per_km}, ${seg.hr}, ${seg.hr + 8}, ${SEG_SOURCE}
        )
      `;
      position += 1;
      segCount += 1;
    }
  }
  log(`seeded ${sessions.length} run sessions, ${segCount} run segments (source '${SEG_SOURCE}', flag '${DEMO_FLAG}')`);
  return { sessions: sessions.length, segments: segCount };
}

// ── verification (read-only) — prints EXACTLY what the app returns ───────────────

async function verify(): Promise<void> {
  log('\n──────── VERIFY (via the real buildRunningAnalysis) ────────');
  const a = await D.buildRunningAnalysis({ athlete_id: ATHLETE_ID }, D.sql);
  log(`threshold_pace : ${a.threshold_pace}`);
  log(`vo2_estimate   : ${a.vo2_estimate} (VDOT)`);
  log(`best_1k        : ${a.best_1k}`);
  log(`weekly_volume  : ${a.weekly_volume_km} (current ISO week)`);
  log(`split_drop_note: ${a.split_drop_note}`);
  log(`splits         : ${a.splits.map((s) => s.pace).join(' · ')}`);
  log(`pace_zones     : ${a.pace_zones.map((z) => `Z${z.zone} ${z.descriptor} ${z.pace}${z.highlight ? '★' : ''}`).join(' | ')}`);
  log(`progression    : ${a.progression.map((p) => `${p.pace}${p.current ? '★' : ''}`).join(' → ')}`);

  // Rolling 7-day run volume (a clearer "weekly volume" for the Inicio mock).
  const last7 = await D.sql<Array<{ km: string | null }>>`
    select round(sum(coalesce(se.distance_meters, 0))::numeric / 1000, 1)::text as km
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    where we.athlete_id = ${ATHLETE_ID} and se.modality = 'run' and se.source = ${SEG_SOURCE}
      and coalesce(we.ended_at, we.started_at) >= now() - interval '7 days'
  `;
  log(`run volume last 7 days (seeded) : ${last7[0]?.km ?? '0'} km`);

  const bench = await D.sql<Array<{ value: string; recorded_at: string }>>`
    select value::text, to_char(recorded_at, 'YYYY-MM-DD') as recorded_at
    from athlete_benchmarks where athlete_id = ${ATHLETE_ID} and exercise_slug = ${BENCH_SLUG}
    order by recorded_at asc
  `;
  log(`run_5k trend   : ${bench.map((b) => `${b.recorded_at} ${pace(Number(b.value))}`).join('  ·  ')}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/?]+)/)?.[1] ?? '';
  if (!host.includes(REQUIRED_HOST)) {
    throw new Error(
      `Refusing to run: DATABASE_URL host is "${host || '(unknown)'}", not the DEMO DB (${REQUIRED_HOST}).`,
    );
  }
  log(`target host: ${host}`);

  D = await loadDeps();

  await assertOwnership();
  await seedBenchmarks();
  // Order matters: wipe the assignments FIRST so the templates they reference can
  // be dropped and rebuilt cleanly (FK on workout_assignments.template_id).
  await wipePriorHistory();
  await cleanupRunTemplates();
  const templates = await ensureTemplates();
  await seedRunHistory(templates);
  await verify();

  await D.sql.end();
  log('done.');
}

main().catch(async (err) => {
  console.error('[seed_demo_athlete_running] FAILED:', err); // eslint-disable-line no-console
  try {
    await D?.sql?.end();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
