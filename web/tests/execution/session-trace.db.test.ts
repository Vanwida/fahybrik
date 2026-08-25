import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { loadSessionTrace, loadTraceAvailability, EMPTY_TRACE } from '@/lib/execution/session-trace';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { encodePolylineForTest } from '../utils/polyline-fixtures';
import type { ResolvedZone } from '@fahybrid/shared/domain/methodology';

// El camino de lectura, contra una base real: la regla que decide este módulo
// —lo derivado sale de la traza COMPLETA, la curva se reduce DESPUÉS, nunca
// antes— solo se prueba de verdad leyendo filas reales de workout_traces, no
// llamando a las funciones puras en abstracto (esas ya están cubiertas en
// tests/running/{km-splits,downsample}.test.ts).

describeWithDb('loadSessionTrace / loadAssignmentDetail (real DB) — el camino de lectura', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const executionIds: number[] = [];

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
  });

  afterEach(async () => {
    for (const id of executionIds.splice(0)) {
      await sql`delete from workout_traces where execution_id = ${id}`;
      await sql`delete from workout_routes where execution_id = ${id}`;
      await sql`delete from workout_executions where id = ${id}`;
    }
    // Los tests del mapa (#71) pueden dejar un perfil de zonas para 'run' —
    // se limpia siempre, aunque el test de turno no lo haya tocado (no-op).
    await sql`delete from athlete_zone_profiles where athlete_id = ${fx.athleteId} and modality = 'run'`;
  });

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  async function makeExecution(startedAtIso: string): Promise<{ executionId: number; assignmentId: number }> {
    const templateId = await makeTemplate({ fx, name: 'Rodaje' });
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: startedAtIso.slice(0, 10) });
    const rows = await sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at)
      values (${assignmentId}, ${fx.athleteId}, ${startedAtIso}::timestamptz, ${startedAtIso}::timestamptz + interval '40 minutes')
      returning id::text
    `;
    const executionId = Number(rows[0]!.id);
    executionIds.push(executionId);
    // El status vive en workout_assignments, no en workout_executions.
    // loadAssignmentDetail trata la sesión como hecha por 'completed'/'partial'.
    await sql`update workout_assignments set status = 'completed' where id = ${assignmentId}`;
    return { executionId, assignmentId };
  }

  async function insertTrace(executionId: number, signal: string, startedAtIso: string, offsets_s: number[], values: number[], source = 'gps') {
    await sql`
      insert into workout_traces (execution_id, signal, source, started_at, offsets_s, values)
      values (${executionId}, ${signal}, ${source}, ${startedAtIso}::timestamptz, ${offsets_s}::int[], ${values}::real[])
    `;
  }

  async function insertRoute(executionId: number, encoded: string, pointCount: number) {
    await sql`
      insert into workout_routes (execution_id, polyline, point_count)
      values (${executionId}, ${encoded}, ${pointCount})
    `;
  }

  // Seis bandas realistas, per_km — mismo fixture que
  // tests/running/route-zones.test.ts, para que un ritmo de 333.33 s/km siga
  // leyendo Z2 aquí igual que en el test puro.
  const RUN_ZONES: ResolvedZone[] = [
    { code: 'Z1', label: 'Recuperación', color: '#8aa', role: 'recovery', sort_order: 1, fast_s: 360, slow_s: null },
    { code: 'Z2', label: 'Base aeróbica', color: '#8a8', role: 'aerobic_base', sort_order: 2, fast_s: 330, slow_s: 360 },
    { code: 'Z3', label: 'Umbral aeróbico', color: '#aa8', role: 'aerobic_threshold', sort_order: 3, fast_s: 300, slow_s: 330 },
    { code: 'Z4', label: 'Umbral', color: '#da8', role: 'threshold', sort_order: 4, fast_s: 270, slow_s: 300 },
    { code: 'Z5', label: 'VO2max', color: '#d88', role: 'vo2max', sort_order: 5, fast_s: 240, slow_s: 270 },
    { code: 'Z6', label: 'Sprint', color: '#d55', role: 'sprint', sort_order: 6, fast_s: 200, slow_s: 240 },
  ];

  async function insertRunZoneProfile(athleteId: number) {
    await sql`
      insert into athlete_zone_profiles (athlete_id, modality, threshold_s, pace_unit, zones_json, version, source)
      values (${athleteId}, 'run', 255, 'per_km', ${sql.json(RUN_ZONES as unknown as Parameters<typeof sql.json>[0])}, 1, 'coach_test')
    `;
  }

  it('sesión sin traza: available:false, arrays vacíos — nunca un error, nunca un 404', async () => {
    const { executionId } = await makeExecution('2026-08-03T06:00:00Z');
    const execRow = await sql<Array<{ started_at: Date }>>`select started_at from workout_executions where id = ${executionId}`;
    const trace = await loadSessionTrace({ execution_id: executionId, started_at: execRow[0]!.started_at, client: sql });
    expect(trace).toEqual(EMPTY_TRACE);
    expect(trace.available).toBe(false);
    expect(trace.splits).toEqual([]);
    expect(trace.display_curve).toEqual({ pace: null, hr: null });
  });

  it('splits de fidelidad completa aunque display_curve esté reducido — la regla que decide este módulo', async () => {
    const startedAtIso = '2026-08-03T08:00:00Z';
    const { executionId } = await makeExecution(startedAtIso);

    // 5000 m a 2.5 m/s constantes, muestreados cada 2 s → 1001 muestras. Muy
    // por encima del presupuesto de la curva (600): si el código redujera
    // ANTES de derivar, los splits saldrían mal (menos de 5 km, o mal cortados).
    const offsets_s = Array.from({ length: 1001 }, (_, i) => i * 2);
    const distanceValues = offsets_s.map((t) => t * 2.5);
    const speedValues = offsets_s.map(() => 2.5);
    const hrValues = offsets_s.map(() => 150);
    await insertTrace(executionId, 'distance', startedAtIso, offsets_s, distanceValues);
    await insertTrace(executionId, 'speed', startedAtIso, offsets_s, speedValues);
    await insertTrace(executionId, 'hr', startedAtIso, offsets_s, hrValues, 'healthkit');

    const execRow = await sql<Array<{ started_at: Date }>>`select started_at from workout_executions where id = ${executionId}`;
    const trace = await loadSessionTrace({ execution_id: executionId, started_at: execRow[0]!.started_at, client: sql });

    expect(trace.available).toBe(true);
    // Fidelidad completa: 5 km exactos, cada uno con su duración real.
    expect(trace.splits).toHaveLength(5);
    for (const split of trace.splits) {
      expect(split.distance_m).toBe(1000);
      expect(split.duration_s).toBeCloseTo(400, 5); // 1000 m / 2.5 m/s
      expect(split.partial).toBe(false);
    }
    // La curva SÍ está reducida — nunca los 1001 puntos crudos.
    expect(trace.display_curve.pace).not.toBeNull();
    expect(trace.display_curve.hr).not.toBeNull();
    expect(trace.display_curve.pace!.values.length).toBeLessThan(1001);
    expect(trace.display_curve.pace!.values.length).toBeLessThanOrEqual(600);
    expect(trace.display_curve.hr!.values.length).toBeLessThanOrEqual(600);
  });

  it('un hueco real en la traza deja su kilómetro en null — visto por el camino completo, no solo por la función pura', async () => {
    const startedAtIso = '2026-08-03T09:00:00Z';
    const { executionId } = await makeExecution(startedAtIso);

    // Los mismos números que el test puro de km-splits.test.ts para el hueco
    // sin cobertura: km1 limpio (cruce en 97.5s), km2 con un hueco de 130 s
    // en medio (sin cobertura), km3 parcial limpio.
    const offsets_s = [0, 50, 95, 100, 230, 235, 240];
    const values = [0, 500, 980, 1020, 1900, 1950, 2050];
    await insertTrace(executionId, 'distance', startedAtIso, offsets_s, values);

    const execRow = await sql<Array<{ started_at: Date }>>`select started_at from workout_executions where id = ${executionId}`;
    const trace = await loadSessionTrace({ execution_id: executionId, started_at: execRow[0]!.started_at, client: sql });

    expect(trace.available).toBe(true);
    expect(trace.splits).toHaveLength(3);
    expect(trace.splits[0]).toMatchObject({ index: 1, distance_m: 1000 });
    expect(trace.splits[0]!.duration_s).toBeCloseTo(97.5, 1);
    expect(trace.splits[1]).toMatchObject({ index: 2, distance_m: 1000, duration_s: null, avg_pace_s_per_km: null });
    expect(trace.splits[2]).toMatchObject({ index: 3, partial: true, distance_m: 50 });
    expect(trace.splits[2]!.duration_s).toBeCloseTo(2.5, 1);
  });

  it('loadAssignmentDetail expone la traza en execution.trace — el camino real que sirve al atleta y al coach', async () => {
    const startedAtIso = '2026-08-03T10:00:00Z';
    const { executionId, assignmentId } = await makeExecution(startedAtIso);
    const offsets_s = Array.from({ length: 20 }, (_, i) => i * 100); // 0..1900
    const distanceValues = offsets_s.map((t) => t); // 1 m/s constante, 1900 m
    await insertTrace(executionId, 'distance', startedAtIso, offsets_s, distanceValues);

    const detail = await loadAssignmentDetail({ sql, athlete_id: BigInt(fx.athleteId), assignment_id: BigInt(assignmentId) });
    expect(detail).not.toBeNull();
    expect(detail!.execution).not.toBeNull();
    expect(detail!.execution!.trace.available).toBe(true);
    // 1900 m → 1 km completo + una cola parcial de 900 m, nunca escondida ni redondeada.
    expect(detail!.execution!.trace.splits).toHaveLength(2);
    expect(detail!.execution!.trace.splits[1]).toMatchObject({ partial: true, distance_m: 900 });
    // Sin fila en workout_routes, el mapa no existe — ni siquiera vacío por error.
    expect(detail!.execution!.trace.route).toEqual({ available: false, points: [], pace_zones: null });
  });

  it('include_trace:false: available si hay archivo, curva vacía — el peek no deriva', async () => {
    const startedAtIso = '2026-08-03T10:30:00Z';
    const { executionId, assignmentId } = await makeExecution(startedAtIso);
    const offsets_s = Array.from({ length: 20 }, (_, i) => i * 100);
    await insertTrace(executionId, 'distance', startedAtIso, offsets_s, offsets_s);

    const detail = await loadAssignmentDetail({
      sql,
      athlete_id: BigInt(fx.athleteId),
      assignment_id: BigInt(assignmentId),
      include_trace: false,
    });
    expect(detail).not.toBeNull();
    expect(detail!.execution).not.toBeNull();
    expect(detail!.execution!.trace.available).toBe(true);
    expect(detail!.execution!.trace.splits).toEqual([]);
    expect(detail!.execution!.trace.display_curve).toEqual({ pace: null, hr: null });
    expect(detail!.execution!.trace.route).toEqual({ available: false, points: [], pace_zones: null });
  });

  it('loadTraceAvailability: true con fila, false sin ella', async () => {
    const startedAtIso = '2026-08-03T10:45:00Z';
    const { executionId } = await makeExecution(startedAtIso);
    expect(await loadTraceAvailability({ execution_id: executionId, client: sql })).toBe(false);
    await insertTrace(executionId, 'distance', startedAtIso, [0, 60], [0, 100]);
    expect(await loadTraceAvailability({ execution_id: executionId, client: sql })).toBe(true);
  });

  // ── El mapa de la ruta (#71) — real hasta el bordillo: polilínea real de
  // Barcelona (Park Güell), traza real, zonas reales del atleta. ──────────
  it('con polilínea + traza + zonas del atleta, el mapa sale coloreado — camino real de loadSessionTrace', async () => {
    const startedAtIso = '2026-08-03T11:00:00Z';
    const { executionId } = await makeExecution(startedAtIso);

    // Tres puntos reales ~55.6 m separados entre sí (mismo fixture que
    // tests/running/route-zones.test.ts) — la distancia acumulada real de
    // ESTOS puntos coincide con los valores de la traza de abajo.
    const points = [
      { lat: 41.4, lon: 2.15 },
      { lat: 41.4005, lon: 2.15 },
      { lat: 41.401, lon: 2.15 },
    ];
    const encoded = encodePolylineForTest(points);
    await insertRoute(executionId, encoded, points.length);

    // La distancia REAL de estos puntos (~55.6 m, ~111.2 m acumulados) no se
    // pega a los bordes de la traza — se deja margen de interpolación de
    // sobra a cada lado. Pegarse al borde exacto es frágil de verdad: la
    // distancia se recalcula aquí sobre la polilínea decodificada (redondeo
    // de precisión 5) y la traza vuelve de Postgres como `real` (precisión
    // simple) — dos redondeos distintos que un test de "coincide exacto"
    // puede fallar por un margen de float, no por un fallo del código.
    await insertTrace(executionId, 'distance', startedAtIso, [0, 40, 80, 120, 160], [0, 40, 80, 120, 160]); // 1 m/s
    // Tres mesetas anchas y separadas — el instante interpolado de cada punto
    // cae bien dentro de una, nunca cerca de una transición: en t≈0 (Z1),
    // t≈55.6 dentro de [30,89] (Z2), t≈111.2 dentro de [91,160] (Z5).
    await insertTrace(executionId, 'speed', startedAtIso, [0, 30, 89, 91, 160], [2.0, 3.0, 3.0, 4.0, 4.0]);

    const execRow = await sql<Array<{ started_at: Date }>>`select started_at from workout_executions where id = ${executionId}`;
    const trace = await loadSessionTrace({
      execution_id: executionId,
      started_at: execRow[0]!.started_at,
      route_polyline: encoded,
      pace_zones: RUN_ZONES,
      client: sql,
    });

    expect(trace.route.available).toBe(true);
    expect(trace.route.points).toHaveLength(3);
    expect(trace.route.pace_zones).toEqual(RUN_ZONES);
    expect(trace.route.points[0]).toMatchObject({ lat: 41.4, lon: 2.15, zone_code: 'Z1' });
    expect(trace.route.points[1]).toMatchObject({ lat: 41.4005, lon: 2.15, zone_code: 'Z2' });
    expect(trace.route.points[2]).toMatchObject({ lat: 41.401, lon: 2.15, zone_code: 'Z5' });
  });

  it('sin fila en workout_routes, el mapa no existe aunque haya traza completa', async () => {
    const startedAtIso = '2026-08-03T12:00:00Z';
    const { executionId } = await makeExecution(startedAtIso);
    const offsets_s = [0, 60, 120];
    await insertTrace(executionId, 'distance', startedAtIso, offsets_s, [0, 100, 200]);
    await insertTrace(executionId, 'speed', startedAtIso, offsets_s, [2.0, 2.0, 2.0]);

    const execRow = await sql<Array<{ started_at: Date }>>`select started_at from workout_executions where id = ${executionId}`;
    const trace = await loadSessionTrace({
      execution_id: executionId,
      started_at: execRow[0]!.started_at,
      route_polyline: null,
      pace_zones: RUN_ZONES,
      client: sql,
    });

    expect(trace.available).toBe(true); // el punto-traza SÍ existe
    expect(trace.route).toEqual({ available: false, points: [], pace_zones: null }); // el mapa no
  });

  it('con polilínea pero sin zonas medidas del atleta, el mapa sale sin colorear — nunca un color inventado', async () => {
    const startedAtIso = '2026-08-03T13:00:00Z';
    const { executionId } = await makeExecution(startedAtIso);
    const points = [
      { lat: 41.4, lon: 2.15 },
      { lat: 41.4005, lon: 2.15 },
    ];
    const encoded = encodePolylineForTest(points);
    await insertRoute(executionId, encoded, points.length);
    await insertTrace(executionId, 'distance', startedAtIso, [0, 40, 80], [0, 40, 80]); // 1 m/s, margen de sobra
    await insertTrace(executionId, 'speed', startedAtIso, [0, 80], [2.0, 3.0]);

    const execRow = await sql<Array<{ started_at: Date }>>`select started_at from workout_executions where id = ${executionId}`;
    const trace = await loadSessionTrace({
      execution_id: executionId,
      started_at: execRow[0]!.started_at,
      route_polyline: encoded,
      pace_zones: null, // el atleta no tiene test de zonas todavía
      client: sql,
    });

    expect(trace.route.available).toBe(true); // la ruta SÍ existe — hay polilínea
    expect(trace.route.pace_zones).toBeNull(); // pero no hay con qué pintarla
    expect(trace.route.points).toHaveLength(2);
    expect(trace.route.points.every((p) => p.zone_code === null)).toBe(true);
    // Las coordenadas viajan igual — un mapa sin color sigue siendo un mapa.
    expect(trace.route.points[0]).toMatchObject({ lat: 41.4, lon: 2.15 });
  });

  it('loadAssignmentDetail resuelve las zonas del atleta para el mapa por el MISMO buildZoneLookup que el resto del detalle', async () => {
    const startedAtIso = '2026-08-03T14:00:00Z';
    const { executionId, assignmentId } = await makeExecution(startedAtIso);
    await insertRunZoneProfile(fx.athleteId);

    const points = [
      { lat: 41.4, lon: 2.15 },
      { lat: 41.4005, lon: 2.15 },
    ];
    const encoded = encodePolylineForTest(points);
    await insertRoute(executionId, encoded, points.length);
    await insertTrace(executionId, 'distance', startedAtIso, [0, 40, 80], [0, 40, 80]); // 1 m/s, margen de sobra
    await insertTrace(executionId, 'speed', startedAtIso, [0, 80], [2.0, 2.0]); // 500 s/km constante → Z1

    const detail = await loadAssignmentDetail({ sql, athlete_id: BigInt(fx.athleteId), assignment_id: BigInt(assignmentId) });
    expect(detail).not.toBeNull();
    const route = detail!.execution!.trace.route;
    expect(route.available).toBe(true);
    expect(route.pace_zones).not.toBeNull();
    expect(route.pace_zones!.map((z) => z.code)).toEqual(['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6']);
    expect(route.points[0]!.zone_code).toBe('Z1');
    expect(route.points[1]!.zone_code).toBe('Z1');
  });
});
