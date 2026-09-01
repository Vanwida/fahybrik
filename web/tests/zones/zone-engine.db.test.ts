// EL MOTOR DE ZONAS, CONTRA UNA BASE DE VERDAD (mig 0168).
//
// Lo que se prueba aquí y no se puede probar en seco: que las muestras se cruzan
// con la VENTANA del tramo y no con el día, que el reparto congelado del móvil
// gana, que dos series del mismo entreno no cuentan el minuto dos veces, que el
// reconstructor se puede volver a lanzar, y que el método del coach manda sobre
// nuestros defectos de punta a punta.

import { afterAll, expect, test } from 'vitest';
import {
  computeExecutionZoneSeconds,
  recomputeAthleteZoneSeconds,
} from '@/lib/zones/segment-zone-seconds';
import { loadWeeklyZones } from '@/lib/zones/weekly';
import { loadPolarizationWindow } from '@/lib/zones/polarization';
import { resolveCoachHrMethod, upsertCoachHrMethod } from '@/lib/coach/hr-method';
import { loadAthleteHrZones } from '@/lib/athlete/hr-zones';
import {
  DEFAULT_COACH_HR_METHOD,
  polarizationDriftFrom,
  polarizationTargetFrom,
} from '@fahybrid/shared/domain/coach/hr-method';
import type { Sql } from '@/lib/db';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

/**
 * FC máxima que deja el umbral en 170 ppm (0,88 × 193 = 169,84, redondeado al
 * guardarlo). Las BANDAS se calculan del ancla sin redondear, así que con las
 * fracciones de serie salen Z1 ≤ 138, Z2 139–149, Z3 150–160, Z4 161–173.
 */
const MAX_HR_FOR_LTHR_170 = 193;
const BPM_Z2 = 145;
const BPM_Z4 = 168;

/** Otro método coherente: un coach que estira la banda fácil hasta el 95 % del umbral. */
const ANCHA = {
  ...DEFAULT_COACH_HR_METHOD,
  z1_hi_frac: 0.75,
  z2_lo_frac: 0.76,
  z2_hi_frac: 0.95,
  z3_lo_frac: 0.96,
  z3_hi_frac: 1.0,
  z4_lo_frac: 1.01,
  z4_hi_frac: 1.05,
  z5_lo_frac: 1.06,
  z5_hi_frac: 1.2,
};

const iso = (d: Date) => d.toISOString();

describeWithDb('motor de zonas — segment_zone_seconds (0168)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  // Doce fixtures, cada una con una docena de borrados en serie sobre una única
  // conexión: el minuto es el techo generoso, no la expectativa.
  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  }, 120_000);

  /** Un atleta con coach, una sesión ejecutada y los tramos que se le pidan. */
  async function makeSession(opts: {
    /** Minutos hacia atrás desde ahora en los que empieza la sesión. */
    startsMinutesAgo?: number;
    withAnchor?: boolean;
    segments: Array<{
      modality: string;
      duration_s: number;
      /** Segundos entre el fin del tramo anterior y el inicio de este. */
      gap_s?: number;
      frozen?: Record<string, number>;
    }>;
  }): Promise<{
    fx: Fixture;
    executionId: number;
    segmentIds: number[];
    start: Date;
  }> {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    if (opts.withAnchor !== false) {
      await sql`update athletes set max_hr_bpm = ${MAX_HR_FOR_LTHR_170} where id = ${fx.athleteId}`;
    }
    const templateId = await makeTemplate({ fx, name: 'Sesión de zonas' });
    const start = new Date(Date.now() - (opts.startsMinutesAgo ?? 120) * 60_000);
    const assignmentId = await makeAssignment({
      fx,
      templateId,
      scheduledForIso: iso(start).slice(0, 10),
      status: 'completed',
    });
    const totalS = opts.segments.reduce((s, x) => s + x.duration_s + (x.gap_s ?? 0), 0);
    const exec = await sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source)
      values (
        ${assignmentId}, ${fx.athleteId},
        ${iso(start)}::timestamptz,
        ${iso(new Date(start.getTime() + totalS * 1000))}::timestamptz,
        ${totalS}, 'healthkit'
      )
      returning id::text
    `;
    const executionId = Number(exec[0]!.id);

    const segmentIds: number[] = [];
    let cursor = start.getTime();
    for (const [position, seg] of opts.segments.entries()) {
      cursor += (seg.gap_s ?? 0) * 1000;
      const segStart = new Date(cursor);
      const segEnd = new Date(cursor + seg.duration_s * 1000);
      cursor = segEnd.getTime();
      const rows = await sql<Array<{ id: string }>>`
        insert into segment_executions (execution_id, position, started_at, ended_at, modality, raw_lap_data_json)
        values (
          ${executionId}, ${position},
          ${iso(segStart)}::timestamptz, ${iso(segEnd)}::timestamptz,
          ${seg.modality},
          ${seg.frozen ? sql.json({ zone_seconds: seg.frozen }) : null}
        )
        returning id::text
      `;
      segmentIds.push(Number(rows[0]!.id));
    }
    return { fx, executionId, segmentIds, start };
  }

  /** Lecturas de pulso cada `every` segundos, desde `from` durante `seconds`. */
  async function seedSamples(args: {
    athleteId: number;
    from: Date;
    seconds: number;
    bpm: number;
    every?: number;
  }): Promise<void> {
    const every = args.every ?? 5;
    // Un solo INSERT: la conexión de test es única y serial, así que mil roundtrips
    // convierten un caso de dos segundos en uno de dos minutos.
    const rows = [];
    for (let t = 0; t <= args.seconds; t += every) {
      rows.push({
        athlete_id: args.athleteId,
        source: 'healthkit',
        metric_type: 'hr',
        recorded_at: new Date(args.from.getTime() + t * 1000),
        value_numeric: args.bpm,
        unit: 'bpm',
      });
    }
    await sql`insert into biometric_streams ${sql(rows)}`;
  }

  const zoneRows = (client: Sql, executionId: number) =>
    client<
      Array<{
        segment_execution_id: string;
        z1_s: number;
        z2_s: number;
        z3_s: number;
        z4_s: number;
        z5_s: number;
        no_hr_s: number;
        total_s: number;
        hr_origin: string;
        hr_provider: string | null;
        computed_with_anchor: string | null;
        computed_with_lthr_bpm: number | null;
      }>
    >`
      select z.segment_execution_id::text as segment_execution_id,
             z.z1_s, z.z2_s, z.z3_s, z.z4_s, z.z5_s, z.no_hr_s, z.total_s,
             z.hr_origin, z.hr_provider::text as hr_provider,
             z.computed_with_anchor, z.computed_with_lthr_bpm
      from segment_zone_seconds z
      join segment_executions se on se.id = z.segment_execution_id
      where se.execution_id = ${executionId}
      order by se.position asc
    `;

  test('las muestras se cruzan con la VENTANA del tramo: el pulso de vivir se queda fuera', async () => {
    const { fx, executionId, start } = await makeSession({
      segments: [{ modality: 'run', duration_s: 600 }],
    });
    // Dentro del tramo: 600 s en Z2.
    await seedSamples({ athleteId: fx.athleteId, from: start, seconds: 600, bpm: BPM_Z2 });
    // Fuera: dos horas de pulso en reposo el mismo día. Es el 99 % del dato real
    // y es exactamente lo que la lectura anterior metía en la base aeróbica.
    await seedSamples({
      athleteId: fx.athleteId,
      from: new Date(start.getTime() - 3 * 3600_000),
      seconds: 7200,
      bpm: 55,
      every: 30,
    });

    await computeExecutionZoneSeconds({ execution_id: executionId, client: sql });
    const [row] = await zoneRows(sql, executionId);

    expect(row!.hr_origin).toBe('samples');
    expect(row!.z2_s).toBe(600);
    // Ni un segundo de Z1: las 240 lecturas a 55 ppm no han entrado.
    expect(row!.z1_s).toBe(0);
    expect(row!.total_s).toBe(600);
    expect(row!.computed_with_anchor).toBe('from_max_hr');
    expect(row!.computed_with_lthr_bpm).toBe(170);
  });

  test('el hueco largo se declara «sin pulso» y no se reparte', async () => {
    const { fx, executionId, start } = await makeSession({
      segments: [{ modality: 'run', duration_s: 900 }],
    });
    // Sólo los tres primeros minutos tienen pulso: los doce restantes son hueco.
    await seedSamples({ athleteId: fx.athleteId, from: start, seconds: 180, bpm: BPM_Z4 });

    await computeExecutionZoneSeconds({ execution_id: executionId, client: sql });
    const [row] = await zoneRows(sql, executionId);

    expect(row!.z4_s).toBeGreaterThan(150);
    expect(row!.z4_s).toBeLessThan(200);
    expect(row!.no_hr_s).toBeGreaterThan(690);
    expect(row!.total_s).toBe(900);
    // El hueco NO ha ido a parar a ninguna banda vecina.
    expect(row!.z3_s).toBe(0);
    expect(row!.z5_s).toBe(0);
  });

  test('SIN ANCLA no se inventa una sola zona, y la fila lo dice', async () => {
    const { fx, executionId, start } = await makeSession({
      withAnchor: false,
      segments: [{ modality: 'run', duration_s: 600 }],
    });
    await seedSamples({ athleteId: fx.athleteId, from: start, seconds: 600, bpm: BPM_Z2 });

    await computeExecutionZoneSeconds({ execution_id: executionId, client: sql });
    const [row] = await zoneRows(sql, executionId);

    expect(row!.z1_s + row!.z2_s + row!.z3_s + row!.z4_s + row!.z5_s).toBe(0);
    expect(row!.no_hr_s).toBe(600);
    expect(row!.computed_with_anchor).toBeNull();
    expect(row!.computed_with_lthr_bpm).toBeNull();
  });

  test('el reparto CONGELADO del móvil se respeta aunque haya muestras que digan otra cosa', async () => {
    const { fx, executionId, start } = await makeSession({
      segments: [{ modality: 'row', duration_s: 600, frozen: { z1: 100, z2: 400, z3: 50 } }],
    });
    // Muestras que clasificarían los 600 s en Z4: no deben ganarle a la medida.
    await seedSamples({ athleteId: fx.athleteId, from: start, seconds: 600, bpm: BPM_Z4 });

    await computeExecutionZoneSeconds({ execution_id: executionId, client: sql });
    const [row] = await zoneRows(sql, executionId);

    expect(row!.hr_origin).toBe('frozen_segment');
    expect([row!.z1_s, row!.z2_s, row!.z3_s]).toEqual([100, 400, 50]);
    expect(row!.z4_s).toBe(0);
    // Lo que le falta a la ventana para cubrir lo medido es hueco, no relleno.
    expect(row!.no_hr_s).toBe(50);
    expect(row!.total_s).toBe(600);
  });

  test('dos series del mismo entreno: gana la de más fidelidad y el minuto no se cuenta dos veces', async () => {
    const { executionId, start } = await makeSession({
      segments: [{ modality: 'row', duration_s: 300 }],
    });
    const offsets = Array.from({ length: 61 }, (_, i) => i * 5);
    // La correa emparejada al PM5 dice Z4 — es la que tiene que ganar.
    await sql`
      insert into workout_traces (execution_id, signal, source, started_at, offsets_s, values)
      values (${executionId}, 'hr', 'concept2', ${iso(start)}::timestamptz,
              ${offsets}::int[], ${offsets.map(() => BPM_Z4)}::real[])
    `;
    // El reloj, por Apple Health, dice Z2.
    await sql`
      insert into workout_traces (execution_id, signal, source, started_at, offsets_s, values)
      values (${executionId}, 'hr', 'healthkit', ${iso(start)}::timestamptz,
              ${offsets}::int[], ${offsets.map(() => BPM_Z2)}::real[])
    `;

    await computeExecutionZoneSeconds({ execution_id: executionId, client: sql });
    const [row] = await zoneRows(sql, executionId);

    expect(row!.hr_origin).toBe('trace');
    expect(row!.hr_provider).toBe('concept2');
    expect(row!.z4_s).toBe(300);
    expect(row!.z2_s).toBe(0);
    // Y sobre todo: 300 s de tramo son 300 s de total, no 600.
    expect(row!.total_s).toBe(300);
  });

  test('el reconstructor es idempotente: dos pasadas dejan las mismas filas y los mismos números', async () => {
    const { fx, executionId, start } = await makeSession({
      segments: [
        { modality: 'run', duration_s: 300 },
        { modality: 'strength', duration_s: 300, gap_s: 60 },
      ],
    });
    await seedSamples({ athleteId: fx.athleteId, from: start, seconds: 660, bpm: BPM_Z2 });

    await recomputeAthleteZoneSeconds({ athlete_id: fx.athleteId, client: sql });
    const first = await zoneRows(sql, executionId);
    await recomputeAthleteZoneSeconds({ athlete_id: fx.athleteId, client: sql });
    const second = await zoneRows(sql, executionId);

    expect(first).toHaveLength(2);
    expect(second.map(({ ...r }) => r)).toEqual(first.map(({ ...r }) => r));
    const count = await sql<Array<{ n: number }>>`
      select count(*)::int as n from segment_zone_seconds z
      join segment_executions se on se.id = z.segment_execution_id
      where se.execution_id = ${executionId}
    `;
    expect(count[0]!.n).toBe(2);
  });

  test('la polarización cuenta SEGUNDOS DE ENTRENO y se compara con el objetivo del coach', async () => {
    const { fx, executionId, start } = await makeSession({
      segments: [
        { modality: 'run', duration_s: 800 },
        { modality: 'run', duration_s: 200, gap_s: 0 },
      ],
    });
    // 800 s fáciles (Z2) y 200 s duros: 80/0/20 exacto contra el objetivo de serie.
    // El primer bloque acaba en 795 y no en 800: la muestra del segundo exacto de
    // la costura es del tramo que ARRANCA, así que dejarla ahí metería cinco
    // segundos suaves dentro de la serie dura.
    await seedSamples({ athleteId: fx.athleteId, from: start, seconds: 795, bpm: BPM_Z2 });
    await seedSamples({
      athleteId: fx.athleteId,
      from: new Date(start.getTime() + 800_000),
      seconds: 200,
      bpm: 190,
    });
    // Y dos horas de reposo el mismo día, que NO deben mover el reparto.
    await seedSamples({
      athleteId: fx.athleteId,
      from: new Date(start.getTime() - 3 * 3600_000),
      seconds: 7200,
      bpm: 55,
      every: 30,
    });
    await computeExecutionZoneSeconds({ execution_id: executionId, client: sql });

    const conNuestroDefecto = await loadPolarizationWindow({
      athlete_id: fx.athleteId,
      days: 7,
      method: DEFAULT_COACH_HR_METHOD,
      client: sql,
    });
    expect(conNuestroDefecto.pct).toEqual({ low: 80, mid: 0, high: 20 });
    expect(conNuestroDefecto.drift_vs_target).toBe(0);

    // El MISMO entrenamiento contra otro objetivo del coach: mismo reparto,
    // otra desviación. El sistema no opina — sólo compara con lo que él firma.
    const suyo = await upsertCoachHrMethod(
      fx.coachId,
      { ...DEFAULT_COACH_HR_METHOD, polarization_low_pct: 60, polarization_high_pct: 40 },
      sql,
    );
    const conElSuyo = await loadPolarizationWindow({
      athlete_id: fx.athleteId,
      days: 7,
      method: await resolveCoachHrMethod(fx.coachId, sql),
      client: sql,
    });
    expect(conElSuyo.pct).toEqual({ low: 80, mid: 0, high: 20 });
    expect(conElSuyo.drift_vs_target).toBe(
      polarizationDriftFrom({ low: 80, mid: 0, high: 20 }, polarizationTargetFrom(suyo)),
    );
    expect(conElSuyo.drift_vs_target).toBe(40);
  });

  test('la fila del coach pisa los defectos, y las bandas del atleta se mueven con ella', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await sql`update athletes set max_hr_bpm = ${MAX_HR_FOR_LTHR_170} where id = ${fx.athleteId}`;

    const deSerie = await resolveCoachHrMethod(fx.coachId, sql);
    expect(deSerie).toEqual(DEFAULT_COACH_HR_METHOD);
    const bandasDeSerie = await loadAthleteHrZones(fx.athleteId, sql);
    expect(bandasDeSerie!.bands[1]!.max_bpm).toBe(149);

    // Un coach de escuela más ancha: su Z2 llega hasta el 95 % del umbral.
    await upsertCoachHrMethod(fx.coachId, ANCHA, sql);
    expect((await resolveCoachHrMethod(fx.coachId, sql)).z2_hi_frac).toBe(0.95);
    const bandasSuyas = await loadAthleteHrZones(fx.athleteId, sql);
    expect(bandasSuyas!.bands[1]!.max_bpm).toBe(161);
  });

  test('la tabla rechaza unas bandas que se pisan: la coherencia no depende de la UI', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await expect(
      // Z3 acabaría ANTES de empezar: sin el CHECK, un pulso ahí no tendría zona.
      upsertCoachHrMethod(fx.coachId, { ...ANCHA, z3_lo_frac: 0.96, z3_hi_frac: 0.94 }, sql),
    ).rejects.toMatchObject({ constraint_name: 'coach_hr_method_monotonic_chk' });
  });

  test('la lectura semanal agrega, filtra por modalidad de TRAMO y deja fuera las semanas sin dato', async () => {
    const { fx, executionId, start } = await makeSession({
      segments: [
        { modality: 'run', duration_s: 600 },
        { modality: 'strength', duration_s: 300, gap_s: 0 },
      ],
    });
    await seedSamples({ athleteId: fx.athleteId, from: start, seconds: 900, bpm: BPM_Z2 });
    await computeExecutionZoneSeconds({ execution_id: executionId, client: sql });

    const todas = await loadWeeklyZones({ athlete_id: fx.athleteId, weeks: 8, client: sql });
    expect(todas.weeks).toHaveLength(1);
    expect(todas.weeks[0]!.total_s).toBe(900);
    expect(todas.weeks[0]!.z2_s).toBe(900);
    // Siete semanas sin nada NO se pintan a cero: no están, y se cuentan aparte.
    expect(todas.meta.weeks_without_data).toBe(7);
    expect(todas.meta.anchor!.source).toBe('from_max_hr');
    expect(todas.meta.computed_with[0]!.lthr_bpm).toBe(170);

    // Una sesión mixta reparte por tramo: correr son 600 y fuerza 300.
    const corriendo = await loadWeeklyZones({
      athlete_id: fx.athleteId,
      weeks: 8,
      modality: 'run',
      client: sql,
    });
    expect(corriendo.weeks[0]!.total_s).toBe(600);
    const fuerza = await loadWeeklyZones({
      athlete_id: fx.athleteId,
      weeks: 8,
      modality: 'strength',
      client: sql,
    });
    expect(fuerza.weeks[0]!.total_s).toBe(300);
  });

  test('un atleta sin nada medido no recibe semanas a cero: recibe una lista vacía', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const payload = await loadWeeklyZones({ athlete_id: fx.athleteId, weeks: 12, client: sql });
    expect(payload.weeks).toEqual([]);
    expect(payload.meta.weeks_with_data).toBe(0);
    expect(payload.meta.weeks_without_data).toBe(12);
    expect(payload.meta.first_week_with_data).toBeNull();
    expect(payload.meta.anchor).toBeNull();
  });
});
