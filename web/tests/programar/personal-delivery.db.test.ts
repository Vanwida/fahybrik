import postgres from 'postgres';
import { afterAll, expect, test } from 'vitest';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import { coachActor } from '@/lib/audit/record-edit';
import { loadProgramGrid, writeCells } from '@/lib/dashboard/programming/programs';
import { assertProgramStructureEditable } from '@/lib/dashboard/programming/program-structure';
import { retryProgramDelivery } from '@/lib/dashboard/programming/program-delivery';
import { resolvePersonalPlanChain } from '@/lib/dashboard/coach/personal-plan-chain';
import { addPersonalTramoToChain } from '@/lib/dashboard/coach/personal-plan-chain-mutations';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import { closeTestSql, describeWithDb, getTestDbUrl, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, makeInlineMonthTemplate, makeMonthTemplate, makeTemplate, type Fixture } from '../utils/db-fixtures';

const T = 60_000;
function strengthDay(exerciseId: number): WeekDay {
  return { day_of_week: 1, sessions: [{ kind: 'workout', blocks: [{ uid: 'b', format: 'sets', title: 'Entreno',
    items: [{ uid: 'i', exercise_id: exerciseId, exercise_name: 'Sentadilla', prescription_json: { scheme: 'sets', modality: 'strength',
      sets: [{ measure: { kind: 'reps', value: 8 }, target: { kind: 'rpe', value: 7 } }] } }] }] }] };
}
describeWithDb('programas personales, estructura y entrega recuperable (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];
  afterAll(async () => { while (fixtures.length) await fixtures.pop()!.cleanup(); await closeTestSql(); }, T);
  async function fixture() { const fx = await makeCoachAndAthlete(sql); fixtures.push(fx); return fx; }
  async function track(fx: Fixture, monthId: number) {
    const weeks = await sql<Array<{ id: string }>>`select week_template_id::text as id from program_month_weeks where month_template_id = ${monthId}`;
    fx.monthTemplates.push({ monthId, weekIds: weeks.map((w) => Number(w.id)) });
  }

  test('el primer programa individual abre su editor, recibe entrenos y permanece oculto hasta publicar', async () => {
    const fx = await fixture(); const foreign = await fixture();
    const created = await addPersonalTramoToChain({ coach_id: fx.coachId, athlete_id: fx.athleteId,
      payload: { name: 'Mi primer programa', week_count: 1 }, start_date_when_empty: '2026-10-01',
      actor: coachActor({ user_id: BigInt(fx.coachUserId) }), client: sql });
    const id = Number(created.month_template_id); await track(fx, id);
    expect(created.start_date).toBe('2026-09-28');
    const grid = await loadProgramGrid({ coach_id: fx.coachId, program_id: id, client: sql });
    expect(grid?.program.personal).toEqual({ athlete_id: String(fx.athleteId), athlete_name: 'Test Athlete' });
    expect(await loadProgramGrid({ coach_id: foreign.coachId, program_id: id, client: sql })).toBeNull();
    expect(await resolvePersonalPlanChain({ coach_id: foreign.coachId, athlete_id: fx.athleteId, client: sql })).toEqual([]);
    const ex = await makeExercise({ fx, name: 'Sentadilla personal' });
    const day = strengthDay(ex);
    const saved = await writeCells({ coach_id: fx.coachId, program_id: id,
      cells: [{ week_id: grid!.weeks[0]!.id, day_of_week: 1, day }], client: sql });
    expect(saved.delivery).toMatchObject({ status: 'complete', updated_athletes: 1, pending_week_ids: [] });
    const sessions = await sql<Array<{ id: string }>>`select id::text from workout_assignments where athlete_id = ${fx.athleteId} and scheduled_for = '2026-09-28'`;
    expect(sessions.length).toBeGreaterThan(0);
    const visibility = await sql<Array<{ status: string }>>`select status::text from weekly_plans where athlete_id = ${fx.athleteId} and week_start = '2026-09-28'`;
    expect(visibility[0]?.status).toBe('draft');
  }, T);

  test('una estructura de biblioteca asignada se bloquea antes de mutar; la copia sin asignar sí es editable', async () => {
    const fx = await fixture();
    const tpl = await makeTemplate({ fx, name: 'Biblioteca asignada' });
    const month = await makeMonthTemplate({ fx, weekCount: 1, workoutDays: [1], workoutTemplateId: tpl });
    await expect(assertProgramStructureEditable({ coach_id: fx.coachId, program_id: month.monthId, client: sql })).resolves.toBeUndefined();
    await instantiateMonthFromTemplate({ coach_id: fx.coachId, athlete_id: fx.athleteId, month_template_id: month.monthId, start_date: '2026-10-05', client: sql });
    await expect(assertProgramStructureEditable({ coach_id: fx.coachId, program_id: month.monthId, client: sql })).rejects.toMatchObject({ code: 'assigned_structure', status: 409 });
    const count = await sql<Array<{ n: number }>>`select count(*)::int as n from program_month_weeks where month_template_id = ${month.monthId}`;
    expect(count[0]!.n).toBe(1);
  }, T);

  test('una entrega bloqueada no miente sobre el guardado y se reintenta sin volver a escribir la plantilla', async () => {
    const fx = await fixture(); const second = await fixture();
    await sql`update athletes set coach_id = ${fx.coachId} where id = ${second.athleteId}`;
    const ex = await makeExercise({ fx, name: 'Entrega recuperable' });
    const month = await makeInlineMonthTemplate({ fx, weekCount: 1, dayPlans: [{ day_of_week: 1,
      blocks: [{ title: 'Entreno', format: 'sets', items: [{ exercise_id: ex, exercise_name: 'Sentadilla', params_json: { sets: 3, reps: 8 } }] }] }] });
    for (const athleteId of [fx.athleteId, second.athleteId]) await instantiateMonthFromTemplate({ coach_id: fx.coachId, athlete_id: athleteId,
      month_template_id: month.monthId, start_date: '2026-10-05', client: sql });
    const locker = postgres(getTestDbUrl()!, { ssl: 'require', max: 1, prepare: false });
    let locked!: () => void; const ready = new Promise<void>((resolve) => { locked = resolve; });
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    const holding = locker.begin(async (tx) => { await tx`select id from microcycles where athlete_id = ${second.athleteId} for update`; locked(); await held; });
    await Promise.race([ready, holding.then(() => { throw new Error('No se retuvo el bloqueo de prueba.'); })]);
    await sql`set lock_timeout = '100ms'`;
    try {
      const saved = await writeCells({ coach_id: fx.coachId, program_id: month.monthId, client: sql,
        cells: [{ week_id: String(month.weekIds[0]), day_of_week: 1, day: strengthDay(ex) }] });
      expect(saved.weeks).toEqual([String(month.weekIds[0])]);
      expect(saved.delivery).toMatchObject({ status: 'partial', updated_athletes: 1, failed_athlete_ids: [String(second.athleteId)], pending_week_ids: [String(month.weekIds[0])] });
    } finally { release(); await holding; await locker.end(); await sql`set lock_timeout = '0'`; }
    const before = await sql<Array<{ slots_json: unknown }>>`select slots_json from program_week_templates where id = ${month.weekIds[0]!}`;
    const delivered = await retryProgramDelivery({ coach_id: fx.coachId, program_id: month.monthId, week_ids: [String(month.weekIds[0])], client: sql });
    expect(delivered).toMatchObject({ status: 'complete', updated_athletes: 2, pending_week_ids: [] });
    const after = await sql<Array<{ slots_json: unknown }>>`select slots_json from program_week_templates where id = ${month.weekIds[0]!}`;
    expect(after).toEqual(before);
    expect(await retryProgramDelivery({ coach_id: second.coachId, program_id: month.monthId, week_ids: [String(month.weekIds[0])], client: sql })).toBeNull();
  }, T);

  test('el contenido imposible de entregar conserva el plan anterior y avisa qué semana necesita corrección', async () => {
    const fx = await fixture(); const foreign = await fixture();
    const ex = await makeExercise({ fx, name: 'Contenido válido' });
    const month = await makeInlineMonthTemplate({ fx, weekCount: 1, dayPlans: [{ day_of_week: 1,
      blocks: [{ title: 'Entreno', format: 'sets', items: [{ exercise_id: ex, exercise_name: 'Sentadilla', params_json: { sets: 3, reps: 8 } }] }] }] });
    await instantiateMonthFromTemplate({ coach_id: fx.coachId, athlete_id: fx.athleteId, month_template_id: month.monthId, start_date: '2026-10-05', client: sql });
    const before = await sql<Array<{ id: string; template_id: string }>>`select id::text, template_id::text from workout_assignments where athlete_id = ${fx.athleteId}`;
    expect(before.length).toBeGreaterThan(0);
    const inaccessible = await makeTemplate({ fx: foreign, name: 'De otro entrenador' });
    await expect(writeCells({ coach_id: fx.coachId, program_id: month.monthId, client: sql,
      cells: [{ week_id: String(month.weekIds[0]), day_of_week: 1, day: { day_of_week: 1, sessions: [{ kind: 'workout', template_id: inaccessible }] } }] })).rejects.toMatchObject({ code: 'invalid_reference' });
    const saved = await writeCells({ coach_id: fx.coachId, program_id: month.monthId, client: sql,
      cells: [{ week_id: String(month.weekIds[0]), day_of_week: 1, day: { day_of_week: 1, sessions: [{ kind: 'workout',
        blocks: [{ uid: 'empty', title: 'Borrador sin ejercicios', format: 'sets', items: [] }] }] } }] });
    expect(saved.delivery).toMatchObject({ status: 'partial', updated_athletes: 0, failed_athlete_ids: [String(fx.athleteId)], incomplete_week_ids: [String(month.weekIds[0])] });
    const after = await sql<Array<{ id: string; template_id: string }>>`select id::text, template_id::text from workout_assignments where athlete_id = ${fx.athleteId}`;
    expect(after).toEqual(before);
    const corrected = await writeCells({ coach_id: fx.coachId, program_id: month.monthId, client: sql,
      cells: [{ week_id: String(month.weekIds[0]), day_of_week: 1, day: strengthDay(ex) }] });
    expect(corrected.delivery).toMatchObject({ status: 'complete', updated_athletes: 1, pending_week_ids: [] });
  }, T);
});
