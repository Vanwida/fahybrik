// Guardar un entreno de correr con entorno, aviso y frase para el reloj, por la
// RUTA REAL del panel del coach (PATCH /api/coach/athletes/:id/sessions/:id/editor)
// contra una base de datos real (rama Neon desechable):
//   · lo que el editor compone (cinta al 1 %, aviso, frase) llega a la base tal cual
//     y el GET lo devuelve igual (nada se pierde por el camino),
//   · un tramo que el Zod compartido rechaza (pista con inclinación, aviso sin
//     objetivo, frase de 81 caracteres) NO se guarda y el coach recibe un 4xx,
//   · tenencia: un coach ajeno no puede guardar en el entreno de otro.

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeExercise,
  makeMicrocycle,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';
import {
  prescriptionFromStructure,
  type RunStructure,
  type Segment,
} from '@fahybrid/shared/domain/prescription';
import { RUN_CUE_MAX_LENGTH } from '@fahybrid/shared/domain/prescription/run-structure';
import { serializeSessionContent } from '@/lib/dashboard/v2/editor-serialize';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
const { getCoachSession } = await import('@/lib/auth/coach-session');
const route = await import('@/app/api/coach/athletes/[id]/sessions/[session_id]/editor/route');

const work = (extra: Partial<Segment> = {}): Segment => ({
  kind: 'work',
  measure: { type: 'duration', s: 60 },
  target: { type: 'pace_zone', zone: 4 },
  ...extra,
});
const rec = (extra: Partial<Segment> = {}): Segment => ({
  kind: 'recovery',
  measure: { type: 'duration', s: 60 },
  target: null,
  recovery_mode: 'trote',
  ...extra,
});
const cinta = { environment: 'cinta' as const, incline_pct: 1 };

describeWithDb('guardar el editor de correr con campos del reloj (base real)', () => {
  const sql = getTestSql();
  let a: Fixture;
  let b: Fixture;
  let exerciseId: number;
  let assignmentId: number;
  const asCoach = (fx: Fixture) =>
    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(fx.coachId), user_id: BigInt(fx.coachUserId) } as never);

  /** Lo que envía el panel al guardar: segmentos serializados con la misma función del cliente. */
  const bodyFor = (structure: RunStructure) => ({
    name: 'Series en cinta',
    ...serializeSessionContent([
      {
        title: 'Principal',
        items: [
          {
            exercise_id: exerciseId,
            exercise_name: 'Run',
            exercise_modality: 'run',
            prescription: prescriptionFromStructure(structure),
          },
        ],
      },
    ]),
  });
  const patch = (fx: Fixture, body: unknown) => {
    asCoach(fx);
    return route.PATCH(
      new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: String(a.athleteId), session_id: String(assignmentId) }) },
    );
  };
  const storedStructure = async () => {
    const rows = await sql<Array<{ structure: unknown }>>`
      select ts.prescription_json -> 'structure' as structure
      from workout_assignments wa join template_segments ts on ts.template_id = wa.template_id
      where wa.id = ${assignmentId}`;
    return rows[0]?.structure;
  };

  beforeAll(async () => {
    // Nunca contra producción: el arnés apunta la app a TEST_DATABASE_URL y su guarda
    // rechaza el host de main, pero esta suite escribe, así que se comprueba dos veces.
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
    a = await makeCoachAndAthlete(sql);
    b = await makeCoachAndAthlete(sql);
    const today = (await sql<Array<{ d: string }>>`select to_char((now() at time zone 'Europe/Madrid')::date,'YYYY-MM-DD') as d`)[0]!.d;
    const monday = isoDateString(addDays(mondayOfWeek(parseIsoDate(today)), 7)); // futuro: editable
    await makeMicrocycle({ sql, athleteId: a.athleteId, startIso: isoDateString(addDays(parseIsoDate(monday), -14)), endIso: isoDateString(addDays(parseIsoDate(monday), 27)) });
    exerciseId = await makeExercise({ fx: a, category: 'cardio', modality: 'run', slug: `run-wrist-${Date.now()}` });
    const templateId = await makeTemplate({ fx: a, name: 'Series', format: 'strength_block' });
    assignmentId = await makeAssignment({ fx: a, templateId, scheduledForIso: isoDateString(addDays(parseIsoDate(monday), 2)) });
  }, 60_000);

  afterAll(async () => {
    await a.cleanup();
    await b.cleanup();
    await closeTestSql();
  });

  test('cinta al 1 %, aviso y frase se guardan tal cual y el GET los devuelve', async () => {
    const structure: RunStructure = [
      { role: 'warmup', elements: [work({ target: { type: 'hr_zone', zone: 1 }, measure: { type: 'duration', s: 600 }, ...cinta, cue: 'mirar el pulso' })] },
      {
        role: 'main',
        elements: [
          { times: 6, elements: [work({ ...cinta, alert: 'ambos', cue: 'sin pasarte' }), rec({ ...cinta, environment: 'cinta' })] },
        ],
      },
    ];
    const res = await patch(a, bodyFor(structure));
    expect(res.status).toBe(200);

    const saved = await storedStructure();
    expect(saved).toEqual(structure);

    asCoach(a);
    const got = await route.GET(new Request('http://x'), {
      params: Promise.resolve({ id: String(a.athleteId), session_id: String(assignmentId) }),
    });
    const editor = ((await got.json()) as { editor: { model: { blocks: Array<{ items: Array<{ prescription: { structure?: unknown } }> }> } } }).editor;
    expect(editor.model.blocks[0]!.items[0]!.prescription.structure).toEqual(structure);
  }, 60_000);

  test('un tramo que el Zod compartido rechaza no se guarda: pista con inclinación, aviso sin objetivo, frase de 81', async () => {
    const before = await storedStructure();
    const bad: Array<[string, Segment, string]> = [
      ['pista con inclinación', work({ environment: 'pista', incline_pct: 3 }), 'La pista no tiene inclinación: usa cinta o calle para una cuesta.'],
      ['aviso con RPE', work({ target: { type: 'rpe', value: 8 }, alert: 'arriba' }), 'Un aviso necesita un objetivo de ritmo, zona o pulso que medir.'],
      [`frase de ${RUN_CUE_MAX_LENGTH + 1}`, work({ cue: 'x'.repeat(RUN_CUE_MAX_LENGTH + 1) }), `La frase del reloj admite hasta ${RUN_CUE_MAX_LENGTH} caracteres.`],
    ];
    for (const [caso, seg, mensaje] of bad) {
      const res = await patch(a, bodyFor([{ role: 'main', elements: [seg] }]));
      expect(res.status, caso).toBe(400);
      // El coach lee el mensaje del modelo, no el volcado del validador.
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error, caso).toEqual({ code: 'invalid_payload', message: mensaje });
    }
    expect(await storedStructure()).toEqual(before);
  }, 60_000);

  test('tenencia: otro coach no guarda en el entreno de este', async () => {
    const before = await storedStructure();
    const res = await patch(b, bodyFor([{ role: 'main', elements: [work({ cue: 'intruso' })] }]));
    expect(res.status).toBe(404);
    expect(await storedStructure()).toEqual(before);
  }, 60_000);
});
