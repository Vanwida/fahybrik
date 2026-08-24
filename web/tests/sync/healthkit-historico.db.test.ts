/**
 * EL HISTÓRICO DE APPLE SALUD, CONTRA UNA BASE DE VERDAD.
 *
 * Lo que aterriza aquí desde que el atleta puede traerse su pasado no son tres
 * muestras de esta mañana: son páginas de 500 muestras de hace meses, repetidas
 * miles de veces. Estas pruebas fijan las tres cosas que eso exige y que no se
 * pueden comprobar en seco:
 *
 *   1. UN LOTE HISTÓRICO ES IDEMPOTENTE. Volver a mandarlo —porque la ventana se
 *      cortó a medias y se reanudó, o porque solapa con la tirada de 30 días— no
 *      duplica ni una fila.
 *   2. EL VALOR SE COMPARA REDONDEADO A LA COLUMNA. `value_numeric` es
 *      `numeric(12,4)`; un HRV de 45,678901 ms se guarda como 45,6789, así que el
 *      de-dupe que comparaba contra el valor SIN redondear no casaba nunca y
 *      reinsertaba la misma lectura en cada sincronización.
 *   3. EL PULSO VIEJO REHACE LAS ZONAS. Un tramo que figuraba «sin pulso» porque su
 *      FC no estaba guardada pasa a tener su reparto en cuanto el import la trae.
 *
 * Más la ventana de Polar: el backfill de una conexión nueva son los 90 días que su
 * API permite, no los 28 que nos recortábamos nosotros.
 *
 * Nada mockeado (regla del proyecto): rama de Neon real vía TEST_DATABASE_URL.
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { Buffer } from 'node:buffer';

import { ingestHealthkitBatch } from '@/lib/sync/ingest-healthkit';
import { healthkitSyncRequestSchema, type HKSyncBatch } from '@/lib/sync/schema';
import { runPolarSync } from '@/lib/cron/polar-sync';
import type { PolarV4Client } from '@/lib/polar/accesslink';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

const DB_TEST_TIMEOUT_MS = 60_000;

/** FC máxima que deja el umbral en 170 ppm — las mismas anclas que usa el motor. */
const MAX_HR_FOR_LTHR_170 = 193;
/** Dentro de Z2 con ese umbral (Z2 = 139–149). */
const BPM_Z2 = 145;

const iso = (d: Date) => d.toISOString();

/** Un lote de muestras tal y como lo manda el importador, por el esquema de verdad. */
function sampleBatch(
  samples: Array<{ metric_type: string; recorded_at: string; value_numeric: number; unit: string }>,
): HKSyncBatch {
  const parsed = healthkitSyncRequestSchema.safeParse({
    batch: {
      athlete_id: '0',
      sent_at: new Date().toISOString(),
      workouts: [],
      samples: samples.map((s) => ({ ...s, source: 'healthkit' })),
    },
  });
  if (!parsed.success) throw new Error('lote de prueba inválido para el esquema');
  return parsed.data.batch;
}

describeWithDb('histórico de Apple Salud — ingesta de lotes viejos (base real)', () => {
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
  }, 60_000);

  async function athlete(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    cleanups.push(async () => {
      await sql`delete from segment_zone_seconds where segment_execution_id in (
        select se.id from segment_executions se
        join workout_executions we on we.id = se.execution_id
        where we.athlete_id = ${fx.athleteId}
      )`;
      await sql`delete from segment_executions where execution_id in (
        select id from workout_executions where athlete_id = ${fx.athleteId}
      )`;
      await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
      await sql`delete from biometric_streams where athlete_id = ${fx.athleteId}`;
    });
    return fx;
  }

  const countSamples = async (athleteId: number, metric: string): Promise<number> => {
    const rows = await sql<Array<{ n: string }>>`
      select count(*)::text as n from biometric_streams
      where athlete_id = ${athleteId} and source = 'healthkit' and metric_type = ${metric}::biometric_metric
    `;
    return Number(rows[0]!.n);
  };

  test(
    'un lote histórico reenviado no duplica ni una fila',
    async () => {
      const fx = await athlete();
      // Ocho meses atrás: fuera de cualquier ventana reciente, que es justo lo que
      // sólo puede llegar por el import del histórico.
      const base = new Date(Date.now() - 240 * 86_400_000);
      const samples = Array.from({ length: 120 }, (_, i) => ({
        metric_type: 'heart_rate',
        recorded_at: iso(new Date(base.getTime() + i * 5_000)),
        value_numeric: 120 + (i % 7),
        unit: 'bpm',
      }));

      const first = await ingestHealthkitBatch({
        sql,
        athlete_id: BigInt(fx.athleteId),
        batch: sampleBatch(samples),
      });
      expect(first.samples_inserted).toBe(120);
      expect(first.samples_skipped_duplicate).toBe(0);

      // La misma ventana otra vez: es lo que pasa cuando el barrido se corta a mitad
      // y reanuda, porque el cursor sólo baja con la ventana entera subida.
      const second = await ingestHealthkitBatch({
        sql,
        athlete_id: BigInt(fx.athleteId),
        batch: sampleBatch(samples),
      });
      expect(second.samples_inserted).toBe(0);
      expect(second.samples_skipped_duplicate).toBe(120);
      expect(await countSamples(fx.athleteId, 'hr')).toBe(120);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'de-dupe con decimales: el valor se compara con la precisión de la columna',
    async () => {
      const fx = await athlete();
      const at = iso(new Date(Date.now() - 300 * 86_400_000));
      // Más de cuatro decimales: la columna guarda 45,6789 y el de-dupe de antes
      // comparaba contra 45,678901, así que reinsertaba en cada sincronización.
      const batch = sampleBatch([
        { metric_type: 'hrv_sdnn', recorded_at: at, value_numeric: 45.678901, unit: 'ms' },
      ]);

      expect((await ingestHealthkitBatch({ sql, athlete_id: BigInt(fx.athleteId), batch })).samples_inserted).toBe(1);
      const again = await ingestHealthkitBatch({ sql, athlete_id: BigInt(fx.athleteId), batch });
      expect(again.samples_inserted).toBe(0);
      expect(again.samples_skipped_duplicate).toBe(1);
      expect(await countSamples(fx.athleteId, 'hrv')).toBe(1);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'dos lecturas idénticas DENTRO del mismo lote entran una sola vez',
    async () => {
      const fx = await athlete();
      const at = iso(new Date(Date.now() - 200 * 86_400_000));
      const batch = sampleBatch([
        { metric_type: 'heart_rate', recorded_at: at, value_numeric: 132, unit: 'bpm' },
        { metric_type: 'heart_rate', recorded_at: at, value_numeric: 132, unit: 'bpm' },
      ]);
      const res = await ingestHealthkitBatch({ sql, athlete_id: BigInt(fx.athleteId), batch });
      expect(res.samples_inserted).toBe(1);
      expect(res.samples_skipped_duplicate).toBe(1);
      expect(await countSamples(fx.athleteId, 'hr')).toBe(1);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'el pulso viejo rehace las zonas del tramo que decía «sin pulso»',
    async () => {
      const fx = await athlete();
      await sql`update athletes set max_hr_bpm = ${MAX_HR_FOR_LTHR_170} where id = ${fx.athleteId}`;

      // Una sesión de hace seis meses, con su tramo, ya ejecutada y SIN pulso: es
      // exactamente el atleta que lleva medio año en la app y cuyas muestras de más
      // de 30 días nunca subieron.
      const start = new Date(Date.now() - 180 * 86_400_000);
      const durationS = 600;
      const end = new Date(start.getTime() + durationS * 1000);
      const templateId = await makeTemplate({ fx, name: 'Rodaje de hace medio año' });
      const assignmentId = await makeAssignment({
        fx,
        templateId,
        scheduledForIso: iso(start).slice(0, 10),
        status: 'completed',
      });
      const exec = await sql<Array<{ id: string }>>`
        insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source)
        values (${assignmentId}, ${fx.athleteId}, ${iso(start)}::timestamptz, ${iso(end)}::timestamptz, ${durationS}, 'healthkit')
        returning id::text
      `;
      const executionId = Number(exec[0]!.id);
      const seg = await sql<Array<{ id: string }>>`
        insert into segment_executions (execution_id, position, started_at, ended_at, modality)
        values (${executionId}, 0, ${iso(start)}::timestamptz, ${iso(end)}::timestamptz, 'run')
        returning id::text
      `;
      const segmentId = Number(seg[0]!.id);

      // El pulso de ese entreno, cada 5 s, llegando HOY por el import.
      const samples = [];
      for (let t = 0; t <= durationS; t += 5) {
        samples.push({
          metric_type: 'heart_rate',
          recorded_at: iso(new Date(start.getTime() + t * 1000)),
          value_numeric: BPM_Z2,
          unit: 'bpm',
        });
      }

      const res = await ingestHealthkitBatch({
        sql,
        athlete_id: BigInt(fx.athleteId),
        batch: sampleBatch(samples),
      });
      expect(res.samples_inserted).toBe(samples.length);
      expect(res.executions_zones_recomputed).toBe(1);

      const zones = await sql<Array<{ z2_s: number; no_hr_s: number; hr_origin: string }>>`
        select z2_s, no_hr_s, hr_origin from segment_zone_seconds where segment_execution_id = ${segmentId}
      `;
      expect(zones).toHaveLength(1);
      expect(zones[0]!.hr_origin).toBe('samples');
      // Casi toda la ventana clasificada en Z2, con el hueco del último intervalo.
      expect(zones[0]!.z2_s).toBeGreaterThan(durationS - 15);
      expect(zones[0]!.no_hr_s).toBeLessThan(15);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'el pulso que llega partido en dos páginas acaba con el reparto entero',
    async () => {
      // El caso REAL del importador: pagina de 500 en 500, así que el pulso de un
      // tramo largo llega troceado. Cada página recalcula, y la última tiene que
      // dejar el tramo completo — no la mitad que trajo ella.
      const fx = await athlete();
      await sql`update athletes set max_hr_bpm = ${MAX_HR_FOR_LTHR_170} where id = ${fx.athleteId}`;

      const start = new Date(Date.now() - 150 * 86_400_000);
      const durationS = 600;
      const end = new Date(start.getTime() + durationS * 1000);
      const templateId = await makeTemplate({ fx, name: 'Rodaje partido' });
      const assignmentId = await makeAssignment({
        fx,
        templateId,
        scheduledForIso: iso(start).slice(0, 10),
        status: 'completed',
      });
      const exec = await sql<Array<{ id: string }>>`
        insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source)
        values (${assignmentId}, ${fx.athleteId}, ${iso(start)}::timestamptz, ${iso(end)}::timestamptz, ${durationS}, 'healthkit')
        returning id::text
      `;
      const seg = await sql<Array<{ id: string }>>`
        insert into segment_executions (execution_id, position, started_at, ended_at, modality)
        values (${Number(exec[0]!.id)}, 0, ${iso(start)}::timestamptz, ${iso(end)}::timestamptz, 'run')
        returning id::text
      `;
      const segmentId = Number(seg[0]!.id);

      const page = (fromS: number, toS: number) => {
        const rows = [];
        for (let t = fromS; t <= toS; t += 5) {
          rows.push({
            metric_type: 'heart_rate',
            recorded_at: iso(new Date(start.getTime() + t * 1000)),
            value_numeric: BPM_Z2,
            unit: 'bpm',
          });
        }
        return sampleBatch(rows);
      };

      // Primera mitad: el tramo queda a medias, y lo dice — el resto es hueco.
      const first = await ingestHealthkitBatch({
        sql,
        athlete_id: BigInt(fx.athleteId),
        batch: page(0, durationS / 2),
      });
      expect(first.executions_zones_recomputed).toBe(1);
      const mid = await sql<Array<{ z2_s: number; no_hr_s: number }>>`
        select z2_s, no_hr_s from segment_zone_seconds where segment_execution_id = ${segmentId}
      `;
      // Media ventana clasificada y media declarada como hueco: el tramo dice la
      // verdad de lo que sabe en ese momento, ni infla ni se calla.
      expect(mid[0]!.z2_s).toBeGreaterThan(durationS / 3);
      expect(mid[0]!.no_hr_s).toBeGreaterThan(durationS / 3);

      // Segunda mitad: el motor relee TODA la ventana de la base, así que el tramo
      // acaba entero aunque esta página sólo traiga su segunda mitad.
      const second = await ingestHealthkitBatch({
        sql,
        athlete_id: BigInt(fx.athleteId),
        batch: page(durationS / 2, durationS),
      });
      expect(second.executions_zones_recomputed).toBe(1);
      const done = await sql<Array<{ z2_s: number; no_hr_s: number; hr_origin: string }>>`
        select z2_s, no_hr_s, hr_origin from segment_zone_seconds where segment_execution_id = ${segmentId}
      `;
      expect(done[0]!.hr_origin).toBe('samples');
      expect(done[0]!.z2_s).toBeGreaterThan(durationS - 15);
      expect(done[0]!.no_hr_s).toBeLessThan(15);
      // Y una sola fila por tramo: recalcular reescribe, no acumula.
      expect(done).toHaveLength(1);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'un lote sin pulso nuevo no dispara ningún recálculo',
    async () => {
      const fx = await athlete();
      const at = iso(new Date(Date.now() - 100 * 86_400_000));
      const res = await ingestHealthkitBatch({
        sql,
        athlete_id: BigInt(fx.athleteId),
        batch: sampleBatch([
          { metric_type: 'body_mass_kg', recorded_at: at, value_numeric: 78.4, unit: 'kg' },
        ]),
      });
      expect(res.samples_inserted).toBe(1);
      expect(res.executions_zones_recomputed).toBe(0);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'Polar: una conexión nueva pide los 90 días que su API permite, no 28',
    async () => {
      const fx = await athlete();
      await sql`
        insert into wearable_connections (athlete_id, provider, access_token_encrypted, status)
        values (${fx.athleteId}, 'polar', ${Buffer.from([0])}, 'connected')
      `;
      cleanups.push(async () => {
        await sql`delete from wearable_connections where athlete_id = ${fx.athleteId} and provider = 'polar'`;
      });

      const NOW = new Date('2026-07-15T12:00:00.000Z');
      const trainingDays: string[] = [];
      const client: PolarV4Client = {
        listSports: async () => [],
        listTrainingSessions: async (from) => {
          trainingDays.push(from);
          return [];
        },
        listSleeps: async () => [],
        listNightlyRecharge: async () => [],
      };
      const clientFor = async (athlete_id: bigint) =>
        athlete_id === BigInt(fx.athleteId) ? client : null;

      await runPolarSync({ sql, now: () => NOW, clientFor });

      // Sin datos previos del atleta la ventana es el backfill entero: desde 90 días
      // atrás hasta hoy INCLUIDO —91 días de calendario—, y día a día porque
      // `features` limita esos dos endpoints a uno por petición. Con el recorte
      // anterior de 28 días eran 29 peticiones y dos meses de pasado que el atleta
      // perdía el día que conectaba.
      expect(trainingDays).toHaveLength(91);
      expect(trainingDays[0]).toBe('2026-04-16');
      expect(trainingDays.at(-1)).toBe('2026-07-15');
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'un workout de Salud sin assignment nace como sesión importada',
    async () => {
      const fx = await athlete();
      const start = new Date('2024-03-12T07:00:00.000Z');
      const end = new Date('2024-03-12T08:00:00.000Z');
      const parsed = healthkitSyncRequestSchema.safeParse({
        batch: {
          athlete_id: String(fx.athleteId),
          sent_at: end.toISOString(),
          workouts: [
            {
              source_workout_id: 'HK-HIST-1',
              workout_activity_type: 37,
              started_at: start.toISOString(),
              ended_at: end.toISOString(),
              duration_seconds: 3600,
              total_energy_burned_kcal: 620,
              total_distance_meters: 10000,
              avg_heart_rate_bpm: 148,
              max_heart_rate_bpm: 172,
              lap_markers: [],
              source: 'healthkit',
            },
          ],
          samples: [],
        },
      });
      if (!parsed.success) throw new Error('lote histórico inválido');

      const first = await ingestHealthkitBatch({
        sql,
        athlete_id: BigInt(fx.athleteId),
        batch: parsed.data.batch,
      });
      expect(first.workouts_inserted).toBe(1);
      expect(first.executions_linked).toBe(1);

      const execs = await sql<
        Array<{ assignment_id: string | null; recorded_via: string | null; modality: string | null }>
      >`
        select we.assignment_id::text, we.recorded_via::text, se.modality
        from workout_executions we
        join segment_executions se on se.execution_id = we.id
        where we.athlete_id = ${fx.athleteId}
          and we.source_workout_ref = 'HK-HIST-1'
      `;
      expect(execs).toHaveLength(1);
      expect(execs[0]!.assignment_id).toBeNull();
      expect(execs[0]!.recorded_via).toBe('imported');
      expect(execs[0]!.modality).toBe('run');

      const second = await ingestHealthkitBatch({
        sql,
        athlete_id: BigInt(fx.athleteId),
        batch: parsed.data.batch,
      });
      expect(second.workouts_skipped_duplicate).toBe(1);
      const again = await sql<Array<{ n: string }>>`
        select count(*)::text as n from workout_executions
        where athlete_id = ${fx.athleteId} and source_workout_ref = 'HK-HIST-1'
      `;
      expect(Number(again[0]!.n)).toBe(1);
    },
    DB_TEST_TIMEOUT_MS,
  );

  // ── El caso del 24-ago: dos sesiones el mismo día ────────────────────────
  //
  // Alex tenía fuerza y ski programados el mismo día. Hizo el ski. El volcado de
  // Salud aterrizó sobre la sesión de FUERZA, la marcó completa y la dejó con un
  // resumen vacío — ni calorías, ni pulso, ni bloques. El trabajo real estaba en
  // la otra. Atribuir mal es peor que no atribuir.

  const loteDe = (athleteId: number, ref: string, ini: Date, fin: Date) =>
    healthkitSyncRequestSchema.safeParse({
      batch: {
        athlete_id: String(athleteId),
        sent_at: fin.toISOString(),
        workouts: [
          {
            source_workout_id: ref,
            workout_activity_type: 37,
            started_at: ini.toISOString(),
            ended_at: fin.toISOString(),
            duration_seconds: Math.round((fin.getTime() - ini.getTime()) / 1000),
            total_energy_burned_kcal: 120,
            total_distance_meters: 1000,
            avg_heart_rate_bpm: 147,
            max_heart_rate_bpm: 166,
            lap_markers: [],
            source: 'healthkit',
          },
        ],
        samples: [],
      },
    });

  test(
    'con DOS sesiones el mismo día, el volcado no se cuelga de ninguna',
    async () => {
      const fx = await athlete();
      const dia = '2024-05-08';
      const t1 = await makeTemplate({ fx, name: 'Fuerza A + SkiErg' });
      const t2 = await makeTemplate({ fx, name: 'Ski-Erg 8x250m' });
      const a1 = await makeAssignment({ fx, templateId: t1, scheduledForIso: dia });
      const a2 = await makeAssignment({ fx, templateId: t2, scheduledForIso: dia });

      const parsed = loteDe(fx.athleteId, 'HK-DOS-1',
        new Date(`${dia}T10:32:00.000Z`), new Date(`${dia}T10:40:00.000Z`));
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      await ingestHealthkitBatch({ sql, athlete_id: BigInt(fx.athleteId), batch: parsed.data.batch });

      const pegadas = await sql<Array<{ n: string }>>`
        select count(*)::text as n from workout_executions
        where athlete_id = ${fx.athleteId} and assignment_id in (${a1}, ${a2})
      `;
      expect(Number(pegadas[0]!.n), 'no puede elegir una de las dos al azar').toBe(0);

      const estados = await sql<Array<{ status: string }>>`
        select status::text from workout_assignments where id in (${a1}, ${a2})
      `;
      expect(estados.every((e) => e.status === 'scheduled'),
        'ninguna sesión puede quedar marcada como hecha').toBe(true);
    },
    60_000,
  );

  test(
    'un volcado no pisa la sesión que el atleta grabó en la app',
    async () => {
      const fx = await athlete();
      const dia = '2024-05-09';
      const t = await makeTemplate({ fx, name: 'Fuerza A' });
      const a = await makeAssignment({ fx, templateId: t, scheduledForIso: dia });

      // Lo que el atleta grabó en vivo: con su pulso y sus calorías.
      await sql`
        insert into workout_executions (
          assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
          source, recorded_via, avg_hr, total_calories
        ) values (
          ${a}, ${fx.athleteId},
          ${`${dia}T09:00:00.000Z`}, ${`${dia}T10:00:00.000Z`}, 3600,
          'concept2', 'live'::execution_recording_method, 147, 64
        )
      `;

      // El reloj sincroniza el mismo entreno horas después, en otra franja para
      // que la guarda de solape no lo pare antes de llegar a lo que se prueba.
      const parsed = loteDe(fx.athleteId, 'HK-VIVO-1',
        new Date(`${dia}T18:00:00.000Z`), new Date(`${dia}T18:30:00.000Z`));
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      await ingestHealthkitBatch({ sql, athlete_id: BigInt(fx.athleteId), batch: parsed.data.batch });

      const fila = await sql<Array<{ source: string; via: string | null; hr: number | null }>>`
        select source::text, recorded_via::text as via, avg_hr as hr
        from workout_executions where assignment_id = ${a}
      `;
      expect(fila).toHaveLength(1);
      expect(fila[0]!.via, 'la sesión sigue siendo la que se grabó en vivo').toBe('live');
      expect(fila[0]!.source).toBe('concept2');
      expect(fila[0]!.hr, 'y conserva su pulso').toBe(147);
    },
    60_000,
  );

});
