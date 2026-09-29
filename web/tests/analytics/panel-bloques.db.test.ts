/**
 * Intensidad, recuperación y carrera del panel contra una base REAL (rama Neon
 * desechable; se salta, nunca en verde falso, sin TEST_DATABASE_URL). Recorre
 * los cargadores enteros: los segundos por zona congelados de cada tramo, el
 * ritmo por zonas con el umbral declarado, las muestras de recuperación en su
 * día (una noche subida en dos lotes es UNA noche), las bandas de readiness del
 * coach, la previsión de la pizarra de carrera sin escribir y la paridad
 * atleta ↔ coach (A1).
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import { cargarPanel } from '@/lib/analytics/panel';
import { declararUmbral } from '@/lib/analytics/declaraciones';
import { desdeSesionDeAtleta, verificarAtletaDelCoach } from '@/lib/analytics/atleta-verificado';
import { idsRepetidos } from '@fahybrid/shared/domain/analytics/panel';
import { veredictoReadiness } from '@fahybrid/shared/domain/analytics/recuperacion-panel';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { closeTestSql, describeWithDb, getTestSql, settleCleanup } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

// Lunes 15 de junio de 2026, media mañana en Madrid.
const NOW = new Date('2026-06-15T10:00:00.000Z');
const HOY = '2026-06-15';
const dia = (n: number) => isoDateString(addDays(parseIsoDate(HOY), n));

function porId(ls: readonly Lectura[], id: string): Lectura {
  const l = ls.find((x) => x.id === id);
  if (!l) throw new Error(`falta ${id}: ${ls.map((x) => x.id).join(', ')}`);
  return l;
}

describeWithDb('intensidad, recuperación y carrera del panel (base real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let carreraId: number;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const A = fx.athleteId;
    await sql`update athletes set timezone = 'Europe/Madrid', max_hr_bpm = 190 where id = ${A}`;
    // Las bandas del readiness del coach, distintas del defecto (67/45).
    await sql`insert into coach_signal_thresholds (coach_id, readiness_ok_min, readiness_caution_min) values (${fx.coachId}, 75, 50)`;

    const correr = await makeExercise({ fx, name: 'Carrera continua', category: 'cardio', modality: 'run' });
    const sentadilla = await makeExercise({ fx, name: 'Sentadilla', category: 'strength', modality: 'strength' });
    const plantilla = await makeTemplate({ fx, name: 'Entreno', format: 'intervals' });

    // Tres entrenos con sus segundos por zona congelados (umbral estimado desde la máxima).
    const entreno = async (d: string, tramo: { mod: string; ex: number; s: number; ritmo: number | null; z: [number, number, number, number, number] }) => {
      const asig = await makeAssignment({ fx, templateId: plantilla, scheduledForIso: d, status: 'completed' });
      const inicio = `${d}T18:00:00+02:00`;
      const [we] = await sql<Array<{ id: string }>>`
        insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source)
        values (${asig}, ${A}, ${inicio}::timestamptz, ${inicio}::timestamptz + make_interval(secs => ${tramo.s}), ${tramo.s}, 'manual')
        returning id::text as id
      `;
      const [se] = await sql<Array<{ id: string }>>`
        insert into segment_executions (execution_id, position, started_at, ended_at, modality, exercise_id, avg_hr, avg_pace_s_per_km)
        values (${Number(we!.id)}, 0, ${inicio}::timestamptz, ${inicio}::timestamptz + make_interval(secs => ${tramo.s}), ${tramo.mod}, ${tramo.ex}, 140, ${tramo.ritmo})
        returning id::text as id
      `;
      await sql`
        insert into segment_zone_seconds (segment_execution_id, z1_s, z2_s, z3_s, z4_s, z5_s, no_hr_s, hr_origin, computed_with_anchor, computed_with_lthr_bpm)
        values (${Number(se!.id)}, ${tramo.z[0]}, ${tramo.z[1]}, ${tramo.z[2]}, ${tramo.z[3]}, ${tramo.z[4]}, 0, 'samples', 'from_max_hr', 167)
      `;
    };
    await entreno('2026-06-03', { mod: 'run', ex: correr, s: 1200, ritmo: 280, z: [0, 0, 600, 600, 0] });
    await entreno('2026-06-10', { mod: 'run', ex: correr, s: 1800, ritmo: 300, z: [0, 1500, 0, 300, 0] });
    await entreno('2026-06-12', { mod: 'strength', ex: sentadilla, s: 3600, ritmo: null, z: [3000, 600, 0, 0, 0] });
    // Lo debido de la última semana: una sesión fallada el 13.
    await makeAssignment({ fx, templateId: plantilla, scheduledForIso: '2026-06-13', status: 'missed' });

    // RECUPERACIÓN. Basal (hoy−40 … hoy−21): VFC 60, reposo 50, sueño 7,5 h.
    // Última semana: VFC 54, reposo 54, y noches de 7,4 h subidas en DOS lotes (2 h de madrugada + la noche).
    const filas: Array<{ athlete_id: number; source: string; metric_type: string; recorded_at: string; value_numeric: number; unit: string }> = [];
    const muestra = (metric_type: string, recorded_at: string, value_numeric: number, unit: string) =>
      filas.push({ athlete_id: A, source: 'healthkit', metric_type, recorded_at, value_numeric, unit });
    for (let n = -40; n <= -21; n++) {
      muestra('hrv', `${dia(n)}T07:00:00+02:00`, 60, 'ms');
      muestra('hr_resting', `${dia(n)}T09:00:00+02:00`, 50, 'bpm');
      muestra('sleep_duration', `${dia(n)}T00:00:00+02:00`, 7.5 * 3600, 'seconds');
    }
    for (let n = -6; n <= 0; n++) {
      muestra('hrv', `${dia(n)}T07:00:00+02:00`, 54, 'ms');
      muestra('hr_resting', `${dia(n)}T09:00:00+02:00`, 54, 'bpm');
      muestra('sleep_duration', `${dia(n)}T00:00:00+02:00`, 2 * 3600, 'seconds');
      muestra('sleep_duration', `${dia(n)}T00:00:00+02:00`, 7.4 * 3600, 'seconds');
    }
    await sql`
      insert into biometric_streams (athlete_id, source, metric_type, recorded_at, value_numeric, unit)
      select athlete_id, source::biometric_source, metric_type::biometric_metric, recorded_at, value_numeric, unit
      from jsonb_to_recordset(${sql.json(filas)}) as x(athlete_id bigint, source text, metric_type text, recorded_at timestamptz, value_numeric numeric, unit text)
    `;
    await sql`
      insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score, breakdown_json)
      values (${A}, ${dia(-20)}::date, 60, '{}'::jsonb), (${A}, ${dia(-3)}::date, 72, '{}'::jsonb)
    `;

    // CARRERA. Objetivo individual con meta, y su última carrera completa hace 20 días.
    const [c] = await sql<Array<{ id: string }>>`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority, race_date, status, goal_time_seconds, source)
      values (${A}, 'HYROX Objetivo', 'hyrox', 'singles', 'open', 'men', 'target', '2026-07-12'::date, 'planned', 4500, 'manual')
      returning id::text as id
    `;
    carreraId = Number(c!.id);
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority, race_date, status,
                         result_time_seconds, run_total_seconds, run_splits_json, station_splits_json, roxzone_seconds, source)
      values (${A}, 'HYROX Anterior', 'hyrox', 'singles', 'open', 'men', 'tune_up', ${dia(-20)}::date, 'completed',
              4800, 2400, ${sql.json([300, 300, 300, 300, 300, 300, 300, 300])},
              ${sql.json([2, 4, 6, 8, 10, 12, 14, 16].map((index) => ({ index, seconds: 250 })))}, 400, 'hyresult_import')
    `;
    // Una previsión congelada por la pizarra hace cinco días: la tendencia.
    await sql`
      insert into race_predictions (athlete_id, target_race_id, goal_time_seconds, predicted_total_s, segments_json, model_version, pred_date)
      values (${A}, ${carreraId}, 4500, 4900, '[]'::jsonb, 'goal-gap@1', ${dia(-5)}::date)
    `;

    // Un umbral de ritmo declarado de un toque: 4:30/km.
    await declararUmbral(desdeSesionDeAtleta({ athlete_id: A }), { kind: 'run_s_per_km', value: 270 }, sql);
  }, 120_000);

  afterAll(async () => {
    await settleCleanup(async () => {
      const A = fx.athleteId;
      await sql`delete from race_predictions where athlete_id = ${A}`;
      await sql`delete from races where athlete_id = ${A}`;
      await sql`delete from biometric_streams where athlete_id = ${A}`;
      await sql`delete from athlete_daily_readiness_snapshots where athlete_id = ${A}`;
      await sql`delete from athlete_declared_thresholds where athlete_id = ${A}`;
      await sql`delete from segment_zone_seconds where segment_execution_id in (select se.id from segment_executions se join workout_executions we on we.id = se.execution_id where we.athlete_id = ${A})`;
      await sql`delete from segment_executions where execution_id in (select id from workout_executions where athlete_id = ${A})`;
      await sql`delete from workout_executions where athlete_id = ${A}`;
      await sql`delete from coach_signal_thresholds where coach_id = ${fx.coachId}`;
      await fx.cleanup();
    });
    await closeTestSql();
  }, 120_000);

  test('intensidad: zonas de todas las familias, reparto sin la fuerza, y el ritmo por zonas con el umbral declarado', async () => {
    const panel = await cargarPanel({ atleta: desdeSesionDeAtleta({ athlete_id: fx.athleteId }), ventana: '4s', now: NOW, client: sql });
    expect(panel.pendientes).toEqual([]);
    expect(idsRepetidos(panel.bloques)).toEqual([]);
    const b = panel.bloques.intensidad;

    const zonas = porId(b, 'intensidad.zonas');
    expect(zonas.dato?.valor).toBeCloseTo(6600 / 3600, 10);
    expect(zonas.reparto?.partes.map((p) => p.valor * 3600)).toEqual([3000, 2100, 600, 900, 0]);
    expect(zonas.procedencia.ancla).toBe('estimada');

    // Sin la fuerza: 1500 s fáciles, 1500 medios, 0 duros → 50 / 50 / 0 contra 80 / 0 / 20.
    const reparto = porId(b, 'intensidad.polarizacion');
    expect(reparto.dato).toMatchObject({ valor: 50, unidad: 'pct', referencia: { valor: 80, delta: -30 } });
    expect(reparto.veredicto).toMatchObject({ code: 'zona_media' });
    expect(porId(b, 'intensidad.zonas.fuerza').familia).toBe('fuerza');

    // 4:30/km declarado → 5:00 cae en Z2 y 4:40 en Z4.
    const ritmo = porId(b, 'intensidad.ritmo.correr');
    expect(ritmo.procedencia.ancla).toBe('declarada');
    const partes = Object.fromEntries(ritmo.reparto!.partes.map((p) => [p.code, Math.round(p.valor * 3600)]));
    expect(partes).toMatchObject({ Z2: 1800, Z4: 1200 });
  });

  test('recuperación: la basal única, una noche en dos lotes es UNA noche, y el readiness con las bandas del coach', async () => {
    const panel = await cargarPanel({ atleta: desdeSesionDeAtleta({ athlete_id: fx.athleteId }), ventana: '4s', now: NOW, client: sql });
    const b = panel.bloques.recuperacion;

    expect(porId(b, 'recuperacion.variabilidad')).toMatchObject({ dato: { valor: 54, referencia: { valor: 60, delta: -6 } }, veredicto: { code: 'por_debajo' } });
    expect(porId(b, 'recuperacion.pulso_reposo')).toMatchObject({ dato: { valor: 54, referencia: { valor: 50, delta: 4 } }, veredicto: { code: 'por_encima', tono: 'atencion' } });
    // 7,4 h por noche (el lote de 2 h no es otra noche ni se promedia): en tu normal frente a 7,5.
    expect(porId(b, 'recuperacion.sueno')).toMatchObject({ dato: { valor: 7.4, referencia: { valor: 7.5, delta: -0.1 } }, veredicto: { code: 'en_tu_normal' } });

    const readiness = porId(b, 'recuperacion.readiness');
    expect(readiness.serie?.referencias?.map((r) => r.valor)).toEqual([50, 75]);
    expect(readiness.serie?.puntos.find((p) => p.t === dia(-3))?.v).toBe(72);
    const cabecera = porId(panel.bloques.estado, 'estado.readiness');
    // Las mismas bandas en la cabecera y en el bloque, las del coach (75/50), no las de Swift.
    expect(readiness.veredicto?.code).toBe(veredictoReadiness(readiness.dato!.valor, { ok_min: 75, cautela_min: 50, max_edad_dias: 2 }).code);
    expect(cabecera.veredicto?.code).toBe(readiness.veredicto?.code);
  });

  test('carrera: la previsión de la pizarra sin escribir, su hueco y su tendencia; la disposición en arranque en frío pide tiempo', async () => {
    const antes = await sql<Array<{ n: number }>>`select count(*)::int as n from race_predictions where athlete_id = ${fx.athleteId}`;
    const panel = await cargarPanel({ atleta: desdeSesionDeAtleta({ athlete_id: fx.athleteId }), ventana: '4s', now: NOW, client: sql });
    const b = panel.bloques.carrera;

    expect(porId(b, 'carrera.objetivo')).toMatchObject({ titulo_es: 'HYROX Objetivo', dato: { valor: 27, unidad: 'dias' } });
    const prevision = porId(b, 'carrera.prevision');
    expect(prevision.estado).toBe('medida');
    expect(prevision.dato?.referencia).toMatchObject({ valor: 4500, de: 'objetivo' });
    expect(prevision.dato!.referencia!.delta).toBe(prevision.dato!.valor - 4500);
    expect(prevision.veredicto).toBeNull();
    expect(prevision.serie?.puntos).toEqual([{ t: dia(-5), v: 4900 }]);
    expect(b.filter((l) => l.id.startsWith('carrera.tramo.'))).toHaveLength(10);
    expect(porId(b, 'carrera.tramo.run').dato?.referencia?.de).toBe('presupuesto_objetivo');
    // Leer el panel no congela ninguna previsión: eso es de la pizarra.
    const despues = await sql<Array<{ n: number }>>`select count(*)::int as n from race_predictions where athlete_id = ${fx.athleteId}`;
    expect(despues[0]!.n).toBe(antes[0]!.n);

    // Primera sesión el 3 de junio: 13 días de 42 → la frescura no se sitúa, falta tiempo.
    expect(porId(b, 'carrera.disposicion').cobertura.falta).toEqual({ por: 'historia', llevas: 13, hacen: 42 });
  });

  test('un cálculo, dos pintores: la ruta del coach devuelve exactamente lo mismo (A1)', async () => {
    const comoAtleta = await cargarPanel({ atleta: desdeSesionDeAtleta({ athlete_id: fx.athleteId }), ventana: '12s', now: NOW, client: sql });
    const verificado = await verificarAtletaDelCoach(fx.athleteId, fx.coachId, sql);
    const comoCoach = await cargarPanel({ atleta: verificado!, ventana: '12s', now: NOW, client: sql });
    expect({ ...comoCoach, generado_iso: null }).toEqual({ ...comoAtleta, generado_iso: null });
  });
});
