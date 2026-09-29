/**
 * El panel de analíticas contra una base REAL (rama Neon desechable; se salta,
 * nunca en verde falso, sin TEST_DATABASE_URL). Recorre el cargador entero:
 * contexto en el día local, anclas resueltas (un umbral declarado de un toque),
 * lo hecho preciado tramo a tramo, lo planificado desde la prescripción, la
 * proyección hasta la carrera y la paridad atleta ↔ coach (A1).
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import { cargarPanel } from '@/lib/analytics/panel';
import { declararUmbral } from '@/lib/analytics/declaraciones';
import { desdeSesionDeAtleta, verificarAtletaDelCoach } from '@/lib/analytics/atleta-verificado';
import { loadAnclasAtleta } from '@/lib/analytics/anclas';
import { idsRepetidos } from '@fahybrid/shared/domain/analytics/panel';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { closeTestSql, describeWithDb, getTestSql, settleCleanup } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

// Lunes 15 de junio de 2026, media mañana en Madrid.
const NOW = new Date('2026-06-15T10:00:00.000Z');
const HOY = '2026-06-15';

function porId(ls: readonly Lectura[], id: string): Lectura {
  const l = ls.find((x) => x.id === id);
  if (!l) throw new Error(`falta ${id}: ${ls.map((x) => x.id).join(', ')}`);
  return l;
}

describeWithDb('panel de analíticas (base real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let otro: Fixture;
  let templateId: number;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    otro = await makeCoachAndAthlete(sql);
    await sql`update athletes set timezone = 'Europe/Madrid', max_hr_bpm = 190 where id = ${fx.athleteId}`;

    const correr = await makeExercise({ fx, name: 'Carrera continua', category: 'cardio', modality: 'run' });
    const sentadilla = await makeExercise({ fx, name: 'Sentadilla', category: 'strength', modality: 'strength' });
    templateId = await makeTemplate({ fx, name: 'Rodaje + fuerza', format: 'intervals' });
    await sql`
      insert into template_segments (template_id, position, exercise_id, block_position, block_format, prescription_json)
      values
        (${templateId}, 0, ${correr}, 0, 'steady', ${sql.json({ scheme: 'steady', modality: 'run', total_s: 1800, target: { kind: 'hr_zone', value: 2 } })}),
        (${templateId}, 1, ${sentadilla}, 1, 'sets', ${sql.json({ scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'rir', value: 2 } }] })})
    `;

    // Tres sesiones hechas en su día local: con pulso, con RPE, y sin nada.
    const hecha = async (dia: string, hora: string, total: number, rpe: number | null, segmento: { seconds: number; avg_hr: number | null; pace: number | null } | null) => {
      const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: dia, status: 'completed' });
      const started = `${dia}T${hora}:00+02:00`;
      const rows = await sql<Array<{ id: string }>>`
        insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, perceived_exertion, source)
        values (${assignmentId}, ${fx.athleteId}, ${started}::timestamptz, ${started}::timestamptz + make_interval(secs => ${total}), ${total}, ${rpe}, 'manual')
        returning id::text as id
      `;
      if (segmento) {
        await sql`
          insert into segment_executions (execution_id, position, started_at, ended_at, modality, exercise_id, avg_hr, avg_pace_s_per_km)
          values (${Number(rows[0]!.id)}, 0, ${started}::timestamptz, ${started}::timestamptz + make_interval(secs => ${segmento.seconds}), 'run', ${correr}, ${segmento.avg_hr}, ${segmento.pace})
        `;
      }
    };
    await hecha('2026-06-10', '19:00', 1800, null, { seconds: 1800, avg_hr: 150, pace: 300 });
    await hecha('2026-06-12', '07:30', 3600, 6, null);
    await hecha('2026-06-13', '00:30', 1200, null, null); // 00:30 en Madrid: el 13, no el 12

    // Dos sesiones planificadas hasta la carrera, a diez días.
    await makeAssignment({ fx, templateId, scheduledForIso: '2026-06-17' });
    await makeAssignment({ fx, templateId, scheduledForIso: '2026-06-20' });
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority, race_date, status)
      values (${fx.athleteId}, 'HYROX Test', 'hyrox', 'singles', 'open', 'men', 'target', '2026-06-25'::date, 'planned')
    `;
  });

  afterAll(async () => {
    await settleCleanup(async () => {
      await sql`delete from races where athlete_id in (${fx.athleteId}, ${otro.athleteId})`;
      await fx.cleanup();
      await otro.cleanup();
    });
    await closeTestSql();
  });

  test('sin umbral declarado, el pulso solo tiene la máxima → estimada; declararlo de un toque lo sube a declarada', async () => {
    const atleta = desdeSesionDeAtleta({ athlete_id: fx.athleteId });
    const antes = await loadAnclasAtleta(atleta, sql);
    expect(antes.pulso).toMatchObject({ ancla: 'estimada', fuente: 'from_max_hr' });
    expect(antes.pulso!.valor).toBeCloseTo(167.2, 5);

    const despues = await declararUmbral(atleta, { kind: 'lthr_bpm', value: 170 }, sql);
    expect(despues.anclas.pulso).toMatchObject({ valor: 170, ancla: 'declarada', fuente: 'declarada_atleta' });
    expect(despues.declaraciones).toEqual([expect.objectContaining({ kind: 'lthr_bpm', value: 170, declared_by: 'athlete' })]);
  });

  test('el panel: lo hecho preciado en su día, la cobertura con su falta, el plan y la proyección hasta la carrera', async () => {
    const atleta = desdeSesionDeAtleta({ athlete_id: fx.athleteId });
    const panel = await cargarPanel({ atleta, ventana: '4s', now: NOW, client: sql });

    expect(panel.ventana).toMatchObject({ clave: '4s', hasta: HOY, desde: '2026-05-19', dias: 28 });
    expect(panel.historia).toMatchObject({ desde: '2026-06-10', cubre_todo: true });
    expect(panel.pendientes).toEqual(['intensidad', 'carrera', 'recuperacion']);
    expect(idsRepetidos(panel.bloques)).toEqual([]);
    expect(panel.anclas.pulso).toMatchObject({ valor: 170, ancla: 'declarada' });

    // LA COBERTURA: 1800 s por pulso contra el umbral declarado, 3600 s por
    // esfuerzo, 1200 s sin saber (la sesión de las 00:30 del día 13).
    const cobertura = porId(panel.bloques.forma, 'carga.cobertura');
    const parte = (code: string) => cobertura.reparto!.partes.find((p) => p.code === code)!.valor;
    expect(parte('declarada')).toBe(1800);
    expect(parte('esfuerzo')).toBe(3600);
    expect(parte('sin_saber')).toBe(1200);
    expect(cobertura.dato!.valor).toBeCloseTo((5400 / 6600) * 100, 6);

    // LA FRESCURA: número sí; la palabra, retirada (arranque en frío: 5 días de 42).
    const frescura = porId(panel.bloques.forma, 'carga.frescura');
    expect(frescura.estado).toBe('medida');
    expect(frescura.veredicto).toBeNull();
    expect(frescura.cobertura.falta).toEqual({ por: 'historia', llevas: 5, hacen: 42 });
    expect(frescura.procedencia.ancla).toBe('declarada');
    expect(frescura.serie!.puntos).toHaveLength(28);
    expect(frescura.serie!.referencias!.map((r) => r.valor)).toEqual([-30, -11, 4, 29]);
    // La proyección viaja como plan de la misma serie: diez días hasta la carrera.
    expect(frescura.serie!.plan).toHaveLength(10);
    expect(frescura.serie!.plan![9]!.t).toBe('2026-06-25');

    // LA CARGA DEL DÍA 10: 1800 s a 150 ppm contra 170 → IF 0,882 → 38,9.
    const forma = porId(panel.bloques.forma, 'carga.fondo');
    const dia10 = forma.serie!.puntos.find((p) => p.t === '2026-06-10')!;
    expect(dia10.v).toBeGreaterThan(0);

    // LAS SEMANAS: la del 8 al 14 lleva las tres sesiones (la de las 00:30 cae el 13, no el 12).
    const sesiones = porId(panel.bloques.semanas, 'semanas.sesiones');
    expect(sesiones.serie!.puntos.find((p) => p.t === '2026-06-08')!.v).toBe(3);
    expect(sesiones.dato!.valor).toBe(3);
    const carga = porId(panel.bloques.semanas, 'semanas.carga');
    expect(carga.serie!.plan!.find((p) => p.t === '2026-06-08')!.v).toBeGreaterThan(0); // 30′ en Z2 se sabe; la fuerza por reps, no
    expect(porId(panel.bloques.semanas, 'semanas.carga.correr').familia).toBe('correr');

    // LA PROYECCIÓN: con carrera y plan, pero con la línea de fuerza sin saber → suelo, sin palabra.
    const proyeccion = porId(panel.bloques.forma, 'carga.proyeccion');
    expect(proyeccion.estado).toBe('medida');
    expect(proyeccion.cobertura.muestras).toBe(2);
    expect(proyeccion.veredicto).toBeNull();
    expect(proyeccion.procedencia.explica_es).toMatch(/2 líneas del plan no dicen/);

    // EL ESTADO: copias sin serie, y el readiness (sin señal: falta el dispositivo).
    const estado = panel.bloques.estado;
    expect(estado.map((l) => l.id)).toEqual(['estado.readiness', 'estado.forma', 'estado.fatiga', 'estado.frescura']);
    expect(porId(estado, 'estado.forma').serie).toBeNull();
    expect(porId(estado, 'estado.forma').dato!.valor).toBe(forma.dato!.valor);
  });

  test('un cálculo, dos pintores: la ruta del coach devuelve exactamente lo mismo (A1)', async () => {
    const comoAtleta = await cargarPanel({ atleta: desdeSesionDeAtleta({ athlete_id: fx.athleteId }), ventana: '12s', now: NOW, client: sql });
    const verificado = await verificarAtletaDelCoach(fx.athleteId, fx.coachId, sql);
    expect(verificado).not.toBeNull();
    const comoCoach = await cargarPanel({ atleta: verificado!, ventana: '12s', now: NOW, client: sql });
    const sinFecha = (p: typeof comoAtleta) => ({ ...p, generado_iso: null });
    expect(sinFecha(comoCoach)).toEqual(sinFecha(comoAtleta));
  });

  test('el ámbito de club: el atleta de otro coach no existe para éste', async () => {
    expect(await verificarAtletaDelCoach(fx.athleteId, otro.coachId, sql)).toBeNull();
    expect(await verificarAtletaDelCoach(otro.athleteId, fx.coachId, sql)).toBeNull();
    expect(await verificarAtletaDelCoach(0, fx.coachId, sql)).toBeNull();
  });

  test('el atleta vacío: todo sin dato, con el plazo, y sin ids repetidos', async () => {
    const panel = await cargarPanel({ atleta: desdeSesionDeAtleta({ athlete_id: otro.athleteId }), ventana: 'todo', now: NOW, client: sql });
    expect(panel.ventana).toMatchObject({ clave: 'todo', dias: 1, anterior: null });
    expect(panel.historia.semanas).toBeNull();
    expect(panel.bloques.forma.every((l) => l.estado === 'sin_dato')).toBe(true);
    expect(porId(panel.bloques.forma, 'carga.proyeccion').cobertura.falta).toEqual({ por: 'objetivo' });
    expect(panel.bloques.semanas.every((l) => l.estado === 'sin_dato')).toBe(true);
    expect(idsRepetidos(panel.bloques)).toEqual([]);
    expect(panel.hechos).toEqual([]);
  });
});
