/**
 * LA MINA: el webhook de Garmin borraba los tramos medidos en vivo.
 *
 * `ingest-garmin.ts` hacía `delete from segment_executions where execution_id = …`
 * y reescribía encima las vueltas planas del reloj. Con la fila padre se iban:
 *   · los `zone_seconds` que congela el móvil dentro de `raw_lap_data_json` —el
 *     reparto de zonas de más calidad que existe, calculado en vivo con la
 *     escalera del propio atleta—,
 *   · las filas de `segment_zone_seconds` y de `set_executions`, que cuelgan del
 *     tramo con `on delete cascade`,
 *   · la atribución de la serie (`leg_index`/`leg_role`/`leg_phase`), el enlace a
 *     la prescripción y la procedencia del pulso.
 * Un reloj no sabe NADA de eso y aun así se lo llevaba.
 *
 * Estos tests corren contra una rama Neon de verdad (regla del proyecto: la base
 * no se mockea) y fijan los tres casos del encargo: el entreno en vivo sobrevive
 * y se enriquece, el entreno sin registro en vivo sigue creando los tramos del
 * reloj, y el mismo webhook dos veces deja exactamente el mismo estado.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { ingestGarminPayload, type GarminPayload } from '@/lib/sync/ingest-garmin';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

const DAY = '2026-05-12';
const ISO = (hhmmss: string) => `${DAY}T${hhmmss}.000Z`;
const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

// El reparto de zonas que congela el móvil: lo que la mina se llevaba por delante.
const ZONE_SECONDS_CONGELADO = { z1: 60, z2: 420, z3: 180, z4: 40, z5: 0 };

describeWithDb('webhook de Garmin — fusión de tramos, sin borrado (base real)', () => {
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
  });

  async function seed(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    return fx;
  }

  const resolveAthleteFor = (fx: Fixture, token: string) => async (t: string) =>
    t === token ? BigInt(fx.athleteId) : null;

  /** Una actividad de Garmin con dos vueltas alineadas con los tramos del vivo. */
  function payloadConVueltas(token: string, activityId: string): GarminPayload {
    return {
      activities: [
        {
          userAccessToken: token,
          activityId,
          summaryId: activityId,
          activityType: 'RUNNING',
          startTimeInSeconds: unix(ISO('07:00:00')),
          durationInSeconds: 1800,
          averageHeartRateInBeatsPerMinute: 150,
          laps: [
            {
              startTimeInSeconds: unix(ISO('07:00:00')),
              timerDurationInSeconds: 600,
              totalDistanceInMeters: 2000,
              averageHeartRateInBeatsPerMinute: 148,
              maxHeartRateInBeatsPerMinute: 165,
              averageRunCadenceInStepsPerMinute: 176,
            },
            {
              startTimeInSeconds: unix(ISO('07:10:00')),
              timerDurationInSeconds: 600,
              totalDistanceInMeters: 2100,
              averageHeartRateInBeatsPerMinute: 162,
              maxHeartRateInBeatsPerMinute: 181,
              averageRunCadenceInStepsPerMinute: 182,
            },
          ],
        },
      ],
    };
  }

  /** La sesión tal y como la deja el motor en vivo: dos tramos con estructura. */
  async function seedSesionEnVivo(fx: Fixture, assignmentId: number) {
    const [exec] = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
        source, recorded_via
      ) values (
        ${assignmentId}, ${fx.athleteId},
        ${ISO('07:00:00')}::timestamptz, ${ISO('07:20:00')}::timestamptz, 1200,
        'gps'::biometric_source, 'live'::execution_recording_method
      )
      returning id::text
    `;
    const execId = Number(exec!.id);

    // Tramo 0 — la serie. Distancia y FC medidas por la app, calorías en blanco:
    // el hueco que el reloj SÍ puede rellenar. Lleva los zone_seconds congelados.
    const [t0] = await sql<Array<{ id: string }>>`
      insert into segment_executions (
        execution_id, position, started_at, ended_at,
        modality, distance_meters, avg_hr, max_hr, hr_source,
        leg_index, leg_role, leg_phase, source, raw_lap_data_json
      ) values (
        ${execId}, 0, ${ISO('07:00:00')}::timestamptz, ${ISO('07:10:00')}::timestamptz,
        'run', 1980, 146, 170, 'strap',
        0, 'work', 'main', 'gps',
        ${sql.json({ zone_seconds: ZONE_SECONDS_CONGELADO })}
      )
      returning id::text
    `;
    // Tramo 1 — la recuperación. Sin distancia y sin FC: dos huecos más.
    const [t1] = await sql<Array<{ id: string }>>`
      insert into segment_executions (
        execution_id, position, started_at, ended_at,
        modality, leg_index, leg_role, leg_phase, source
      ) values (
        ${execId}, 1, ${ISO('07:10:00')}::timestamptz, ${ISO('07:20:00')}::timestamptz,
        'run', 1, 'recovery', 'main', 'gps'
      )
      returning id::text
    `;
    const segIds = [Number(t0!.id), Number(t1!.id)];

    // Los minutos por zona ya calculados (mig 0168) — cuelgan del tramo con
    // `on delete cascade`, así que son el testigo directo de la mina.
    await sql`
      insert into segment_zone_seconds (
        segment_execution_id, z1_s, z2_s, z3_s, z4_s, z5_s, no_hr_s,
        hr_origin, computed_with_anchor, computed_with_lthr_bpm
      ) values (
        ${segIds[0]}, 60, 420, 180, 40, 0, 0,
        'frozen_segment', 'lthr_measured', 168
      )
    `;
    return { execId, segIds };
  }

  async function tramosDe(execId: number) {
    return sql<
      Array<{
        id: string;
        position: number;
        source: string | null;
        distance_meters: string | null;
        calories: string | null;
        avg_hr: number | null;
        max_hr: number | null;
        run_cadence_spm: number | null;
        hr_source: string | null;
        leg_role: string | null;
        zone_seconds: unknown;
        garmin_lap: unknown;
      }>
    >`
      select id::text, position, source,
             distance_meters, calories, avg_hr, max_hr, run_cadence_spm,
             hr_source, leg_role,
             raw_lap_data_json -> 'zone_seconds' as zone_seconds,
             raw_lap_data_json -> 'garmin_lap'  as garmin_lap
      from segment_executions
      where execution_id = ${execId}
      order by position, round_index
    `;
  }

  // ── 1. El entreno en vivo sobrevive Y se enriquece ─────────────────────────
  test('los tramos del vivo se conservan con su identidad, y Garmin solo rellena huecos', async () => {
    const fx = await seed();
    const token = `tok-fusion-${fx.athleteId}`;
    const tpl = await makeTemplate({ fx, name: 'series-vivo' });
    const asgId = await makeAssignment({ fx, templateId: tpl, scheduledForIso: DAY });
    const { execId, segIds } = await seedSesionEnVivo(fx, asgId);

    const payload = payloadConVueltas(token, 'garmin-fusion-1');
    await ingestGarminPayload({
      sql,
      payload,
      resolveAthlete: resolveAthleteFor(fx, token),
      rawBody: JSON.stringify(payload),
    });

    const tramos = await tramosDe(execId);

    // LA IDENTIDAD: las mismas dos filas, con los mismos id. Ni una borrada, ni
    // una creada — las vueltas del reloj no trocean la sesión de la app.
    expect(tramos).toHaveLength(2);
    expect(tramos.map((t) => Number(t.id))).toEqual(segIds);

    // EL CONGELADO SIGUE. Es el dato que la mina destruía.
    expect(tramos[0]!.zone_seconds).toEqual(ZONE_SECONDS_CONGELADO);

    // Y las filas de minutos por zona, que caían por el `on delete cascade`.
    const [zonas] = await sql<Array<{ n: number; z2: number; origen: string }>>`
      select count(*)::int as n, max(z2_s)::int as z2, max(hr_origin) as origen
      from segment_zone_seconds where segment_execution_id = ${segIds[0]!}
    `;
    expect(zonas!.n).toBe(1);
    expect(zonas!.z2).toBe(420);
    expect(zonas!.origen).toBe('frozen_segment');

    // LA ESTRUCTURA sigue siendo de la app: el reloj no sabe qué es una serie.
    expect(tramos.map((t) => t.leg_role)).toEqual(['work', 'recovery']);
    expect(tramos.map((t) => t.source)).toEqual(['gps', 'gps']);
    expect(tramos[0]!.hr_source).toBe('strap');

    // LO MEDIDO POR LA APP NO SE TOCA: su distancia y su FC siguen siendo suyas,
    // aunque el reloj traiga otras cifras para la misma ventana.
    expect(Number(tramos[0]!.distance_meters)).toBe(1980);
    expect(tramos[0]!.avg_hr).toBe(146);
    expect(tramos[0]!.max_hr).toBe(170);

    // LOS HUECOS SÍ SE RELLENAN — aquí está toda la fusión. La cadencia que la
    // app no midió en el tramo 0, y la distancia y la FC del tramo 1.
    expect(tramos[0]!.run_cadence_spm).toBe(176);
    expect(Number(tramos[1]!.distance_meters)).toBe(2100);
    expect(tramos[1]!.avg_hr).toBe(162);
    expect(tramos[1]!.max_hr).toBe(181);
    expect(tramos[1]!.run_cadence_spm).toBe(182);

    // La vuelta entera queda guardada verbatim, bajo su propia clave, sin pisar
    // los zone_seconds que comparten objeto.
    expect(tramos[0]!.garmin_lap).toMatchObject({ totalDistanceInMeters: 2000 });

    // Y la cabecera de la ejecución sigue siendo la de la app.
    const [cab] = await sql<Array<{ source: string; recorded_via: string | null; dur: number | null }>>`
      select source::text as source, recorded_via::text as recorded_via,
             total_duration_seconds as dur
      from workout_executions where id = ${execId}
    `;
    expect(cab!.source).toBe('gps');
    expect(cab!.recorded_via).toBe('live');
    expect(Number(cab!.dur)).toBe(1200);
  });

  // ── 2. Sin registro en vivo, Garmin crea los suyos ─────────────────────────
  test('un entreno que la app no registró: las vueltas del reloj SON los tramos', async () => {
    const fx = await seed();
    const token = `tok-solo-${fx.athleteId}`;
    const tpl = await makeTemplate({ fx, name: 'solo-reloj' });
    const asgId = await makeAssignment({ fx, templateId: tpl, scheduledForIso: DAY });

    const payload = payloadConVueltas(token, 'garmin-solo-1');
    const res = await ingestGarminPayload({
      sql,
      payload,
      resolveAthlete: resolveAthleteFor(fx, token),
      rawBody: JSON.stringify(payload),
    });
    expect(res.inserted_lap_segments).toBe(2);

    const [exec] = await sql<Array<{ id: string; source: string }>>`
      select id::text, source::text as source
      from workout_executions where assignment_id = ${asgId}
    `;
    expect(exec!.source).toBe('garmin');

    const tramos = await tramosDe(Number(exec!.id));
    expect(tramos).toHaveLength(2);
    expect(tramos.map((t) => t.source)).toEqual(['garmin', 'garmin']);
    expect(tramos.map((t) => Number(t.distance_meters))).toEqual([2000, 2100]);
    expect(tramos.map((t) => t.avg_hr)).toEqual([148, 162]);
  });

  // ── 3. Idempotencia ───────────────────────────────────────────────────────
  test('el mismo webhook dos veces no duplica ni degrada (sesión en vivo)', async () => {
    const fx = await seed();
    const token = `tok-idem-vivo-${fx.athleteId}`;
    const tpl = await makeTemplate({ fx, name: 'idem-vivo' });
    const asgId = await makeAssignment({ fx, templateId: tpl, scheduledForIso: DAY });
    const { execId, segIds } = await seedSesionEnVivo(fx, asgId);

    const payload = payloadConVueltas(token, 'garmin-idem-1');
    const enviar = () =>
      ingestGarminPayload({
        sql,
        payload,
        resolveAthlete: resolveAthleteFor(fx, token),
        rawBody: JSON.stringify(payload),
      });

    await enviar();
    const primera = await tramosDe(execId);
    const [tocada] = await sql<Array<{ updated_at: string }>>`
      select updated_at::text from segment_executions where id = ${segIds[0]!}
    `;

    await enviar();
    const segunda = await tramosDe(execId);

    expect(segunda).toEqual(primera);
    expect(segunda.map((t) => Number(t.id))).toEqual(segIds);
    expect(segunda[0]!.zone_seconds).toEqual(ZONE_SECONDS_CONGELADO);

    // Sin nada que aportar, la segunda pasada no escribe: ni siquiera updated_at.
    const [despues] = await sql<Array<{ updated_at: string }>>`
      select updated_at::text from segment_executions where id = ${segIds[0]!}
    `;
    expect(despues!.updated_at).toBe(tocada!.updated_at);

    // Y las filas de minutos por zona siguen siendo una, no dos.
    const [zonas] = await sql<Array<{ n: number }>>`
      select count(*)::int as n from segment_zone_seconds
      where segment_execution_id = ${segIds[0]!}
    `;
    expect(zonas!.n).toBe(1);
  });

  test('el mismo webhook dos veces no duplica tramos del reloj', async () => {
    const fx = await seed();
    const token = `tok-idem-solo-${fx.athleteId}`;
    const tpl = await makeTemplate({ fx, name: 'idem-solo' });
    const asgId = await makeAssignment({ fx, templateId: tpl, scheduledForIso: DAY });

    const payload = payloadConVueltas(token, 'garmin-idem-2');
    const enviar = () =>
      ingestGarminPayload({
        sql,
        payload,
        resolveAthlete: resolveAthleteFor(fx, token),
        rawBody: JSON.stringify(payload),
      });

    await enviar();
    const [exec] = await sql<Array<{ id: string }>>`
      select id::text from workout_executions where assignment_id = ${asgId}
    `;
    const execId = Number(exec!.id);
    const primera = await tramosDe(execId);

    await enviar();
    const segunda = await tramosDe(execId);

    // Las MISMAS filas: la fila se reescribe en su sitio, no se borra y reinserta
    // (si se borrara, todo lo que cuelga de ella se iría con el cascade).
    expect(segunda.map((t) => Number(t.id))).toEqual(primera.map((t) => Number(t.id)));
    expect(segunda).toHaveLength(2);
    const [n] = await sql<Array<{ n: number }>>`
      select count(*)::int as n from workout_executions where athlete_id = ${fx.athleteId}
    `;
    expect(n!.n).toBe(1);
  });

  // ── 4. Enriquecer no puede convertirse en duplicar ─────────────────────────
  test('en una ejecución que no es suya, el reloj no crea ni un tramo', async () => {
    // Un registro a mano sin tramos con el que la actividad del reloj solo se
    // solapa en el tiempo. Ahora las vueltas SÍ llegan hasta aquí (antes se
    // tiraban enteras), así que hay que garantizar que no se convierten en filas
    // de trabajo en la sesión de otro: eso inflaría el volumen de la semana.
    const fx = await seed();
    const token = `tok-ajeno-${fx.athleteId}`;
    const tpl = await makeTemplate({ fx, name: 'a-mano' });
    const asgId = await makeAssignment({ fx, templateId: tpl, scheduledForIso: DAY });
    const [exec] = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
        source, recorded_via
      ) values (
        ${asgId}, ${fx.athleteId},
        ${ISO('06:55:00')}::timestamptz, ${ISO('07:30:00')}::timestamptz, 2100,
        'manual'::biometric_source, 'manual'::execution_recording_method
      )
      returning id::text
    `;

    const payload = payloadConVueltas(token, 'garmin-ajeno-1');
    const res = await ingestGarminPayload({
      sql,
      payload,
      resolveAthlete: resolveAthleteFor(fx, token),
      rawBody: JSON.stringify(payload),
    });

    expect(res.inserted_activities).toBe(0);
    expect(res.inserted_lap_segments).toBe(0);
    expect(await tramosDe(Number(exec!.id))).toHaveLength(0);
    const [n] = await sql<Array<{ n: number }>>`
      select count(*)::int as n from workout_executions where athlete_id = ${fx.athleteId}
    `;
    expect(n!.n).toBe(1);
  });

  test('un entreno del reloj a otra hora no le pisa la cabecera a la sesión en vivo', async () => {
    // La mina, un piso más arriba. El `on conflict` solo protegía source
    // garmin/manual, y una sesión corrida en la app lleva source gps o concept2:
    // un paseo con el reloj por la tarde le reescribía la ventana, la duración y
    // la procedencia al entreno que el atleta había hecho por la mañana.
    const fx = await seed();
    const token = `tok-cabecera-${fx.athleteId}`;
    const tpl = await makeTemplate({ fx, name: 'cabecera' });
    const asgId = await makeAssignment({ fx, templateId: tpl, scheduledForIso: DAY });
    const { execId, segIds } = await seedSesionEnVivo(fx, asgId);

    const tarde: GarminPayload = {
      activities: [
        {
          userAccessToken: token,
          activityId: 'garmin-paseo-tarde',
          summaryId: 'garmin-paseo-tarde',
          activityType: 'RUNNING',
          startTimeInSeconds: unix(ISO('19:00:00')),
          durationInSeconds: 2400,
          averageHeartRateInBeatsPerMinute: 110,
          laps: [
            {
              startTimeInSeconds: unix(ISO('19:00:00')),
              timerDurationInSeconds: 2400,
              totalDistanceInMeters: 5000,
              averageHeartRateInBeatsPerMinute: 110,
            },
          ],
        },
      ],
    };
    await ingestGarminPayload({
      sql, payload: tarde, resolveAthlete: resolveAthleteFor(fx, token),
      rawBody: JSON.stringify(tarde),
    });

    const [cab] = await sql<
      Array<{ source: string; recorded_via: string | null; dur: number | null; ref: string | null; hora: number }>
    >`
      select source::text as source, recorded_via::text as recorded_via,
             total_duration_seconds as dur, source_workout_ref as ref,
             extract(hour from started_at at time zone 'UTC')::int as hora
      from workout_executions where id = ${execId}
    `;
    expect(cab!.source).toBe('gps');
    expect(cab!.recorded_via).toBe('live');
    expect(Number(cab!.dur)).toBe(1200);
    expect(cab!.ref).toBeNull();
    expect(cab!.hora).toBe(7);

    // Y los tramos de la mañana siguen intactos: la vuelta de la tarde no casa
    // con ninguno, y sin ser suya la ejecución tampoco puede añadirse.
    const tramos = await tramosDe(execId);
    expect(tramos.map((t) => Number(t.id))).toEqual(segIds);
    expect(tramos[0]!.zone_seconds).toEqual(ZONE_SECONDS_CONGELADO);
  });

  // ── 5. Garmin manda el resumen y el detalle por separado ───────────────────
  test('el detalle que llega DESPUÉS del resumen aporta sus vueltas', async () => {
    // Garmin empuja `activities` (resumen, sin vueltas) y `activityDetails` (con
    // ellas) por separado. El corte seco anterior devolvía sin mirar los tramos en
    // cuanto la actividad ya estaba archivada, así que las vueltas no llegaban
    // NUNCA por este camino.
    const fx = await seed();
    const token = `tok-detalle-${fx.athleteId}`;
    const tpl = await makeTemplate({ fx, name: 'detalle' });
    const asgId = await makeAssignment({ fx, templateId: tpl, scheduledForIso: DAY });
    const activityId = 'garmin-detalle-1';

    const resumen: GarminPayload = {
      activities: [
        {
          userAccessToken: token,
          activityId,
          summaryId: activityId,
          activityType: 'RUNNING',
          startTimeInSeconds: unix(ISO('07:00:00')),
          durationInSeconds: 1800,
          averageHeartRateInBeatsPerMinute: 150,
        },
      ],
    };
    await ingestGarminPayload({
      sql, payload: resumen, resolveAthlete: resolveAthleteFor(fx, token),
      rawBody: JSON.stringify(resumen),
    });

    const [exec] = await sql<Array<{ id: string }>>`
      select id::text from workout_executions where assignment_id = ${asgId}
    `;
    expect(await tramosDe(Number(exec!.id))).toHaveLength(0);

    const detalle = payloadConVueltas(token, activityId);
    const res = await ingestGarminPayload({
      sql, payload: { activityDetails: detalle.activities },
      resolveAthlete: resolveAthleteFor(fx, token),
      rawBody: JSON.stringify(detalle),
    });

    expect(res.inserted_lap_segments).toBe(2);
    expect(await tramosDe(Number(exec!.id))).toHaveLength(2);
  });
});
