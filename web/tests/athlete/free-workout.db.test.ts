/**
 * Real-DB tests for the entreno-libre persistence (lib/athlete/create-free-workout)
 * and the athlete exercise catalog (lib/athlete/exercise-catalog).
 *
 * createFreeWorkout persists a self-origin assignment through the existing path:
 * a per-athlete instance template (format = scheme, meta_json.origin='self') + N
 * ordered template_segments (one per exercise line) + a workout_assignments row
 * (origin='self', today) + a recorded execution — all in ONE transaction. These
 * tests exercise the two ITEM-built shapes (strength set-tables, functional metcon)
 * plus the CLOCK (a functional format run bare, no movements named → zero segments
 * and the shape on meta_json) end to end, and assert the mig-0053 modality
 * COHERENCE override (the exercise is the single source of truth, so the persisted
 * prescription's modality is the exercise's, never the client's).
 *
 * Nothing is mocked (project rule). Each test seeds its own fixtures via
 * makeCoachAndAthlete/makeExercise and tears them down (segments + executions
 * cascade from the template/assignment delete).
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import type { Measure, Prescription } from '@fahybrid/shared/domain/prescription';
import { createFreeWorkout } from '@/lib/athlete/create-free-workout';
import { loadAthleteExerciseCatalog } from '@/lib/athlete/exercise-catalog';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeExercise,
  makeFreeAthlete,
  type Fixture,
} from '../utils/db-fixtures';

/** Typed prescription builder — contextual typing narrows the literal unions. */
const p = (pres: Prescription): Prescription => pres;

type SegmentRow = {
  position: number;
  exercise_id: string;
  block_position: number;
  block_format: string | null;
  block_title: string | null;
  prescription_json: { scheme?: string; modality?: string } & Record<string, unknown>;
};

// createFreeWorkout awaits a post-commit coach-attention recompute (real DB
// rollup); on a freshly-woken Neon branch the first call pays cold-start latency,
// so allow generous headroom over the 5s default.
const DB_TIMEOUT = 30_000;

describeWithDb('entreno libre — createFreeWorkout + exercise catalog (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  async function newFixture(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    return fx;
  }

  async function readAssignment(assignmentId: number) {
    const rows = await sql<
      Array<{ template_id: string; origin: string; scheduled_for: string; status: string }>
    >`
      select template_id::text as template_id, origin::text as origin,
             to_char(scheduled_for, 'YYYY-MM-DD') as scheduled_for, status::text as status
      from workout_assignments where id = ${assignmentId} limit 1
    `;
    return rows[0]!;
  }

  async function readSegments(templateId: number): Promise<SegmentRow[]> {
    return sql<SegmentRow[]>`
      select position, exercise_id::text as exercise_id, block_position,
             block_format, block_title, prescription_json
      from template_segments where template_id = ${templateId} order by position
    `;
  }

  test('strength free workout persists 2 ordered set-table segments + coherence override', async () => {
    const fx = await newFixture();
    const squat = await makeExercise({ fx, name: 'Back Squat', modality: 'strength', category: 'strength' });
    const bench = await makeExercise({ fx, name: 'Bench Press', modality: 'strength', category: 'strength' });

    const result = await createFreeWorkout({
      athleteId: fx.athleteId,
      coachId: fx.coachId,
      title: 'Fuerza libre',
      scheme: 'sets',
      metrics: { perceived_exertion: 7 },
      kind: 'items',
      // Client-sent prescription modality is deliberately WRONG ('other'/'core') to
      // prove the server overrides it with the exercise's modality ('strength').
      items: [
        {
          exerciseId: squat,
          prescription: p({
            scheme: 'sets',
            modality: 'other',
            sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 80 } }],
          }),
        },
        {
          exerciseId: bench,
          prescription: p({
            scheme: 'sets',
            modality: 'core',
            sets: [{ measure: { kind: 'reps', value: 8 }, target: { kind: 'rpe', value: 8 } }],
          }),
        },
      ],
      sql,
    });

    const asg = await readAssignment(Number(result.assignment_id));
    expect(asg.origin).toBe('self');
    expect(asg.status).toBe('completed'); // recorder flips full → completed
    expect(asg.scheduled_for).toBe(isoDateString(startOfDayInBox(new Date())));

    const templateId = Number(asg.template_id);
    const tpl = await sql<Array<{ format: string; iaid: string | null; meta_json: unknown }>>`
      select format::text as format, instance_athlete_id::text as iaid, meta_json
      from templates where id = ${templateId} limit 1
    `;
    expect(tpl[0]!.format).toBe('sets');
    expect(Number(tpl[0]!.iaid)).toBe(fx.athleteId); // kept OUT of the coach library
    expect(tpl[0]!.meta_json).toMatchObject({ origin: 'self' });

    const segs = await readSegments(templateId);
    expect(segs).toHaveLength(2);
    expect(segs.map((s) => s.position)).toEqual([1, 2]);
    expect(segs.map((s) => Number(s.exercise_id))).toEqual([squat, bench]); // execution order
    expect(segs.every((s) => Number(s.block_position) === 1)).toBe(true);
    expect(segs.every((s) => s.block_format === 'sets')).toBe(true);
    expect(segs.every((s) => s.block_title === 'Fuerza libre')).toBe(true);
    expect(segs.map((s) => s.prescription_json.scheme)).toEqual(['sets', 'sets']);
    // Coherence: modality is the EXERCISE's, never the client's 'other'/'core'.
    expect(segs.map((s) => s.prescription_json.modality)).toEqual(['strength', 'strength']);

    const exec = await sql<Array<{ id: string }>>`
      select id::text as id from workout_executions where assignment_id = ${Number(result.assignment_id)}
    `;
    expect(exec).toHaveLength(1);
    expect(Number(result.execution_id)).toBe(Number(exec[0]!.id));
  }, DB_TIMEOUT);

  test('functional AMRAP free workout persists 3 segments sharing the metcon scheme', async () => {
    const fx = await newFixture();
    const wallball = await makeExercise({ fx, name: 'Wall Ball', modality: 'functional', category: 'hyrox_station' });
    const burpee = await makeExercise({ fx, name: 'Burpee', modality: 'functional', category: 'plyometric' });
    const rowCal = await makeExercise({ fx, name: 'Row Calories', modality: 'functional', category: 'cardio' });

    const amrapItem = (id: number, measure: Measure) => ({
      exerciseId: id,
      prescription: p({ scheme: 'amrap', total_s: 720, sets: [{ measure }] }),
    });

    const result = await createFreeWorkout({
      athleteId: fx.athleteId,
      coachId: fx.coachId,
      title: 'AMRAP 12',
      scheme: 'amrap',
      metrics: { perceived_exertion: 9, score_rounds: 6, score_reps: 10 },
      kind: 'items',
      items: [
        amrapItem(wallball, { kind: 'reps', value: 15 }),
        amrapItem(burpee, { kind: 'reps', value: 12 }),
        amrapItem(rowCal, { kind: 'calories', value: 10 }),
      ],
      sql,
    });

    const asg = await readAssignment(Number(result.assignment_id));
    expect(asg.origin).toBe('self');

    const templateId = Number(asg.template_id);
    const tpl = await sql<Array<{ format: string }>>`
      select format::text as format from templates where id = ${templateId} limit 1
    `;
    expect(tpl[0]!.format).toBe('amrap');

    const segs = await readSegments(templateId);
    expect(segs).toHaveLength(3);
    expect(segs.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(segs.map((s) => Number(s.exercise_id))).toEqual([wallball, burpee, rowCal]);
    expect(segs.every((s) => s.block_format === 'amrap')).toBe(true);
    expect(segs.every((s) => s.prescription_json.scheme === 'amrap')).toBe(true);
    // Coherence: every functional movement is stamped modality 'functional'.
    expect(segs.every((s) => s.prescription_json.modality === 'functional')).toBe(true);
  }, DB_TIMEOUT);

  // The box CLOCK: the athlete hit Empezar on an EMOM and never named a movement.
  // Nothing about that session is missing — the format, the duration and the
  // effort are all real — so it persists like any other libre, minus the segments
  // there is no honest exercise for. The shape survives on the template's
  // meta_json, which is what the week reader colours and times the day with.
  test('functional CLOCK (no items) persists: zero segments, shape on meta_json, execution recorded', async () => {
    const fx = await newFixture();

    const clock = p({
      scheme: 'emom',
      modality: 'functional',
      rounds: 10,
      work_s: 45,
      rest_s: 15,
    });

    const result = await createFreeWorkout({
      athleteId: fx.athleteId,
      coachId: fx.coachId,
      title: 'EMOM 10 · 45/15',
      scheme: 'emom',
      metrics: { perceived_exertion: 8, total_duration_seconds: 600, completeness: 'full' },
      kind: 'clock',
      prescription: clock,
      sql,
    });

    const asg = await readAssignment(Number(result.assignment_id));
    expect(asg.origin).toBe('self');
    expect(asg.status).toBe('completed');
    expect(asg.scheduled_for).toBe(isoDateString(startOfDayInBox(new Date())));

    const templateId = Number(asg.template_id);
    const tpl = await sql<
      Array<{ format: string; name: string; iaid: string | null; meta_json: Record<string, unknown> }>
    >`
      select format::text as format, name, instance_athlete_id::text as iaid, meta_json
      from templates where id = ${templateId} limit 1
    `;
    expect(tpl[0]!.format).toBe('emom');
    expect(tpl[0]!.name).toBe('EMOM 10 · 45/15');
    expect(Number(tpl[0]!.iaid)).toBe(fx.athleteId); // still OUT of the coach library
    // Provenance AND shape: the prescription is the only record of what ran.
    expect(tpl[0]!.meta_json).toMatchObject({
      origin: 'self',
      prescription: { scheme: 'emom', modality: 'functional', rounds: 10, work_s: 45, rest_s: 15 },
    });

    // No movement was named, so no segment is invented for one.
    expect(await readSegments(templateId)).toHaveLength(0);

    // The measured reality IS persisted — this is the whole point of saving it.
    const exec = await sql<Array<{ id: string; secs: number | null; rpe: number | null }>>`
      select id::text as id, total_duration_seconds as secs, perceived_exertion as rpe
      from workout_executions where assignment_id = ${Number(result.assignment_id)}
    `;
    expect(exec).toHaveLength(1);
    expect(exec[0]!.secs).toBe(600);
    expect(exec[0]!.rpe).toBe(8);
  }, DB_TIMEOUT);

  // CARD 120 — un entreno libre reenviado es el MISMO entreno.
  //
  // El 20-ago, al vaciarse la cola de reintentos del iPhone, un libre entró dos
  // veces: dos sesiones de 11:28 con los mismos ocho tramos y los mismos metros
  // para un trabajo que ocurrió una sola vez. Una sesión del plan no puede
  // duplicarse (una ejecución por asignación); un libre no tenía esa red.
  test('el mismo libre reenviado no crea una segunda sesión (card 120)', async () => {
    const fx = await newFixture();
    const empezoA = '2026-08-19T09:21:28.000Z';
    const cuerpo = {
      athleteId: fx.athleteId,
      coachId: fx.coachId,
      title: 'Cinta + fuerza',
      scheme: 'emom' as const,
      metrics: {
        perceived_exertion: 9,
        total_duration_seconds: 688,
        completeness: 'full' as const,
        started_at: empezoA,
        ended_at: '2026-08-19T09:34:43.000Z',
      },
      kind: 'clock' as const,
      prescription: p({ scheme: 'emom', modality: 'functional', rounds: 8, work_s: 60, rest_s: 0 }),
      sql,
    };

    const primero = await createFreeWorkout(cuerpo);
    const segundo = await createFreeWorkout(cuerpo);

    // Mismo entreno, misma fila: el reenvío devuelve lo que ya había.
    expect(segundo.assignment_id).toBe(primero.assignment_id);
    expect(segundo.execution_id).toBe(primero.execution_id);

    const cuantas = await sql<Array<{ n: string }>>`
      select count(*)::text as n
      from workout_assignments
      where athlete_id = ${fx.athleteId} and origin = 'self'
    `;
    expect(Number(cuantas[0]!.n)).toBe(1);

    // Y se archiva en el día en que se entrenó, no en el de la subida.
    const asg = await readAssignment(Number(primero.assignment_id));
    expect(asg.scheduled_for).toBe('2026-08-19');
  }, DB_TIMEOUT);

  // Dos entrenos DISTINTOS del mismo día siguen siendo dos: la llave es el
  // instante de arranque, y un atleta no empieza dos cosas a la vez.
  test('dos libres del mismo día con arranques distintos siguen siendo dos', async () => {
    const fx = await newFixture();
    const base = {
      athleteId: fx.athleteId,
      coachId: fx.coachId,
      title: 'Cinta',
      scheme: 'emom' as const,
      kind: 'clock' as const,
      prescription: p({ scheme: 'emom', modality: 'functional', rounds: 6, work_s: 60, rest_s: 0 }),
      sql,
    };
    const manana = await createFreeWorkout({
      ...base,
      metrics: { total_duration_seconds: 363, started_at: '2026-08-19T08:29:45.000Z' },
    });
    const mediodia = await createFreeWorkout({
      ...base,
      metrics: { total_duration_seconds: 421, started_at: '2026-08-19T09:09:03.000Z' },
    });
    expect(mediodia.assignment_id).not.toBe(manana.assignment_id);
  }, DB_TIMEOUT);

  test('FREE athlete (no coach) saves the libre — athlete-owned instance, zero coach surface', async () => {
    // Requires migration 0141 (templates_owner_chk) on the branch. Against a
    // pre-0141 branch this test is RED (templates.coach_id NOT NULL rejects the
    // insert) — expected until the migration is applied on deploy.
    const fx = await makeFreeAthlete(sql);
    cleanups.push(fx.cleanup);
    // BASE exercise (coach_id null) — the only catalog a coachless athlete sees.
    const press = await makeExercise({ fx, name: 'Push Press', modality: 'strength', category: 'strength' });

    const result = await createFreeWorkout({
      athleteId: fx.athleteId,
      coachId: null,
      title: 'Libre free',
      scheme: 'sets',
      metrics: { perceived_exertion: 6 },
      kind: 'items',
      items: [
        {
          exerciseId: press,
          prescription: p({ scheme: 'sets', sets: [{ measure: { kind: 'reps', value: 8 } }] }),
        },
      ],
      sql,
    });

    // Created exactly like the coached path: self-origin, today, recorded.
    const asg = await readAssignment(Number(result.assignment_id));
    expect(asg.origin).toBe('self');
    expect(asg.status).toBe('completed');
    expect(asg.scheduled_for).toBe(isoDateString(startOfDayInBox(new Date())));

    // The instance template is ATHLETE-owned: no coach behind it (0141).
    const tpl = await sql<Array<{ coach_id: string | null; iaid: string | null }>>`
      select coach_id::text as coach_id, instance_athlete_id::text as iaid
      from templates where id = ${Number(asg.template_id)} limit 1
    `;
    expect(tpl[0]!.coach_id).toBeNull();
    expect(Number(tpl[0]!.iaid)).toBe(fx.athleteId);

    // Zero notification: no coach → the attention recompute no-ops, so no
    // workout_libre (nor any) attention row ever appears for this athlete.
    const attention = await sql<Array<{ n: number }>>`
      select count(*)::int as n from coach_attention_items where athlete_id = ${fx.athleteId}
    `;
    expect(attention[0]!.n).toBe(0);
  }, DB_TIMEOUT);

  test('unknown exercise id → exercise_not_found (nothing persisted)', async () => {
    const fx = await newFixture();
    const known = await makeExercise({ fx, name: 'Known Lift', modality: 'strength', category: 'strength' });

    await expect(
      createFreeWorkout({
        athleteId: fx.athleteId,
        coachId: fx.coachId,
        title: 'Broken',
        scheme: 'sets',
        metrics: {},
        kind: 'items',
        items: [
          { exerciseId: known, prescription: p({ scheme: 'sets', sets: [{ measure: { kind: 'reps', value: 5 } }] }) },
          { exerciseId: 2147483000, prescription: p({ scheme: 'sets', sets: [{ measure: { kind: 'reps', value: 5 } }] }) },
        ],
        sql,
      }),
    ).rejects.toMatchObject({ code: 'exercise_not_found' });

    // The failure is BEFORE the tx (resolution) → no assignment for this athlete today.
    const asg = await sql<Array<{ id: string }>>`
      select id::text as id from workout_assignments
      where athlete_id = ${fx.athleteId} and origin = 'self'
        and scheduled_for = ${isoDateString(startOfDayInBox(new Date()))}::date
    `;
    expect(asg).toHaveLength(0);
  }, DB_TIMEOUT);

  test('athlete exercise catalog returns rows and filters by search/category', async () => {
    const fx = await newFixture();
    const suffix = Math.random().toString(36).slice(2, 8);
    const slugA = `freewk-alpha-${suffix}`;
    const slugB = `freewk-beta-${suffix}`;
    const alpha = await makeExercise({ fx, name: 'Zulu Alpha Lift', slug: slugA, modality: 'strength', category: 'strength' });
    const beta = await makeExercise({ fx, name: 'Zulu Beta Run', slug: slugB, modality: 'run', category: 'cardio' });

    // Base catalog is non-empty (the branch carries the seeded global catalog).
    const all = await loadAthleteExerciseCatalog(sql, { coachId: fx.coachId, limit: 500 });
    expect(all.length).toBeGreaterThan(0);

    // Wire contract: id is NUMERIC (iOS decodes `id: Int`; a `::text` id here
    // broke the picker decode on-device — never mask this with Number() again).
    expect(all.every((r) => typeof r.id === 'number')).toBe(true);

    // Search narrows to the single matching slug and exposes its modality.
    const filtered = await loadAthleteExerciseCatalog(sql, { coachId: fx.coachId, search: slugA, limit: 500 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe(alpha);
    expect(filtered[0]!.modality).toBe('strength');
    expect(filtered[0]!.slug).toBe(slugA);

    // Category filter is honoured (cardio search finds beta, excludes the strength one).
    const cardio = await loadAthleteExerciseCatalog(sql, {
      coachId: fx.coachId,
      category: 'cardio',
      search: `freewk-`,
      limit: 500,
    });
    const cardioIds = cardio.map((r) => Number(r.id));
    expect(cardioIds).toContain(beta);
    expect(cardioIds).not.toContain(alpha);
    expect(cardio.every((r) => r.category === 'cardio')).toBe(true);

    // A coachless athlete (null coach) still gets the base catalog.
    const noCoach = await loadAthleteExerciseCatalog(sql, { coachId: null, search: slugA, limit: 500 });
    expect(noCoach.map((r) => Number(r.id))).toContain(alpha);
  }, DB_TIMEOUT);
});
