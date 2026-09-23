/**
 * La ficha contra una base de datos real: marcadores del coach (0233), el
 * calendario, las herramientas de semana (desplazar, copiar, reducir volumen) y
 * guardar un entreno desde el panel (bifurca la plantilla de biblioteca).
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeExercise,
  makeMicrocycle,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';
import { loadAthleteKeyMarkers, loadCoachKeyMarkerKeys, saveCoachKeyMarkers } from '@/lib/coach/key-markers';
import { DEFAULT_KEY_MARKERS } from '@fahybrid/shared/domain/coach/key-markers';
import { loadFichaCalendar } from '@/lib/dashboard/v2/ficha-calendar';
import { applyWeekOp } from '@/lib/dashboard/v2/ficha-week-ops';
import { loadFichaSessionEditor, saveFichaSession } from '@/lib/dashboard/v2/ficha-session';
import { serializeSessionSegments } from '@/lib/dashboard/v2/editor-serialize';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';

const sql = getTestSql();

function iso(d: Date) {
  return isoDateString(d);
}

describeWithDb('ficha del atleta (BD real)', () => {
  let fx: Fixture;
  let exerciseId: number;
  let templateId: number;
  let monday: string;
  let today: string;
  const actor = { kind: 'coach' as const, user_id: null };

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const t = await sql<Array<{ today: string }>>`select to_char((now() at time zone 'Europe/Madrid')::date,'YYYY-MM-DD') as today`;
    today = t[0]!.today;
    monday = iso(addDays(mondayOfWeek(parseIsoDate(today)), 7)); // la semana que viene: todo en el futuro
    await makeMicrocycle({ sql, athleteId: fx.athleteId, startIso: iso(addDays(parseIsoDate(monday), -14)), endIso: iso(addDays(parseIsoDate(monday), 27)) });
    exerciseId = await makeExercise({ fx, name: 'Sentadilla test' });
    templateId = await makeTemplate({ fx, name: 'Fuerza A', format: 'strength_block' });
    const prescription = {
      scheme: 'sets',
      modality: 'strength',
      sets: [1, 2, 3, 4].map(() => ({ measure: { kind: 'reps', value: 5 } })),
    };
    await sql`
      insert into template_segments (template_id, position, exercise_id, params_json, block_position, block_title, prescription_json)
      values (${templateId}, 0, ${exerciseId}, '{}'::jsonb, 0, 'A', ${sql.json(prescription)})
    `;
  });

  afterAll(async () => {
    await sql`delete from coach_key_markers where coach_id = ${fx.coachId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  it('marcadores: sin elegir → defecto; guardar reemplaza en orden', async () => {
    expect(await loadCoachKeyMarkerKeys(fx.coachId, sql)).toEqual([]);
    const def = await loadAthleteKeyMarkers({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    expect(def.map((m) => m.key)).toEqual([...DEFAULT_KEY_MARKERS]);
    expect(def.every((m) => m.value_label == null)).toBe(true);

    await sql`update athletes set max_hr_bpm = 191 where id = ${fx.athleteId}`;
    await sql`insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, recorded_at) values
      (${fx.athleteId}, 'run_5k', 1250, 'seconds', now() - interval '30 days'),
      (${fx.athleteId}, 'run_5k', 1180, 'seconds', now())`;
    await saveCoachKeyMarkers({ coach_id: fx.coachId, keys: ['run_5k', 'max_hr'], client: sql });
    expect(await loadCoachKeyMarkerKeys(fx.coachId, sql)).toEqual(['run_5k', 'max_hr']);
    const mine = await loadAthleteKeyMarkers({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    expect(mine).toMatchObject([
      { key: 'run_5k', value_label: '19:40', trend: 'better' },
      { key: 'max_hr', value_label: '191 ppm' },
    ]);
    await expect(saveCoachKeyMarkers({ coach_id: fx.coachId, keys: ['nope'], client: sql })).rejects.toThrow();
    await sql`delete from athlete_benchmarks where athlete_id = ${fx.athleteId}`;
  });

  it('calendario, desplazar ±N días y deshacer', async () => {
    const tue = iso(addDays(parseIsoDate(monday), 1));
    const id = await makeAssignment({ fx, templateId, scheduledForIso: tue });
    const cal = await loadFichaCalendar({ coach_id: fx.coachId, athlete_id: fx.athleteId, zoom: '3sem', client: sql });
    const s = cal!.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions)).find((x) => x.id === String(id));
    expect(s).toMatchObject({ date: tue, modality: 'fuerza', editable: true, has_content: true });

    const res = await applyWeekOp({ coach_id: fx.coachId, athlete_id: fx.athleteId, week_start: monday, op: { op: 'shift', days: 2 }, actor, client: sql });
    expect(res.moved).toEqual([{ id: String(id), from: tue, to: iso(addDays(parseIsoDate(tue), 2)) }]);
    const after = await sql<Array<{ d: string }>>`select to_char(scheduled_for,'YYYY-MM-DD') as d from workout_assignments where id = ${id}`;
    expect(after[0]!.d).toBe(iso(addDays(parseIsoDate(tue), 2)));
  });

  it('copiar una semana crea copias propias el mismo día de la semana', async () => {
    const res = await applyWeekOp({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      week_start: monday,
      op: { op: 'copy', to_week_start: iso(addDays(parseIsoDate(monday), 7)) },
      actor,
      client: sql,
    });
    expect(res.created.length).toBe(1);
    expect(res.created[0]!.date).toBe(iso(addDays(parseIsoDate(monday), 10)));
    const inst = await sql<Array<{ instance_athlete_id: string | null }>>`
      select t.instance_athlete_id::text from workout_assignments wa join templates t on t.id = wa.template_id
      where wa.id = ${Number(res.created[0]!.id)}`;
    expect(inst[0]!.instance_athlete_id).toBe(String(fx.athleteId));
  });

  it('reducir volumen: bifurca la plantilla de biblioteca y quita series; la biblioteca no cambia', async () => {
    const res = await applyWeekOp({ coach_id: fx.coachId, athlete_id: fx.athleteId, week_start: monday, op: { op: 'scale', pct: 50 }, actor, client: sql });
    expect(res.lines_changed).toBe(1);
    const lib = await sql<Array<{ n: number }>>`
      select jsonb_array_length(prescription_json->'sets')::int as n from template_segments where template_id = ${templateId}`;
    expect(lib[0]!.n).toBe(4);
    const mine = await sql<Array<{ n: number }>>`
      select jsonb_array_length(ts.prescription_json->'sets')::int as n
      from workout_assignments wa join template_segments ts on ts.template_id = wa.template_id
      where wa.athlete_id = ${fx.athleteId} and wa.scheduled_for between ${monday}::date and ${iso(addDays(parseIsoDate(monday), 6))}::date`;
    expect(mine[0]!.n).toBe(2);
  });

  it('escalar volumen también SUBE (factor 1,5): 2 series → 3; el resultado dice cuánto', async () => {
    const res = await applyWeekOp({ coach_id: fx.coachId, athlete_id: fx.athleteId, week_start: monday, op: { op: 'scale', factor: 1.5 }, actor, client: sql });
    expect(res).toMatchObject({ lines_changed: 1, factor: 1.5, pct: -50 });
    const mine = await sql<Array<{ n: number }>>`
      select jsonb_array_length(ts.prescription_json->'sets')::int as n
      from workout_assignments wa join template_segments ts on ts.template_id = wa.template_id
      where wa.athlete_id = ${fx.athleteId} and wa.scheduled_for between ${monday}::date and ${iso(addDays(parseIsoDate(monday), 6))}::date`;
    expect(mine[0]!.n).toBe(3);
  });

  it('guardar desde el panel escribe en la instancia del atleta (y bifurca si hacía falta)', async () => {
    const thu = iso(addDays(parseIsoDate(monday), 17));
    const id = await makeAssignment({ fx, templateId, scheduledForIso: thu });
    const ed = await loadFichaSessionEditor({ coach_id: fx.coachId, athlete_id: fx.athleteId, assignment_id: id, client: sql });
    expect(ed).toMatchObject({ editable: true, shared_template: true, title: 'Fuerza A' });
    const segments = serializeSessionSegments(ed!.model.blocks);
    const out = await saveFichaSession({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      assignment_id: id,
      name: 'Fuerza A (suave)',
      segments,
      actor,
      client: sql,
    });
    expect(out.template_id).not.toBe(templateId);
    const row = await sql<Array<{ name: string; inst: string | null }>>`
      select t.name, t.instance_athlete_id::text as inst from workout_assignments wa join templates t on t.id = wa.template_id where wa.id = ${id}`;
    expect(row[0]).toEqual({ name: 'Fuerza A (suave)', inst: String(fx.athleteId) });
    const libName = await sql<Array<{ name: string }>>`select name from templates where id = ${templateId}`;
    expect(libName[0]!.name).toBe('Fuerza A');
  });

  it('nada de otro coach', async () => {
    const other = await loadFichaCalendar({ coach_id: fx.coachId + 999999, athlete_id: fx.athleteId, zoom: '3sem', client: sql });
    expect(other).toBeNull();
    await expect(
      applyWeekOp({ coach_id: fx.coachId + 999999, athlete_id: fx.athleteId, week_start: monday, op: { op: 'deload' }, actor, client: sql }),
    ).rejects.toThrow();
  });
});
