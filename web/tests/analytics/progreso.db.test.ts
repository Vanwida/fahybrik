/**
 * Progreso y récords contra una base REAL (rama Neon desechable; se salta, nunca
 * en verde falso, sin TEST_DATABASE_URL). Un atleta con TODAS las familias en la
 * ventana `4s` y en la anterior, y las cifras que salen, calculadas a mano:
 *
 *   correr   Motor 300 → 290 s/km al mismo pulso (−10 s/km ≥ 3)      → mejor
 *   fuerza   1RM Brzycki 112,5 → 118,1 kg (+5 % ≥ 2,5); 60 × 15 no estima
 *   remo     500 m en 104 → 100 s (−3,8 % ≥ 1); 4 × 500 no hacen un 2000
 *   estación sled push 50 m · 152 kg en 150 → 140 s (−6,7 % ≥ 3); un EMOM no cuenta
 *   WOD      «Fran» 300 → 285 s (−5 % ≥ 3); un AMRAP suelto no es de referencia
 *   test     sentadilla 1RM 180 → 190 kg (+5,6 % ≥ 2)
 *
 * Y la paridad (A1): la ruta del atleta y la del coach devuelven lo mismo; el
 * atleta de otro club es un 404.
 */

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { cargarPanel } from '@/lib/analytics/panel';
import { cargarDetalleFamilia, cargarRecords } from '@/lib/analytics/progreso';
import { desdeSesionDeAtleta } from '@/lib/analytics/atleta-verificado';
import { idsRepetidos } from '@fahybrid/shared/domain/analytics/panel';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { closeTestSql, describeWithDb, getTestSql, settleCleanup } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

let athleteSession: { athlete_id: bigint; user_id: bigint; full_name: string } | null = null;
let coachSession: { coach_id: bigint } | null = null;
vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: async () => athleteSession }));
vi.mock('@/lib/auth/require-coach', () => ({
  requireCoach: async () => (coachSession ? { ok: true, session: coachSession } : { ok: false, response: new Response(null, { status: 401 }) }),
}));

const { GET: familiaAtleta } = await import('@/app/api/athlete/analytics/familia/[familia]/route');
const { GET: familiaCoach } = await import('@/app/api/coach/athletes/[id]/analytics/familia/[familia]/route');
const { GET: recordsAtleta } = await import('@/app/api/athlete/analytics/records/route');
const { GET: recordsCoach } = await import('@/app/api/coach/athletes/[id]/analytics/records/route');

// Martes 29 de septiembre de 2026, mediodía en Madrid. Ventana 4s: 02-09 → 29-09; la anterior, 05-08 → 01-09.
const NOW = new Date('2026-09-29T10:00:00.000Z');

function porId(ls: readonly Lectura[], id: string): Lectura {
  const l = ls.find((x) => x.id === id);
  if (!l) throw new Error(`falta ${id}: ${ls.map((x) => x.id).join(', ')}`);
  return l;
}

describeWithDb('progreso y récords (base real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let otro: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    otro = await makeCoachAndAthlete(sql);
    await sql`update athletes set timezone = 'Europe/Madrid', max_hr_bpm = 190 where id = ${fx.athleteId}`;
    await sql`insert into coach_methodology (coach_id, one_rm_estimation) values (${fx.coachId}, 'Brzycki')`;

    const correr = await makeExercise({ fx, name: 'Carrera', category: 'cardio', modality: 'run' });
    const remo = await makeExercise({ fx, name: 'Remo', category: 'cardio', modality: 'row' });
    const sentadilla = await makeExercise({ fx, name: 'Sentadilla', category: 'strength', modality: 'strength' });
    await sql`update exercises set movement_pattern = 'squat', equipment = array['barbell'] where id = ${sentadilla}`;
    const [trineo] = await sql<Array<{ id: string }>>`select id::text as id from exercises where slug = 'hyrox-sled-push' and coach_id is null limit 1`;
    const sledPush = Number(trineo!.id);
    const fran = await makeTemplate({ fx, name: 'Fran', format: 'for_time' });
    const suelto = await makeTemplate({ fx, name: 'AMRAP suelto', format: 'amrap' });

    const sesion = async (a: {
      dia: string;
      template?: number;
      score?: { time?: number; rounds?: number };
      segmentos: Array<Record<string, unknown> & { exercise_id: number; modality: string; seconds: number }>;
      sets?: Array<{ reps: number; kg: number }>;
    }) => {
      const asg = a.template ? await makeAssignment({ fx, templateId: a.template, scheduledForIso: a.dia, status: 'completed' }) : null;
      const inicio = `${a.dia}T09:00:00+02:00`;
      const [we] = await sql<Array<{ id: string }>>`
        insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source, score_time_s, score_rounds)
        values (${asg}, ${fx.athleteId}, ${inicio}::timestamptz, ${inicio}::timestamptz + interval '1 hour', 'manual', ${a.score?.time ?? null}, ${a.score?.rounds ?? null})
        returning id::text as id
      `;
      let offset = 0;
      for (const [i, s] of a.segmentos.entries()) {
        const [se] = await sql<Array<{ id: string }>>`
          insert into segment_executions (execution_id, position, started_at, ended_at, modality, exercise_id, source, context_format,
            distance_meters, avg_hr, avg_pace_s_per_km, avg_pace_s_per_500m, weight_used_kg)
          values (${Number(we!.id)}, ${i}, ${inicio}::timestamptz + make_interval(secs => ${offset}), ${inicio}::timestamptz + make_interval(secs => ${offset + s.seconds}),
            ${s.modality}, ${s.exercise_id}, ${(s.source as string) ?? 'manual'}, ${(s.format as string) ?? null},
            ${(s.distance as number) ?? null}, ${(s.hr as number) ?? null}, ${(s.pace_km as number) ?? null}, ${(s.pace_500 as number) ?? null}, ${(s.kg as number) ?? null})
          returning id::text as id
        `;
        offset += s.seconds + 60;
        for (const [k, st] of (i === 0 ? (a.sets ?? []) : []).entries()) {
          await sql`
            insert into set_executions (segment_execution_id, set_index, reps_actual, load_actual_kg, status, confirmed)
            values (${Number(se!.id)}, ${k + 1}, ${st.reps}, ${st.kg}, 'done', true)
          `;
        }
      }
    };

    // CORRER: tres rodajes de 5 km al mismo pulso en cada periodo, y un 1 km en cinta.
    const rodaje = (seconds: number) => ({ exercise_id: correr, modality: 'run', seconds, distance: 5000, hr: 142, pace_km: seconds / 5, format: 'steady' });
    for (const dia of ['2026-08-10', '2026-08-20', '2026-08-25']) await sesion({ dia, segmentos: [rodaje(1500)] });
    for (const dia of ['2026-09-10', '2026-09-15', '2026-09-20']) await sesion({ dia, segmentos: [rodaje(1450)] });
    await sesion({ dia: '2026-09-12', segmentos: [{ exercise_id: correr, modality: 'run', seconds: 250, distance: 1000, source: 'treadmill', format: 'intervals' }] });

    // FUERZA: con Brzycki (la fórmula de este coach).
    const sentadillaSeg = { exercise_id: sentadilla, modality: 'strength', seconds: 600, format: 'sets' };
    await sesion({ dia: '2026-08-12', segmentos: [sentadillaSeg], sets: [{ reps: 5, kg: 100 }] });
    await sesion({ dia: '2026-09-12', segmentos: [sentadillaSeg], sets: [{ reps: 5, kg: 105 }, { reps: 15, kg: 60 }] });

    // REMO: un 500 en cada periodo, y cuatro 500 en una sesión (sin sesión entera en el ergo).
    const quinientos = (seconds: number) => ({ exercise_id: remo, modality: 'row', seconds, distance: 500, pace_500: seconds, format: 'intervals' });
    await sesion({ dia: '2026-08-14', segmentos: [quinientos(104)] });
    await sesion({ dia: '2026-09-14', segmentos: [quinientos(100)] });
    await sesion({ dia: '2026-09-22', segmentos: [quinientos(110), quinientos(110), quinientos(110), quinientos(110)] });

    // ESTACIÓN: sled push 50 m con 152 kg, cronometrado; y uno dentro de un EMOM.
    const empuje = (seconds: number, format: string) => ({ exercise_id: sledPush, modality: 'other', seconds, distance: 50, kg: 152, format });
    await sesion({ dia: '2026-08-16', segmentos: [empuje(150, 'for_time')] });
    await sesion({ dia: '2026-09-16', segmentos: [empuje(140, 'for_time')] });
    await sesion({ dia: '2026-09-17', segmentos: [empuje(40, 'emom')] });

    // WOD: «Fran» dos veces; un AMRAP una vez.
    await sesion({ dia: '2026-08-18', template: fran, score: { time: 300 }, segmentos: [] });
    await sesion({ dia: '2026-09-18', template: fran, score: { time: 285 }, segmentos: [] });
    await sesion({ dia: '2026-09-19', template: suelto, score: { rounds: 7 }, segmentos: [] });

    // TEST: 1RM de sentadilla medido en dos tests.
    await sql`
      insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, source, recorded_at)
      values (${fx.athleteId}, 'back_squat_1rm', 180, 'kg', 'coach_test', '2026-08-20T10:00:00+02:00'),
             (${fx.athleteId}, 'back_squat_1rm', 190, 'kg', 'coach_test', '2026-09-20T10:00:00+02:00')
    `;
  }, 180_000);

  afterAll(async () => {
    await settleCleanup(async () => {
      await fx.cleanup();
      await otro.cleanup();
    });
    await closeTestSql();
  });

  test('el panel sirve progreso y récords con las cifras de cada familia', async () => {
    const panel = await cargarPanel({ atleta: desdeSesionDeAtleta({ athlete_id: fx.athleteId }), ventana: '4s', now: NOW, client: sql });
    expect(panel.pendientes).not.toContain('progreso');
    expect(panel.pendientes).not.toContain('records');
    expect(idsRepetidos(panel.bloques)).toEqual([]);
    const p = panel.bloques.progreso;
    expect(p.map((l) => l.id)).toEqual(['progreso.correr', 'progreso.remo', 'progreso.ski', 'progreso.bici', 'progreso.fuerza', 'progreso.estaciones', 'progreso.wod']);

    const correr = porId(p, 'progreso.correr');
    expect(correr.procedencia.de).toBe('motor_al_pulso');
    expect(correr.procedencia.ancla).toBe('estimada');
    expect(correr.dato).toMatchObject({ valor: 290, unidad: 's_km' });
    expect(correr.comparacion).toMatchObject({ anterior: 300, delta: -10, unidad: 's_km', cambio_minimo: 3, significativo: true });
    expect(correr.veredicto?.code).toBe('mejor');

    const fuerza = porId(p, 'progreso.fuerza');
    expect(fuerza.procedencia.de).toBe('e1rm_brzycki');
    expect(fuerza.dato?.valor).toBeCloseTo(118.1, 1);
    expect(fuerza.comparacion?.anterior).toBeCloseTo(112.5, 1);
    expect(fuerza.comparacion?.unidad).toBe('pct');
    expect(fuerza.veredicto?.code).toBe('mejor');

    const remo = porId(p, 'progreso.remo');
    expect(remo.dato).toMatchObject({ valor: 100, unidad: 's_500m' });
    expect(remo.veredicto?.code).toBe('mejor');

    expect(porId(p, 'progreso.estaciones').dato?.valor).toBe(140);
    expect(porId(p, 'progreso.estaciones').veredicto?.code).toBe('mejor');
    expect(porId(p, 'progreso.wod')).toMatchObject({ titulo_es: 'WOD · Fran', veredicto: { code: 'mejor' } });
    // Nunca ha montado en bici: se calla.
    expect(porId(p, 'progreso.bici')).toMatchObject({ estado: 'sin_dato', cobertura: { falta: { por: 'ocasion' } } });

    const r = panel.bloques.records;
    const cinco = porId(r, 'records.correr.5000');
    expect(cinco.dato).toMatchObject({ valor: 1450, referencia: { valor: 1500, de: 'record_anterior' } });
    expect(cinco.veredicto?.code).toBe('nuevo');
    expect(porId(r, 'records.correr.1000.cinta').dato?.valor).toBe(250);
    expect(r.some((l) => l.id === 'records.remo.2000')).toBe(false);
    expect(r.some((l) => l.id.startsWith('records.wod.') && l.titulo_es === 'AMRAP suelto')).toBe(false);
    expect(porId(r, 'records.test.back_squat_1rm').dato?.valor).toBe(190);
    // Lo nuevo va primero.
    const primeraVieja = r.findIndex((l) => l.veredicto?.code !== 'nuevo');
    expect(r.slice(0, primeraVieja === -1 ? r.length : primeraVieja).every((l) => l.veredicto?.code === 'nuevo')).toBe(true);
  });

  test('cada detalle abre con su fila del panel, y trae sus mejores y sus tests', async () => {
    const atleta = desdeSesionDeAtleta({ athlete_id: fx.athleteId });
    const panel = await cargarPanel({ atleta, ventana: '4s', now: NOW, client: sql });

    const fuerza = await cargarDetalleFamilia({ atleta, ventana: '4s', familia: 'fuerza', now: NOW, client: sql });
    expect(fuerza.lecturas[0]).toEqual(porId(panel.bloques.progreso, 'progreso.fuerza'));
    const tabla = fuerza.lecturas.find((l) => l.id.startsWith('fuerza.rm.'))!;
    expect(tabla.reparto?.partes.map((x) => [x.code, x.valor])).toEqual([
      ['1', 105],
      ['2', 105],
      ['3', 105],
      ['5', 105],
      ['8', 60],
      ['10', 60],
      ['12', 60],
      ['15', 60],
    ]);
    expect(porId(fuerza.lecturas, 'test.back_squat_1rm')).toMatchObject({ dato: { valor: 190, referencia: { valor: 180, de: 'test_anterior' } }, veredicto: { code: 'mejor' } });
    expect(porId(fuerza.lecturas, 'fuerza.patron.squat.series').dato?.valor).toBe(2);

    const correr = await cargarDetalleFamilia({ atleta, ventana: '4s', familia: 'correr', now: NOW, client: sql });
    expect(correr.lecturas[0]).toEqual(porId(panel.bloques.progreso, 'progreso.correr'));
    expect(porId(correr.lecturas, 'correr.mejor.5000')).toMatchObject({ dato: { valor: 1450, unidad: 'segundos' }, comparacion: { unidad: 's_km', delta: -10 } });

    const estaciones = await cargarDetalleFamilia({ atleta, ventana: '4s', familia: 'estaciones', now: NOW, client: sql });
    expect(estaciones.lecturas.map((l) => l.id)).toEqual(expect.arrayContaining(['progreso.estaciones', 'progreso.wod', 'estaciones.hyrox-sled-push.50m.152kg']));
    for (const d of [fuerza, correr, estaciones]) expect(new Set(d.lecturas.map((l) => l.id)).size).toBe(d.lecturas.length);

    const records = await cargarRecords({ atleta, ventana: '4s', now: NOW, client: sql });
    expect(records.lecturas.filter((l) => l.grupo === 'records').map((l) => l.id)).toEqual(panel.bloques.records.map((l) => l.id));
  });

  test('la ruta del atleta y la del coach devuelven lo mismo; otro club es un 404', async () => {
    athleteSession = { athlete_id: BigInt(fx.athleteId), user_id: BigInt(fx.athleteUserId), full_name: 'Test Athlete' };
    coachSession = { coach_id: BigInt(fx.coachId) };
    const sinFecha = async (res: Response) => {
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data?: { generado_iso?: string } } & Record<string, unknown>;
      const d = (body.data ?? body) as Record<string, unknown>;
      delete d.generado_iso;
      return d;
    };
    const req = (url: string) => new Request(url, { headers: { authorization: 'Bearer test' } });

    const a = await sinFecha(await familiaAtleta(req('http://x/api/athlete/analytics/familia/fuerza?ventana=4s'), { params: Promise.resolve({ familia: 'fuerza' }) }));
    const c = await sinFecha(
      await familiaCoach(req(`http://x/api/coach/athletes/${fx.athleteId}/analytics/familia/fuerza?ventana=4s`), {
        params: Promise.resolve({ id: String(fx.athleteId), familia: 'fuerza' }),
      }),
    );
    expect(c).toEqual(a);

    const ra = await sinFecha(await recordsAtleta(req('http://x/api/athlete/analytics/records?ventana=12s')));
    const rc = await sinFecha(await recordsCoach(req(`http://x/api/coach/athletes/${fx.athleteId}/analytics/records?ventana=12s`), { params: Promise.resolve({ id: String(fx.athleteId) }) }));
    expect(rc).toEqual(ra);

    const ajeno = await recordsCoach(req(`http://x/api/coach/athletes/${otro.athleteId}/analytics/records`), { params: Promise.resolve({ id: String(otro.athleteId) }) });
    expect(ajeno.status).toBe(404);
    const malaFamilia = await familiaAtleta(req('http://x/api/athlete/analytics/familia/natacion'), { params: Promise.resolve({ familia: 'natacion' }) });
    expect(malaFamilia.status).toBe(400);
    const malaVentana = await recordsAtleta(req('http://x/api/athlete/analytics/records?ventana=3m'));
    expect(malaVentana.status).toBe(400);
  });
});
