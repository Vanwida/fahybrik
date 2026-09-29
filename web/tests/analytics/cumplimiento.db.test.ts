/**
 * El cumplimiento contra una base REAL (rama Neon desechable; se salta, nunca en
 * verde falso, sin TEST_DATABASE_URL). Recorre el cargador entero sobre un atleta
 * con todo lo que decide el caso: una sesión grabada tramo a tramo (series de
 * carrera con piernas y una tabla de fuerza), una importada sin tramos, una
 * perdida, la de hoy pendiente, un libre y un entreno fuera del plan (carga sí,
 * adherencia no), una semana en borrador y un día de pausa. Y la paridad: la ruta
 * del atleta y la del coach, y el panel y su detalle, dicen lo mismo (A1).
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import { cargarDetalleCumplimiento } from '@/lib/analytics/cumplimiento';
import { cargarPanel } from '@/lib/analytics/panel';
import { declararUmbral } from '@/lib/analytics/declaraciones';
import { desdeSesionDeAtleta, verificarAtletaDelCoach } from '@/lib/analytics/atleta-verificado';
import { loadCompliancePct } from '@/lib/coach/compliance-window';
import type { FilaSesion, Lectura } from '@fahybrid/shared/domain/analytics';
import { closeTestSql, describeWithDb, getTestSql, settleCleanup } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

// Lunes 15 de junio de 2026, media mañana en Madrid.
const NOW = new Date('2026-06-15T10:00:00.000Z');

function porId(ls: readonly Lectura[], id: string): Lectura {
  const l = ls.find((x) => x.id === id);
  if (!l) throw new Error(`falta ${id}: ${ls.map((x) => x.id).join(', ')}`);
  return l;
}

describeWithDb('cumplimiento (base real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let otro: Fixture;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    otro = await makeCoachAndAthlete(sql);
    await sql`update athletes set timezone = 'Europe/Madrid', max_hr_bpm = 190 where id = ${fx.athleteId}`;
    const atleta = desdeSesionDeAtleta({ athlete_id: fx.athleteId });
    // Umbral de carrera declarado de un toque (270 s/km): la Z5 del estándar es 4:24–4:28.
    await declararUmbral(atleta, { kind: 'run_s_per_km', value: 270 }, sql);

    const correr = await makeExercise({ fx, name: 'Carrera', category: 'cardio', modality: 'run' });
    const sentadilla = await makeExercise({ fx, name: 'Sentadilla', category: 'strength', modality: 'strength' });

    const series = await makeTemplate({ fx, name: 'Series + fuerza', format: 'intervals' });
    const [lineaSeries, lineaFuerza] = await sql<Array<{ id: string }>>`
      insert into template_segments (template_id, position, exercise_id, block_position, block_format, prescription_json)
      values
        (${series}, 0, ${correr}, 0, 'intervals', ${sql.json({ scheme: 'intervals', modality: 'run', rounds: 3, rest_s: 120, target: { kind: 'hr_zone', value: 5 }, sets: [{ measure: { kind: 'distance', meters: 1000 } }] })}),
        (${series}, 1, ${sentadilla}, 1, 'sets', ${sql.json({ scheme: 'sets', modality: 'strength', sets: [1, 2, 3].map(() => ({ measure: { kind: 'reps', value: 5 }, target: { kind: 'rir', value: 2 } })) })})
      returning id::text as id
    `;
    const rodaje = await makeTemplate({ fx, name: 'Rodaje', format: 'steady' });
    await sql`
      insert into template_segments (template_id, position, exercise_id, block_position, block_format, prescription_json)
      values (${rodaje}, 0, ${correr}, 0, 'steady', ${sql.json({ scheme: 'steady', modality: 'run', total_s: 1800, target: { kind: 'hr_zone', value: 2 } })})
    `;

    const ejecucion = async (assignmentId: number | null, inicio: string, segundos: number, metros: number | null) => {
      const rows = await sql<Array<{ id: string }>>`
        insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, total_distance_m, source, off_plan_reason)
        values (${assignmentId}, ${fx.athleteId}, ${inicio}::timestamptz, ${inicio}::timestamptz + make_interval(secs => ${segundos}), ${segundos}, ${metros}, 'manual', ${assignmentId == null ? 'no_assignment' : null})
        returning id::text as id
      `;
      return Number(rows[0]!.id);
    };

    // 1 · Lunes 8: series + fuerza, grabada tramo a tramo.
    ids.series = await makeAssignment({ fx, templateId: series, scheduledForIso: '2026-06-08', status: 'completed' });
    const e1 = await ejecucion(ids.series, '2026-06-08T18:00:00+02:00', 2400, 3050);
    const pierna = (pos: number, leg: number, rol: 'work' | 'recovery', segundos: number, metros: number, ritmo: number) => sql`
      insert into segment_executions (execution_id, position, template_segment_id, started_at, ended_at, modality, exercise_id, distance_meters, avg_pace_s_per_km, leg_index, leg_role, leg_phase)
      values (${e1}, ${pos}, ${Number(lineaSeries!.id)}, ${'2026-06-08T18:00:00+02:00'}::timestamptz + make_interval(secs => ${pos * 400}), ${'2026-06-08T18:00:00+02:00'}::timestamptz + make_interval(secs => ${pos * 400 + segundos}), 'run', ${correr}, ${metros}, ${ritmo}, ${leg}, ${rol}, 'main')
    `;
    await pierna(0, 0, 'work', 266, 1000, 266); // dentro
    await pierna(1, 1, 'recovery', 110, 250, 440); // controlada
    await pierna(2, 2, 'work', 262, 1000, 262); // dentro por la holgura (264 − 3)
    await pierna(3, 3, 'recovery', 150, 330, 455); // se pasó del descanso (120 + 10 %)
    await pierna(4, 4, 'work', 275, 1000, 275); // lenta (268 + 3)
    const [fuerza] = await sql<Array<{ id: string }>>`
      insert into segment_executions (execution_id, position, template_segment_id, started_at, ended_at, modality, exercise_id, reps_completed)
      values (${e1}, 5, ${Number(lineaFuerza!.id)}, '2026-06-08T18:40:00+02:00', '2026-06-08T18:50:00+02:00', 'strength', ${sentadilla}, 14)
      returning id::text as id
    `;
    await sql`
      insert into set_executions (segment_execution_id, set_index, reps_prescribed, reps_actual, load_prescribed_kg, load_actual_kg, rir, status)
      values
        (${Number(fuerza!.id)}, 1, 5, 5, 100, 100, 2, 'done'),
        (${Number(fuerza!.id)}, 2, 5, 5, 100, 100, 2, 'done'),
        (${Number(fuerza!.id)}, 3, 5, 4, 100, 100, 1, 'scaled')
    `;

    // 2 · Miércoles 10: rodaje importado sin tramos (25′ de 30′).
    ids.importada = await makeAssignment({ fx, templateId: rodaje, scheduledForIso: '2026-06-10', status: 'completed' });
    await ejecucion(ids.importada, '2026-06-10T19:00:00+02:00', 1500, null);
    // 3 · Viernes 12: sin hacer. 4 · Hoy: pendiente.
    ids.perdida = await makeAssignment({ fx, templateId: rodaje, scheduledForIso: '2026-06-12' });
    ids.hoy = await makeAssignment({ fx, templateId: rodaje, scheduledForIso: '2026-06-15' });
    // 5 · Un libre hecho el jueves 11 y un entreno fuera del plan el sábado 13.
    const libre = await makeAssignment({ fx, templateId: rodaje, scheduledForIso: '2026-06-11', status: 'completed' });
    await sql`update workout_assignments set origin = 'self' where id = ${libre}`;
    await ejecucion(libre, '2026-06-11T08:00:00+02:00', 1200, null);
    await ejecucion(null, '2026-06-13T09:00:00+02:00', 900, null);
    // 6 · Una semana en borrador (sin hacer: no existe para el atleta) y un día de pausa.
    await sql`insert into weekly_plans (athlete_id, week_start, status) values (${fx.athleteId}, '2026-06-01', 'draft')`;
    ids.borrador = await makeAssignment({ fx, templateId: rodaje, scheduledForIso: '2026-06-03' });
    await sql`insert into athlete_pauses (athlete_id, start_date, end_date, reason, requested_by) values (${fx.athleteId}, '2026-05-27', '2026-05-28', 'vacaciones', 'athlete')`;
    ids.pausa = await makeAssignment({ fx, templateId: rodaje, scheduledForIso: '2026-05-27' });
  });

  afterAll(async () => {
    await settleCleanup(async () => {
      await sql`delete from athlete_declared_thresholds where athlete_id in (${fx.athleteId}, ${otro.athleteId})`;
      await fx.cleanup();
      await otro.cleanup();
    });
    await closeTestSql();
  });

  const detalle = () => cargarDetalleCumplimiento({ atleta: desdeSesionDeAtleta({ athlete_id: fx.athleteId }), ventana: '4s', now: NOW, client: sql });
  const sesion = (ss: readonly FilaSesion[], id: number) => ss.find((s) => s.assignment_id === String(id));

  test('la adherencia es LA de todas las superficies: solo lo debido, sin libre ni fuera del plan', async () => {
    const d = await detalle();
    const adh = porId(d.lecturas, 'semanas.adherencia');
    expect(adh.dato!.valor).toBe(67); // 2 de 3: el lunes, el miércoles; el viernes no
    expect(adh.dato!.valor).toBe(await loadCompliancePct({ athlete_id: fx.athleteId, on_date: NOW, days: 28, client: sql }));
    expect(adh.reparto!.partes.map((p) => [p.code, p.valor])).toEqual([['hechas', 2], ['no_hechas', 1]]);
    expect(d.sin_plan.sesiones).toBe(2);
  });

  test('cada sesión con su estado; lo oculto no existe; la pausa se enseña excluida', async () => {
    const d = await detalle();
    expect(sesion(d.sesiones, ids.perdida!)).toMatchObject({ estado: 'no_hecha', color: 'rojo', debida: true });
    expect(sesion(d.sesiones, ids.hoy!)).toMatchObject({ estado: 'pendiente', color: null, debida: false });
    expect(sesion(d.sesiones, ids.borrador!)).toBeUndefined();
    expect(sesion(d.sesiones, ids.pausa!)).toMatchObject({ estado: 'excluida', debida: false });
    // La más reciente primero.
    expect(d.sesiones.map((s) => s.dia)).toEqual([...d.sesiones.map((s) => s.dia)].sort().reverse());
  });

  test('la importada sin tramos: 25′ de 30′ por duración, verde; sin detalle tramo a tramo', async () => {
    const s = sesion((await detalle()).sesiones, ids.importada!)!;
    expect(s.bases.find((b) => b.base === 'carga')).toMatchObject({ comparable: false, motivo: 'hecho_sin_saber' });
    expect(s).toMatchObject({ base: 'duracion', plan: 1800, hecho: 1500, color: 'verde', estado: 'cumplida' });
    expect(s.tramos.detalle).toBe('sin_detalle');
  });

  test('la grabada tramo a tramo: cada pierna con su banda y la fuerza serie a serie', async () => {
    const s = sesion((await detalle()).sesiones, ids.series!)!;
    // La distancia es la base que sabe el plan (la fuerza por reps no escribe reloj ni carga).
    expect(s).toMatchObject({ base: 'distancia', plan: 3000, hecho: 3050, color: 'verde' });
    const [carrera, fuerza] = s.lineas;
    expect(carrera!.tramos.map((t) => [t.papel, t.veredicto])).toEqual([
      ['trabajo', 'dentro'],
      ['recuperacion', 'dentro'],
      ['trabajo', 'dentro'],
      ['recuperacion', 'por_encima'],
      ['trabajo', 'por_debajo'],
    ]);
    expect(carrera!.tramos[0]!.comprobaciones.find((c) => c.eje === 'ritmo')).toMatchObject({ objetivo: { min: 264, max: 268, ancla: 'declarada' }, holgura: 3 });
    expect(fuerza!.tramos[0]!.series.map((x) => x.veredicto)).toEqual(['dentro', 'dentro', 'por_debajo']);
    expect(fuerza!.tramos[0]!.veredicto).toBe('por_debajo');
    // El trabajo, aparte de las recuperaciones: 2 de 4 tramos dentro.
    expect(s.tramos).toMatchObject({ total: 4, evaluables: 4, dentro: 2, por_debajo: 2, recuperaciones: { total: 2, dentro: 1, fuera: 1 } });
  });

  test('las tres lecturas en el bloque semanas del panel son EXACTAMENTE las del detalle (A1)', async () => {
    const d = await detalle();
    const panel = await cargarPanel({ atleta: desdeSesionDeAtleta({ athlete_id: fx.athleteId }), ventana: '4s', now: NOW, client: sql });
    for (const id of ['semanas.cumplimiento', 'semanas.adherencia', 'semanas.tramos']) {
      expect(porId(panel.bloques.semanas, id)).toEqual(porId(d.lecturas, id));
    }
    expect(porId(d.lecturas, 'semanas.tramos').dato!.valor).toBe(50);
    // Un libre no es plan: la semana del 8 planifica las tres del coach, no cuatro.
    const sesiones = porId(panel.bloques.semanas, 'semanas.sesiones');
    expect(sesiones.serie!.plan!.find((p) => p.t === '2026-06-08')!.v).toBe(3);
  });

  test('un cálculo, dos pintores: la ruta del coach devuelve exactamente lo mismo (A1)', async () => {
    const comoAtleta = await detalle();
    const verificado = await verificarAtletaDelCoach(fx.athleteId, fx.coachId, sql);
    expect(verificado).not.toBeNull();
    const comoCoach = await cargarDetalleCumplimiento({ atleta: verificado!, ventana: '4s', now: NOW, client: sql });
    expect({ ...comoCoach, generado_iso: null }).toEqual({ ...comoAtleta, generado_iso: null });
    expect(await verificarAtletaDelCoach(fx.athleteId, otro.coachId, sql)).toBeNull();
  });

  test('«todo» es la historia del plan: empieza en su primera sesión', async () => {
    const d = await cargarDetalleCumplimiento({ atleta: desdeSesionDeAtleta({ athlete_id: fx.athleteId }), ventana: 'todo', now: NOW, client: sql });
    expect(d.ventana).toMatchObject({ clave: 'todo', desde: '2026-05-27', anterior: null });
  });

  test('el atleta vacío: las tres sin dato, por «plan»', async () => {
    const d = await cargarDetalleCumplimiento({ atleta: desdeSesionDeAtleta({ athlete_id: otro.athleteId }), ventana: 'todo', now: NOW, client: sql });
    expect(d.lecturas.map((l) => [l.estado, l.cobertura.falta])).toEqual([
      ['sin_dato', { por: 'plan' }],
      ['sin_dato', { por: 'plan' }],
      ['sin_dato', { por: 'plan' }],
    ]);
    expect(d.sesiones).toEqual([]);
  });
});
