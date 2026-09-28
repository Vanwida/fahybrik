/**
 * UN SOLO ESCRITOR (docs/DECISIONS.md, 2026-09-28) — contra una rama real de Neon.
 *
 * Un entreno libre del atleta y uno programado por el coach son el MISMO objeto:
 * para la misma sesión, lo que guarda el editor del coach (biblioteca) y lo que
 * guarda el entreno libre (plan para hacer después) son las MISMAS filas de
 * `template_segments` y `template_blocks`. Por formato:
 *
 *   · los que puede escribir el libre (sets, intervals, steady, emom, amrap,
 *     for_time, rounds, warmup): coach y libre, filas idénticas;
 *   · los que solo escribe el coach (tempo, circuit, chipper, superset,
 *     hyrox_sim, test, cooldown): guardar → reabrir en el editor → guardar da las
 *     mismas filas (nada se pierde por el camino, las rondas del circuito tampoco).
 *
 * Nada se simula: cada escritura entra por la función de servidor real
 * (createTemplate/updateTemplate, saveFreeWorkoutPlan) y se lee de la base.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { prescriptionToParams, type Prescription } from '@fahybrid/shared/domain/prescription';
import { saveFreeWorkoutPlan } from '@/lib/athlete/create-free-workout';
import { validateFreeWorkout, type FreeWorkoutRawBody } from '@/lib/athlete/free-workout-validate';
import { createTemplate, TemplateError, updateTemplate } from '@/lib/dashboard/coach/templates';
import { serializeSessionContent, type SessionBlockSerInput } from '@/lib/dashboard/v2/editor-serialize';
import { loadSessionEditorModel } from '@/lib/dashboard/v2/editor-data';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, type Fixture } from '../utils/db-fixtures';

const DB_TIMEOUT = 60_000;
const TITLE = 'Entreno de prueba';
const p = (x: Prescription): Prescription => x;

type Ids = Record<'squat' | 'goblet' | 'clean' | 'row' | 'bike' | 'ski' | 'run' | 'wallball' | 'burpee' | 'stretch', number>;

interface Rows {
  segments: Array<Record<string, unknown>>;
  blocks: Array<Record<string, unknown>>;
}

describeWithDb('un solo escritor de plantillas (rama real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let ids: Ids;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const bySlug = async (slug: string): Promise<number> => {
      const r = await sql<Array<{ id: string }>>`select id::text as id from exercises where slug = ${slug} and coach_id is null limit 1`;
      if (!r[0]) throw new Error(`falta el ejercicio base ${slug} en la rama`);
      return Number(r[0].id);
    };
    ids = {
      squat: await bySlug('back-squat'),
      goblet: await bySlug('goblet-squat'),
      clean: await bySlug('power-clean'),
      row: await bySlug('row'),
      bike: await bySlug('bike-erg'),
      ski: await bySlug('ski-erg'),
      run: await bySlug('run'),
      wallball: await makeExercise({ fx, name: 'Wall ball test', category: 'hyrox_station', modality: 'functional' }),
      burpee: await makeExercise({ fx, name: 'Burpee test', category: 'skill', modality: 'functional' }),
      stretch: await makeExercise({ fx, name: 'Estiramiento test', category: 'mobility', modality: 'mobility' }),
    };
  }, DB_TIMEOUT);

  afterAll(async () => {
    await fx?.cleanup();
    await closeTestSql();
  }, DB_TIMEOUT);

  async function rowsOf(templateId: number): Promise<Rows> {
    const segments = await sql<Array<Record<string, unknown>>>`
      select position, block_position, exercise_id::int as exercise_id, block_format, block_title,
             params_json, notes, prescription_json
      from template_segments where template_id = ${templateId} order by position
    `;
    const blocks = await sql<Array<Record<string, unknown>>>`
      select block_position, rounds, pacing, work_seconds,
             rest_between_stations_seconds, rest_between_rounds_seconds
      from template_blocks where template_id = ${templateId} order by block_position
    `;
    return { segments: [...segments], blocks: [...blocks] };
  }

  async function coachWrite(blocks: SessionBlockSerInput[]): Promise<{ templateId: number; rows: Rows }> {
    const payload = { name: TITLE, format: 'sets', ...serializeSessionContent(blocks) };
    const templateId = Number(await createTemplate({ coach_id: fx.coachId, payload, client: sql }));
    return { templateId, rows: await rowsOf(templateId) };
  }

  /** El mismo recorrido que POST /api/athlete/workouts/free/plan. */
  async function freeWrite(body: FreeWorkoutRawBody): Promise<Rows> {
    const v = validateFreeWorkout(body);
    if (!v.ok) throw new Error(`${v.code}: ${v.message}`);
    const plan = v.plan;
    const base = { athleteId: fx.athleteId, coachId: fx.coachId, title: TITLE, scheme: plan.scheme, sql };
    const out =
      plan.kind === 'measured'
        ? await saveFreeWorkoutPlan({ ...base, kind: 'measured', modality: plan.modality, prescription: plan.prescription })
        : plan.kind === 'clock'
          ? await saveFreeWorkoutPlan({ ...base, kind: 'clock', prescription: plan.prescription })
          : await saveFreeWorkoutPlan({
              ...base,
              kind: 'items',
              items: plan.items.map((it) => ({
                exerciseId: it.exercise_id,
                prescription: it.prescription,
                ...(it.part ? { part: it.part } : {}),
              })),
            });
    const r = await sql<Array<{ template_id: string }>>`
      select template_id::text as template_id from workout_assignments where id = ${Number(out.assignment_id)}
    `;
    return rowsOf(Number(r[0]!.template_id));
  }

  function expectInvariants(rows: Rows): void {
    rows.segments.forEach((s, i) => expect(s.position).toBe(i));
    const positions = [...new Set(rows.segments.map((s) => s.block_position as number))];
    expect(positions).toEqual(positions.map((_, i) => i));
    for (const s of rows.segments) {
      expect(s.params_json).toEqual(prescriptionToParams(s.prescription_json as Prescription));
    }
  }

  // ── Lo que escriben los dos ────────────────────────────────────────────────

  const main = (format: string, items: SessionBlockSerInput['items']): SessionBlockSerInput => ({ title: TITLE, format, items });
  const line = (exercise_id: number, prescription: Prescription) => ({ exercise_id, exercise_name: '', prescription });
  const strengthSets = [
    { measure: { kind: 'reps', value: 5 }, target: { kind: 'kg', value: 100 }, rest_s: 120 },
    { measure: { kind: 'reps', value: 5 }, target: { kind: 'kg', value: 100 }, rest_s: 120 },
    { measure: { kind: 'reps', value: 5 }, target: { kind: 'kg', value: 100 }, rest_s: 120 },
  ] as Prescription['sets'];
  const warmSets = [
    { measure: { kind: 'reps', value: 10 }, target: { kind: 'kg', value: 16 }, rest_s: 60 },
    { measure: { kind: 'reps', value: 10 }, target: { kind: 'kg', value: 16 }, rest_s: 60 },
  ] as Prescription['sets'];
  const pace = { kind: 'pace', unit: 'per_500m', value_s: 120 } as const;

  const SHARED: Array<{
    format: string;
    expectFormat: string[];
    coach: () => SessionBlockSerInput[];
    free: () => FreeWorkoutRawBody;
  }> = [
    {
      format: 'sets',
      expectFormat: ['strength_block'],
      coach: () => [main('strength_block', [line(ids.squat, p({ scheme: 'sets', modality: 'strength', sets: strengthSets }))])],
      free: () => ({
        modality: 'strength',
        items: [{ exercise_id: ids.squat, prescription: { scheme: 'sets', modality: 'strength', sets: strengthSets } }],
      }),
    },
    {
      format: 'intervals (ergo por tiempo)',
      expectFormat: ['intervals'],
      coach: () => [
        main('intervals', [
          line(ids.row, p({ scheme: 'intervals', modality: 'row', rounds: 6, work_s: 180, rest_s: 120, target: { ...pace } })),
        ]),
      ],
      free: () => ({
        modality: 'row',
        prescription: {
          scheme: 'intervals',
          modality: 'row',
          rounds: 6,
          rest_s: 120,
          target: { ...pace },
          sets: [{ measure: { kind: 'duration', seconds: 180 }, target: { ...pace }, modality: 'row', rest_s: 120 }],
        },
      }),
    },
    {
      format: 'steady (continuo de ergo por tiempo)',
      expectFormat: ['tempo'],
      coach: () => [
        main('tempo', [line(ids.bike, p({ scheme: 'steady', modality: 'bike', total_s: 1800, target: { kind: 'hr_zone', value: 2 } }))]),
      ],
      free: () => ({
        modality: 'bike',
        prescription: {
          scheme: 'steady',
          modality: 'bike',
          total_s: 1800,
          target: { kind: 'hr_zone', value: 2 },
          sets: [{ measure: { kind: 'duration', seconds: 1800 }, target: { kind: 'hr_zone', value: 2 }, modality: 'bike' }],
        },
      }),
    },
    {
      format: 'emom',
      expectFormat: ['emom'],
      coach: () => [
        main('emom', [
          line(ids.wallball, p({ scheme: 'emom', modality: 'functional', rounds: 10, work_s: 60, sets: [{ measure: { kind: 'reps', value: 12 } }] })),
          line(ids.burpee, p({ scheme: 'emom', modality: 'functional', rounds: 10, work_s: 60, sets: [{ measure: { kind: 'reps', value: 10 } }] })),
        ]),
      ],
      free: () => ({
        modality: 'functional',
        items: [
          { exercise_id: ids.wallball, prescription: { scheme: 'emom', modality: 'functional', rounds: 10, work_s: 60, sets: [{ measure: { kind: 'reps', value: 12 }, modality: 'functional' }] } },
          { exercise_id: ids.burpee, prescription: { scheme: 'emom', modality: 'functional', rounds: 10, work_s: 60, sets: [{ measure: { kind: 'reps', value: 10 }, modality: 'functional' }] } },
        ],
      }),
    },
    {
      // El fallo nº1: el WOD nacía for_time y el selector solo cambiaba las líneas.
      // El editor viejo mandaba el bloque como for_time; el escritor lo corrige.
      format: 'amrap (bloque que el editor viejo mandaba for_time)',
      expectFormat: ['amrap'],
      coach: () => [
        main('for_time', [
          line(ids.wallball, p({ scheme: 'amrap', modality: 'functional', total_s: 720, sets: [{ measure: { kind: 'reps', value: 10 } }] })),
          line(ids.row, p({ scheme: 'amrap', modality: 'row', total_s: 720, sets: [{ measure: { kind: 'calories', value: 12 } }] })),
        ]),
      ],
      free: () => ({
        modality: 'functional',
        items: [
          { exercise_id: ids.wallball, prescription: { scheme: 'amrap', modality: 'functional', total_s: 720, sets: [{ measure: { kind: 'reps', value: 10 }, modality: 'functional' }] } },
          { exercise_id: ids.row, prescription: { scheme: 'amrap', modality: 'row', total_s: 720, sets: [{ measure: { kind: 'calories', value: 12 }, modality: 'row' }] } },
        ],
      }),
    },
    {
      format: 'for_time',
      expectFormat: ['for_time'],
      coach: () => [
        main('for_time', [
          line(ids.wallball, p({ scheme: 'for_time', modality: 'functional', rounds: 3, total_s: 1080, sets: [{ measure: { kind: 'reps', value: 15 } }] })),
          line(ids.burpee, p({ scheme: 'for_time', modality: 'functional', rounds: 3, total_s: 1080, sets: [{ measure: { kind: 'reps', value: 12 } }] })),
        ]),
      ],
      free: () => ({
        modality: 'functional',
        items: [
          { exercise_id: ids.wallball, prescription: { scheme: 'for_time', modality: 'functional', rounds: 3, total_s: 1080, sets: [{ measure: { kind: 'reps', value: 15 }, modality: 'functional' }] } },
          { exercise_id: ids.burpee, prescription: { scheme: 'for_time', modality: 'functional', rounds: 3, total_s: 1080, sets: [{ measure: { kind: 'reps', value: 12 }, modality: 'functional' }] } },
        ],
      }),
    },
    {
      format: 'rounds',
      expectFormat: ['rounds'],
      coach: () => [
        main('rounds', [
          line(ids.wallball, p({ scheme: 'rounds', modality: 'functional', rounds: 4, rest_s: 60, sets: [{ measure: { kind: 'reps', value: 10 } }] })),
          line(ids.burpee, p({ scheme: 'rounds', modality: 'functional', rounds: 4, rest_s: 60, sets: [{ measure: { kind: 'reps', value: 8 } }] })),
        ]),
      ],
      free: () => ({
        modality: 'functional',
        items: [
          { exercise_id: ids.wallball, prescription: { scheme: 'rounds', modality: 'functional', rounds: 4, rest_s: 60, sets: [{ measure: { kind: 'reps', value: 10 }, modality: 'functional' }] } },
          { exercise_id: ids.burpee, prescription: { scheme: 'rounds', modality: 'functional', rounds: 4, rest_s: 60, sets: [{ measure: { kind: 'reps', value: 8 }, modality: 'functional' }] } },
        ],
      }),
    },
    {
      format: 'warmup (+ fuerza)',
      expectFormat: ['warmup', 'strength_block'],
      coach: () => [
        { title: 'Calentamiento', format: 'warmup', items: [line(ids.goblet, p({ scheme: 'warmup', modality: 'strength', sets: warmSets }))] },
        main('strength_block', [line(ids.squat, p({ scheme: 'sets', modality: 'strength', sets: strengthSets }))]),
      ],
      free: () => ({
        modality: 'strength',
        items: [
          { exercise_id: ids.goblet, part: 'warmup', prescription: { scheme: 'sets', modality: 'strength', sets: warmSets } },
          { exercise_id: ids.squat, prescription: { scheme: 'sets', modality: 'strength', sets: strengthSets } },
        ],
      }),
    },
  ];

  describe('coach y libre escriben las mismas filas', () => {
    for (const c of SHARED) {
      test(
        c.format,
        async () => {
          const coach = (await coachWrite(c.coach())).rows;
          const free = await freeWrite(c.free());
          expect(free).toEqual(coach);
          expectInvariants(coach);
          expect([...new Set(coach.segments.map((s) => s.block_format))]).toEqual(c.expectFormat);
        },
        DB_TIMEOUT,
      );
    }
  });

  // ── Lo que solo escribe el coach: guardar, reabrir, guardar ─────────────────

  const COACH_ONLY: Array<{ format: string; expectFormat: string; blocks: () => SessionBlockSerInput[] }> = [
    {
      format: 'tempo (carrera continua por distancia)',
      expectFormat: 'tempo',
      blocks: () => [main('tempo', [line(ids.run, p({ scheme: 'steady', modality: 'run', sets: [{ measure: { kind: 'distance', meters: 10000 } }], target: { kind: 'hr_zone', value: 2 } }))])],
    },
    {
      format: 'circuit (por reloj, con una estación en calorías)',
      expectFormat: 'circuit',
      blocks: () => [
        {
          title: 'Circuito',
          format: 'circuit',
          circuit: { rounds: 4, pacing: { kind: 'por_reloj', work_seconds: 60 }, rest_between_rounds_seconds: 90 },
          items: [
            line(ids.row, p({ scheme: 'rounds', modality: 'row', sets: [{ measure: { kind: 'calories', value: 15 } }] })),
            line(ids.wallball, p({ scheme: 'rounds', modality: 'functional', rounds: 4, sets: [{ measure: { kind: 'reps', value: 12 } }] })),
          ],
        },
      ],
    },
    {
      format: 'chipper',
      expectFormat: 'chipper',
      blocks: () => [
        main('chipper', [
          line(ids.wallball, p({ scheme: 'chipper', modality: 'functional', total_s: 1800, sets: [{ measure: { kind: 'reps', value: 50 } }] })),
          line(ids.burpee, p({ scheme: 'chipper', modality: 'functional', total_s: 1800, sets: [{ measure: { kind: 'reps', value: 40 } }] })),
        ]),
      ],
    },
    {
      format: 'superset',
      expectFormat: 'superset',
      blocks: () => [
        main('superset', [
          line(ids.squat, p({ scheme: 'superset', modality: 'strength', rest_s: 90, sets: [{ measure: { kind: 'reps', value: 8 }, target: { kind: 'kg', value: 80 } }] })),
          line(ids.clean, p({ scheme: 'superset', modality: 'strength', rest_s: 90, sets: [{ measure: { kind: 'reps', value: 3 }, target: { kind: 'kg', value: 60 } }] })),
        ]),
      ],
    },
    {
      format: 'hyrox_sim',
      expectFormat: 'hyrox_sim',
      blocks: () => [
        main('hyrox_sim', [
          line(ids.run, p({ scheme: 'for_time', modality: 'run', sets: [{ measure: { kind: 'distance', meters: 1000 } }] })),
          line(ids.ski, p({ scheme: 'for_time', modality: 'ski', sets: [{ measure: { kind: 'distance', meters: 1000 } }] })),
        ]),
      ],
    },
    {
      format: 'test',
      expectFormat: 'test',
      blocks: () => [main('test', [line(ids.row, p({ scheme: 'steady', modality: 'row', sets: [{ measure: { kind: 'distance', meters: 2000 } }], target: { kind: 'rpe', value: 10 } }))])],
    },
    {
      format: 'cooldown',
      expectFormat: 'cooldown',
      blocks: () => [main('cooldown', [line(ids.stretch, p({ scheme: 'cooldown', modality: 'mobility', sets: [{ measure: { kind: 'duration', seconds: 300 } }] }))])],
    },
  ];

  describe('solo coach: guardar → reabrir en el editor → guardar da las mismas filas', () => {
    for (const c of COACH_ONLY) {
      test(
        c.format,
        async () => {
          const { templateId, rows: first } = await coachWrite(c.blocks());
          expectInvariants(first);
          expect([...new Set(first.segments.map((s) => s.block_format))]).toEqual([c.expectFormat]);

          const model = await loadSessionEditorModel({ coach_id: fx.coachId, template_id: templateId });
          expect(model).not.toBeNull();
          const again = serializeSessionContent(model!.blocks);
          await updateTemplate({
            coach_id: fx.coachId,
            template_id: templateId,
            payload: { segments: again.segments, blocks: again.blocks },
            client: sql,
          });
          expect(await rowsOf(templateId)).toEqual(first);
        },
        DB_TIMEOUT,
      );
    }

    test(
      'el circuito guarda rondas y pacing en template_blocks y las estaciones no las repiten',
      async () => {
        const { rows } = await coachWrite(COACH_ONLY[1]!.blocks());
        expect(rows.blocks).toEqual([
          {
            block_position: 0,
            rounds: 4,
            pacing: 'por_reloj',
            work_seconds: 60,
            rest_between_stations_seconds: null,
            rest_between_rounds_seconds: 90,
          },
        ]);
        for (const s of rows.segments) expect((s.prescription_json as Prescription).rounds).toBeUndefined();
        expect((rows.segments[0]!.prescription_json as Prescription).sets).toEqual([{ measure: { kind: 'calories', value: 15 } }]);
      },
      DB_TIMEOUT,
    );
  });

  // ── El listón mínimo y el reloj ───────────────────────────────────────────

  test(
    'la biblioteca rechaza una línea que el atleta no podría ejecutar (422) y no escribe nada',
    async () => {
      const blocks = [main('strength_block', [line(ids.squat, p({ scheme: 'sets', modality: 'strength' }))])];
      const payload = { name: TITLE, format: 'sets', ...serializeSessionContent(blocks) };
      const before = await sql<Array<{ n: number }>>`select count(*)::int as n from templates where coach_id = ${fx.coachId}`;
      const err = await createTemplate({ coach_id: fx.coachId, payload, client: sql }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TemplateError);
      expect((err as TemplateError).status).toBe(422);
      expect((err as TemplateError).code).toBe('undosed_line');
      const after = await sql<Array<{ n: number }>>`select count(*)::int as n from templates where coach_id = ${fx.coachId}`;
      expect(after[0]!.n).toBe(before[0]!.n);
    },
    DB_TIMEOUT,
  );

  test(
    'el reloj sin movimientos vive en meta_json.prescription y se retira si la plantilla recibe líneas',
    async () => {
      const clock = p({ scheme: 'amrap', modality: 'functional', total_s: 720 });
      const v = validateFreeWorkout({ modality: 'functional', prescription: clock });
      expect(v.ok).toBe(true);
      const out = await saveFreeWorkoutPlan({
        athleteId: fx.athleteId,
        coachId: fx.coachId,
        title: 'AMRAP · 12:00',
        scheme: 'amrap',
        kind: 'clock',
        prescription: clock,
        sql,
      });
      const [a] = await sql<Array<{ template_id: string }>>`select template_id::text as template_id from workout_assignments where id = ${Number(out.assignment_id)}`;
      const templateId = Number(a!.template_id);
      const [t] = await sql<Array<{ meta_json: Record<string, unknown> }>>`select meta_json from templates where id = ${templateId}`;
      expect(t!.meta_json).toEqual({ origin: 'self', prescription: clock });
      expect((await rowsOf(templateId)).segments).toHaveLength(0);

      const lines = serializeSessionContent([main('amrap', [line(ids.burpee, p({ scheme: 'amrap', total_s: 720, sets: [{ measure: { kind: 'reps', value: 10 } }] }))])]);
      await updateTemplate({ coach_id: fx.coachId, template_id: templateId, payload: { segments: lines.segments, blocks: lines.blocks }, client: sql });
      const [t2] = await sql<Array<{ meta_json: Record<string, unknown> }>>`select meta_json from templates where id = ${templateId}`;
      expect(t2!.meta_json).toEqual({ origin: 'self' });
    },
    DB_TIMEOUT,
  );
});
