/**
 * DEMO SEED — workout_executions + segment_executions for athlete_id = 2, mapped
 * onto the REAL 12-week HYROX plan (ATR macrocycle → ACC/TRANS/REAL blocks →
 * weekly microcycles → workout_assignments). Seeds executions against PAST
 * assignments (weeks 1-3 of the plan) so /api/athlete/analytics and the coach
 * modality view render real run + row/ski + strength data.
 *
 * ⚠️ DEMO DATA — clearly flagged and fully removable. Every workout_executions
 * row gets `notes` starting with DEMO_FLAG, and every segment_executions row gets
 * `source = 'demo'`. To remove:
 *
 *   delete from workout_executions where athlete_id = 2 and notes like '[demo-seed]%';
 *   -- segment_executions cascade-delete with their parent execution.
 *
 * RESOLUTION (no brittle hardcoded ids)
 * -------------------------------------
 * Picks past assignments by template name keyword within weeks 1-3 of athlete 2's
 * current plan, then reads each assignment's REAL template_segments and synthesizes
 * per-segment metrics by modality (derived from the segment's exercise name):
 *   - run      : distance 1.5-5 km, pace ~3:55-4:55 /km, HR 140-178
 *   - row/ski  : 250-1000 m, /500m ~1:51-2:05, power 195-260 W, SPM 24-30, calories
 *   - strength : reps + load, HR 130-160
 * Each session's RPE + duration is coherent with its modality mix.
 *
 * Idempotent: upserts execution by assignment_id (unique) and each segment by
 * (execution_id, position). Re-running overwrites in place — never dupes.
 *
 * Run: pnpm --filter @fahybrid/infra tsx scripts/seed_demo_executions.ts
 */
import { getSql } from './_db.js';

const ATHLETE_ID = 2;
const DEMO_FLAG = '[demo-seed]';
const SEG_SOURCE = 'demo';

type Modality = 'run' | 'row' | 'ski' | 'bike' | 'strength' | 'other';

// Past sessions to seed, by template-name keyword (unique within weeks 1-3) +
// how many days ago it was performed + session RPE.
interface SessionSpec {
  name_like: string;
  days_ago: number;
  rpe: number;
}
const SESSIONS: SessionSpec[] = [
  { name_like: 'Test ergómetros%', days_ago: 18, rpe: 8 }, // row + ski
  { name_like: 'Series de carrera%', days_ago: 16, rpe: 8 }, // run
  { name_like: 'Threshold en cinta (umbral)%', days_ago: 14, rpe: 9 }, // run
  { name_like: 'Fuerza tren inferior (cadena%', days_ago: 13, rpe: 7 }, // strength
  { name_like: 'WOD largo mixto sled%', days_ago: 11, rpe: 9 }, // mixed run+row+ski
  { name_like: 'Threshold en cinta por bloques%', days_ago: 9, rpe: 8 }, // run
  { name_like: 'Fuerza tracción/empuje%', days_ago: 8, rpe: 7 }, // strength
  { name_like: 'Tempo run + fuerza%', days_ago: 7, rpe: 7 }, // run + strength
];

interface SegmentRow {
  position: number;
  exercise_name: string;
  params_json: Record<string, unknown> | null;
}

/** Derive canonical modality from an exercise name (mirrors normalizeModality). */
function modalityFor(name: string): Modality {
  const n = name.toLowerCase();
  if (n.includes('ski')) return 'ski';
  if (n.includes('row') || n === 'rowing') return 'row';
  if (n.includes('bike') || n.includes('assault')) return 'bike';
  if (n.includes('run') && !n.includes('drill')) return 'run';
  if (/(squat|deadlift|press|bench|clean|thrust|lunge|hip|dip|pull|sled|wall ball|carry|jump|burpee)/.test(n))
    return 'strength';
  return 'other';
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

interface SynthSeg {
  position: number;
  modality: Modality;
  duration_seconds: number;
  distance_meters?: number;
  avg_pace_s_per_500m?: number;
  avg_pace_s_per_km?: number;
  avg_power_w?: number;
  stroke_rate_spm?: number;
  avg_hr?: number;
  max_hr?: number;
  calories?: number;
  reps_completed?: number;
  weight_used_kg?: number;
}

/** Coherent per-modality synthetic metrics, seeded from the segment's params. */
function synthSegment(seg: SegmentRow, intensity: number): SynthSeg {
  const mod = modalityFor(seg.exercise_name);
  const p = seg.params_json ?? {};
  const time = num(p.time_seconds);
  const dist = num(p.distance_meters);
  const sets = num(p.sets) ?? num(p.rounds) ?? 1;
  const reps = num(p.reps);
  const weight = num(p.weight_kg);

  const baseDur =
    time != null ? time * Math.max(1, sets) : dist != null ? Math.round((dist / 1000) * 300) : 240;

  if (mod === 'run') {
    const pace = Math.round(295 - intensity * 35); // s/km — faster at higher intensity
    const distance =
      dist != null && dist >= 200 ? dist * Math.max(1, sets) : Math.round((baseDur / pace) * 1000);
    const hr = Math.round(150 + intensity * 22);
    return {
      position: seg.position,
      modality: 'run',
      duration_seconds: Math.max(60, Math.round((distance / 1000) * pace)),
      distance_meters: distance,
      avg_pace_s_per_km: pace,
      avg_hr: hr,
      max_hr: Math.min(195, hr + 9),
    };
  }

  if (mod === 'row' || mod === 'ski') {
    const distance = dist != null && dist >= 200 ? dist * Math.max(1, sets) : 500 * Math.max(1, sets);
    const pace500 = Math.round(125 - intensity * 14); // s/500m
    const power = Math.round(190 + intensity * 75);
    const spm = Math.round(24 + intensity * 6);
    const hr = Math.round(150 + intensity * 24);
    const duration = Math.max(60, Math.round((distance / 500) * pace500));
    return {
      position: seg.position,
      modality: mod,
      duration_seconds: duration,
      distance_meters: distance,
      avg_pace_s_per_500m: pace500,
      avg_power_w: power,
      stroke_rate_spm: spm,
      avg_hr: hr,
      max_hr: Math.min(192, hr + 11),
      calories: Math.round((duration / 60) * (10 + intensity * 4)),
    };
  }

  if (mod === 'strength') {
    const totalReps = (reps ?? 8) * Math.max(1, sets);
    const hr = Math.round(132 + intensity * 22);
    return {
      position: seg.position,
      modality: 'strength',
      duration_seconds: baseDur,
      reps_completed: totalReps,
      // exactOptionalPropertyTypes: omit the key entirely when absent rather than
      // assigning `undefined` to an optional `number` field.
      ...(weight != null ? { weight_used_kg: weight } : {}),
      avg_hr: hr,
      max_hr: Math.min(180, hr + 16),
    };
  }

  // other (drills, core, plank) — duration + HR only.
  const hr = Math.round(125 + intensity * 18);
  return {
    position: seg.position,
    modality: 'other',
    duration_seconds: baseDur,
    avg_hr: hr,
    max_hr: Math.min(175, hr + 12),
  };
}

async function main(): Promise<void> {
  const sql = getSql();

  const athleteRows = await sql<{ id: string }[]>`
    select id::text from athletes where id = ${ATHLETE_ID} limit 1
  `;
  if (!athleteRows[0]) throw new Error(`athlete ${ATHLETE_ID} not found — aborting demo seed`);

  let execCount = 0;
  let segCount = 0;

  for (const spec of SESSIONS) {
    const asg = await sql<{ id: string; template_id: string }[]>`
      select wa.id::text, wa.template_id::text
      from workout_assignments wa
      join microcycles mc on mc.id = wa.microcycle_id
      join templates t on t.id = wa.template_id
      where wa.athlete_id = ${ATHLETE_ID}
        and mc.week_number in (1, 2, 3)
        and t.name like ${spec.name_like}
      order by wa.scheduled_for asc
      limit 1
    `;
    if (!asg[0]) {
      console.warn(`[demo-seed] no past assignment matched "${spec.name_like}" — skipping`);
      continue;
    }
    const assignmentId = Number(asg[0].id);
    const templateId = Number(asg[0].template_id);

    const segRows = await sql<SegmentRow[]>`
      select ts.position, e.name as exercise_name, ts.params_json
      from template_segments ts
      join exercises e on e.id = ts.exercise_id
      where ts.template_id = ${templateId}
      order by ts.position
    `;
    if (segRows.length === 0) {
      console.warn(`[demo-seed] assignment ${assignmentId} has no segments — skipping`);
      continue;
    }

    const intensity = (spec.rpe - 4) / 6; // 0..1 from RPE 4..10
    const synths = segRows.map((s) => synthSegment(s, intensity));
    const totalDuration = synths.reduce((n, s) => n + s.duration_seconds, 0);

    const startedAt = new Date(Date.now() - spec.days_ago * 86_400_000);
    startedAt.setHours(8, 30, 0, 0);
    const endedAt = new Date(startedAt.getTime() + totalDuration * 1000);

    const execRows = await sql<{ id: string }[]>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at,
        total_duration_seconds, perceived_exertion, notes, source
      ) values (
        ${assignmentId}, ${ATHLETE_ID},
        ${startedAt.toISOString()}::timestamptz,
        ${endedAt.toISOString()}::timestamptz,
        ${totalDuration}, ${spec.rpe},
        ${`${DEMO_FLAG} synthetic execution for analytics demo`},
        'manual'
      )
      on conflict (assignment_id) do update set
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        total_duration_seconds = excluded.total_duration_seconds,
        perceived_exertion = excluded.perceived_exertion,
        notes = excluded.notes,
        source = excluded.source,
        updated_at = now()
      returning id::text
    `;
    const executionId = Number(execRows[0]!.id);
    execCount += 1;

    let cursor = startedAt.getTime();
    for (const seg of synths) {
      const tsRows = await sql<{ id: string }[]>`
        select id::text from template_segments
        where template_id = ${templateId} and position = ${seg.position}
        limit 1
      `;
      const templateSegmentId = tsRows[0] ? Number(tsRows[0].id) : null;

      const segStarted = new Date(cursor);
      const segEnded = new Date(cursor + seg.duration_seconds * 1000);
      cursor = segEnded.getTime();

      await sql`
        insert into segment_executions (
          execution_id, template_segment_id, position,
          started_at, ended_at,
          modality, distance_meters,
          avg_pace_s_per_500m, avg_pace_s_per_km, avg_power_w, stroke_rate_spm,
          avg_hr, max_hr, calories, reps_completed, weight_used_kg,
          source
        ) values (
          ${executionId}, ${templateSegmentId}, ${seg.position},
          ${segStarted.toISOString()}::timestamptz,
          ${segEnded.toISOString()}::timestamptz,
          ${seg.modality}, ${seg.distance_meters ?? null},
          ${seg.avg_pace_s_per_500m ?? null}, ${seg.avg_pace_s_per_km ?? null},
          ${seg.avg_power_w ?? null}, ${seg.stroke_rate_spm ?? null},
          ${seg.avg_hr ?? null}, ${seg.max_hr ?? null}, ${seg.calories ?? null},
          ${seg.reps_completed ?? null}, ${seg.weight_used_kg ?? null},
          ${SEG_SOURCE}
        )
        on conflict (execution_id, position) do update set
          template_segment_id = excluded.template_segment_id,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at,
          modality = excluded.modality,
          distance_meters = excluded.distance_meters,
          avg_pace_s_per_500m = excluded.avg_pace_s_per_500m,
          avg_pace_s_per_km = excluded.avg_pace_s_per_km,
          avg_power_w = excluded.avg_power_w,
          stroke_rate_spm = excluded.stroke_rate_spm,
          avg_hr = excluded.avg_hr,
          max_hr = excluded.max_hr,
          calories = excluded.calories,
          reps_completed = excluded.reps_completed,
          weight_used_kg = excluded.weight_used_kg,
          source = excluded.source,
          updated_at = now()
      `;
      segCount += 1;
    }
    console.log(`[demo-seed] assignment ${assignmentId} (${spec.name_like}) → ${synths.length} segments`);
  }

  console.log(
    `[demo-seed] done — ${execCount} executions, ${segCount} segments for athlete ${ATHLETE_ID} (source='${SEG_SOURCE}', notes flag '${DEMO_FLAG}').`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error('[demo-seed] FAILED:', err);
  process.exit(1);
});
