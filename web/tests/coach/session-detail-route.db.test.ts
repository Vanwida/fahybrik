// GET /api/coach/athletes/[id]/sessions/[session_id]/detail — el CONTRATO de la
// ruta, clavado antes de tocarla.
//
// Esta ruta era una de las "mixtas": orquestaba a mano el cargador de la
// asignación, los agregados de la ejecución y el cumplimiento por tramo con SQL
// suelto encima. Al extraer esa orquestación a `lib/coach/session-detail.ts` para
// que la comparta el conector MCP, lo único que no puede cambiar es lo que sale
// por el cable. Este suite lo fija: la forma completa del payload con una sesión
// de verdad (plantilla con dos líneas prescritas, ejecución con dos laps
// medidos), el 404 del atleta ajeno y el 404 del entreno inexistente.
//
// Handlers reales contra DB real (rama Neon): solo se mockea la sesión de coach,
// que es la frontera de auth. La ruta usa `@/lib/db`, así que el runner apunta
// DATABASE_URL y TEST_DATABASE_URL a la misma rama.

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeExercise,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { GET } = await import(
  '@/app/api/coach/athletes/[id]/sessions/[session_id]/detail/route'
);

type CoachSession = NonNullable<Awaited<ReturnType<typeof getCoachSession>>>;

function sessionFor(fx: Fixture): CoachSession {
  return { coach_id: BigInt(fx.coachId) } as unknown as CoachSession;
}

const ctx = (athleteId: number, sessionId: number) => ({
  params: Promise.resolve({ id: String(athleteId), session_id: String(sessionId) }),
});

const req = () => new Request('http://localhost/api/coach/athletes/1/sessions/1/detail');

/** El tramo prescrito de una serie de 1000 m con banda de ritmo. */
function runSet(meters: number, minPaceS: number, maxPaceS: number) {
  return {
    measure: { kind: 'distance', meters },
    target: { kind: 'pace', unit: 'per_km', min_s: minPaceS, max_s: maxPaceS },
    rest_s: 120,
  };
}

describeWithDb('GET .../sessions/[session_id]/detail — contrato (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  let clubA: Fixture;
  let clubB: Fixture;
  let assignmentId = 0;
  let emptyAssignmentId = 0;
  let executionId = 0;
  let segmentIds: number[] = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);

    const exerciseId = await makeExercise({
      fx: clubA,
      name: 'Carrera',
      category: 'cardio',
      modality: 'run',
    });
    const templateId = await makeTemplate({ fx: clubA, name: 'Series 4×1000', format: 'intervals' });

    // Dos líneas prescritas en el mismo bloque: la primera se corre dentro de
    // banda, la segunda fuera. Así el payload lleva veredictos de los dos signos
    // y no solo el feliz.
    const segRows = await sql<Array<{ id: string }>>`
      insert into template_segments (
        template_id, position, block_position, block_format, block_title,
        exercise_id, params_json, prescription_json, notes
      )
      values
        (
          ${templateId}, 0, 0, 'intervals', 'Series',
          ${exerciseId},
          ${sql.json({ distance_meters: 1000, sets: 1 })},
          ${sql.json({ scheme: 'intervals', modality: 'run', sets: [runSet(1000, 240, 250)] })},
          'Primera serie'
        ),
        (
          ${templateId}, 1, 0, 'intervals', 'Series',
          ${exerciseId},
          ${sql.json({ distance_meters: 1000, sets: 1 })},
          ${sql.json({ scheme: 'intervals', modality: 'run', sets: [runSet(1000, 240, 250)] })},
          null
        )
      returning id::text as id
    `;
    segmentIds = segRows.map((r) => Number(r.id));

    assignmentId = await makeAssignment({
      fx: clubA,
      templateId,
      scheduledForIso: '2026-08-03',
      status: 'completed',
      notes: 'coach_title: Series de calidad\nQue no se pase de ritmo',
    });

    const execRows = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
        perceived_exertion, notes, score_time_s, perceived_difficulty, pain_area, pain_note
      )
      values (
        ${assignmentId}, ${clubA.athleteId},
        '2026-08-03T07:00:00Z', '2026-08-03T08:02:00Z', 3720,
        8, 'Las dos primeras bien, la última me costó', 2450,
        'as_expected', 'rodilla', 'Molestia leve al acabar'
      )
      returning id::text as id
    `;
    executionId = Number(execRows[0]!.id);

    await sql`
      insert into workout_traces (execution_id, signal, source, started_at, offsets_s, values)
      values (
        ${executionId}, 'distance', 'gps', '2026-08-03T07:00:00Z',
        ${[0, 60, 120]}::int[], ${[0, 200, 400]}::real[]
      )
    `;

    await sql`
      insert into segment_executions (
        execution_id, template_segment_id, position, modality, started_at, ended_at,
        distance_meters, avg_pace_s_per_km, avg_hr, source
      )
      values
        (
          ${executionId}, ${segmentIds[0]}, 0, 'run',
          '2026-08-03T07:10:00Z', '2026-08-03T07:14:05Z',
          1000, 245, 168, 'gps'
        ),
        (
          ${executionId}, ${segmentIds[1]}, 1, 'run',
          '2026-08-03T07:16:00Z', '2026-08-03T07:21:00Z',
          1000, 300, 160, 'gps'
        )
    `;

    // Una plantilla SIN ejercicios: el estado honesto de "no hay contenido"
    // (distinto de un error), y una sesión aún por hacer.
    const emptyTemplateId = await makeTemplate({ fx: clubA, name: 'Plantilla vacía' });
    emptyAssignmentId = await makeAssignment({
      fx: clubA,
      templateId: emptyTemplateId,
      scheduledForIso: '2026-08-04',
      status: 'scheduled',
    });
  });

  afterAll(async () => {
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('la sesión completa: prescrito, ejecutado y cumplimiento por tramo', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(sessionFor(clubA));

    const res = await GET(req(), ctx(clubA.athleteId, assignmentId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session: Record<string, unknown>;
    };
    const s = body.session;

    expect(s.assignment_id).toBe(String(assignmentId));
    expect(s.iso_date).toBe('2026-08-03');
    expect(s.status).toBe('completed');
    // El título por-asignación del coach viaja decodificado de wa.notes, y su
    // nota libre aparte.
    expect(s.display_title).toBe('Series de calidad');
    expect(s.coach_notes).toBe('Que no se pase de ritmo');
    expect(s.content_state).toBe('blocks');
    expect(s.origin).toBe('coach');
    expect(s.template_name).toBe('Series 4×1000');

    // Prescrito: un bloque con las dos líneas, con su prescripción estructurada.
    const workout = s.workout as { name: string; blocks: Array<Record<string, unknown>> };
    expect(workout.name).toBe('Series 4×1000');
    expect(workout.blocks).toHaveLength(1);
    const items = workout.blocks[0]!.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]!.uid).toBe(`segment-${segmentIds[0]}`);
    expect(items[0]!.exercise_name).toBe('Carrera');
    expect((items[0]!.prescription_json as { modality: string }).modality).toBe('run');

    // Ejecutado: el agregado real del atleta.
    const execution = s.execution as Record<string, unknown>;
    expect(execution.duration_min).toBe(62);
    expect(execution.rpe).toBe(8);
    expect(execution.ended_at).toBe('2026-08-03 08:02:00+00');
    expect(execution.score_label).toBe('40:50');
    expect(execution.athlete_notes).toBe('Las dos primeras bien, la última me costó');
    expect(execution.perceived_difficulty).toBe('as_expected');
    expect(execution.pain_area).toBe('rodilla');
    expect(execution.pain_note).toBe('Molestia leve al acabar');

    // Lo hecho tramo a tramo, atribuido a su línea prescrita.
    const actuals = s.segment_actuals as Array<Record<string, unknown>>;
    expect(actuals).toHaveLength(2);
    expect(actuals[0]!.item_uid).toBe(`segment-${segmentIds[0]}`);
    expect(actuals[0]!.avg_pace_s_per_km).toBe(245);
    expect(actuals[0]!.distance_meters).toBe(1000);
    expect(actuals[1]!.avg_pace_s_per_km).toBe(300);

    // Y el veredicto por tramo contra la banda prescrita: 4:05 entra en
    // 4:00-4:10, 5:00 se va por lento.
    const compliance = s.run_compliance as {
      summary: Record<string, unknown>;
      tramos: Array<Record<string, unknown>>;
    };
    expect(compliance.tramos).toHaveLength(2);
    expect(compliance.tramos[0]).toEqual({
      item_uid: `segment-${segmentIds[0]}`,
      position: 0,
      verdict: 'dentro',
    });
    expect(compliance.tramos[1]!.verdict).toBe('fuera_lento');
    expect(compliance.summary).toMatchObject({
      total: 2,
      evaluable: 2,
      dentro: 1,
      fuera_lento: 1,
      sin_dato: 0,
      pct_dentro: 50,
    });
  });

  test('sesión hecha con traza: 200, available, curva vacía (el peek no deriva)', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(sessionFor(clubA));

    const res = await GET(req(), ctx(clubA.athleteId, assignmentId));
    expect(res.status).toBe(200);
    const { session } = (await res.json()) as {
      session: {
        execution: {
          trace: {
            available: boolean;
            splits: unknown[];
            display_curve: { pace: unknown; hr: unknown };
          };
        };
      };
    };

    expect(session.execution.trace.available).toBe(true);
    expect(session.execution.trace.splits).toEqual([]);
    expect(session.execution.trace.display_curve).toEqual({ pace: null, hr: null });
    expect(executionId).toBeGreaterThan(0);
  });

  test('una plantilla sin ejercicios: no_content y cero invención', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(sessionFor(clubA));

    const res = await GET(req(), ctx(clubA.athleteId, emptyAssignmentId));
    expect(res.status).toBe(200);
    const { session } = (await res.json()) as { session: Record<string, unknown> };

    expect(session.content_state).toBe('no_content');
    expect(session.workout).toBeNull();
    // El nombre de la plantilla sobrevive aunque no haya bloques que pintar.
    expect(session.template_name).toBe('Plantilla vacía');
    expect(session.execution).toBeNull();
    expect(session.segment_actuals).toEqual([]);
    expect((session.run_compliance as { tramos: unknown[] }).tramos).toEqual([]);
  });

  test('atleta de otro club: 404 y ni un dato de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(sessionFor(clubB));

    const res = await GET(req(), ctx(clubA.athleteId, assignmentId));
    expect(res.status).toBe(404);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('Atleta no encontrado');
    expect(text).not.toContain('Series');
  });

  test('sesión que no existe bajo un atleta propio: 404 de entreno', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(sessionFor(clubA));

    const res = await GET(req(), ctx(clubA.athleteId, 2_147_483_600));
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).toContain('Entreno no encontrado');
  });

  test('sin sesión de coach: 401 antes de tocar la DB', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);

    const res = await GET(req(), ctx(clubA.athleteId, assignmentId));
    expect(res.status).toBe(401);
  });
});
