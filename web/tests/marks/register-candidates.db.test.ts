// «Usar esta actividad» (GET /api/athlete/marks/register): las actividades
// sincronizadas cuya distancia CORRIDA casa con la carrera.
//
// Hasta el 28-sep el lector hacía join a `execution_segments`, una tabla que no
// existe: la ruta contestaba 500 siempre. Aquí se prueba contra la tabla real
// (`segment_executions`) y lo que la distancia de una carrera tiene que ser:
//   · un 10K importado de Apple Salud (un tramo, sin asignación) es candidato;
//   · 10 km de remo no son un 10K;
//   · el calentamiento y la vuelta corridos cuentan (son metros de carrera);
//   · fuera de la ventana o fuera de la tolerancia, no.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadRegisterCandidates } from '@/lib/athlete/marks';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('marcas: candidatas para registrar una carrera (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
  });

  afterAll(async () => {
    await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
    await fx?.cleanup();
    await closeTestSql();
  });

  /** Una ejecución sin asignación (la forma de una importación) con sus tramos. */
  async function execution(daysAgo: number, tramos: Array<{ modality: string; meters: number }>, durationS = 2700) {
    const rows = await sql<{ id: string }[]>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source, recorded_via)
      values (null, ${fx.athleteId}, now() - make_interval(days => ${daysAgo}),
              now() - make_interval(days => ${daysAgo}) + make_interval(secs => ${durationS}),
              ${durationS}, 'healthkit', 'imported')
      returning id::text
    `;
    const id = Number(rows[0]!.id);
    for (const [i, t] of tramos.entries()) {
      await sql`
        insert into segment_executions (execution_id, position, modality, distance_meters)
        values (${id}, ${i}, ${t.modality}, ${t.meters})
      `;
    }
    return String(id);
  }

  it('solo la distancia corrida casa con la carrera; remo, fuera de tolerancia o de ventana no', async () => {
    const importedRun = await execution(2, [{ modality: 'run', meters: 10_050 }]);
    const withWarmup = await execution(4, [
      { modality: 'run', meters: 2_000 },
      { modality: 'run', meters: 6_000 },
      { modality: 'run', meters: 2_100 },
    ]);
    await execution(3, [{ modality: 'row', meters: 10_000 }]);
    const mixed = await execution(5, [
      { modality: 'row', meters: 4_000 },
      { modality: 'run', meters: 6_000 },
    ]);
    await execution(1, [{ modality: 'run', meters: 12_000 }]);
    await execution(30, [{ modality: 'run', meters: 10_000 }]);

    const got = await loadRegisterCandidates(BigInt(fx.athleteId), 'run_10k', sql);

    expect(got.map((c) => c.execution_id)).toEqual([importedRun, withWarmup]);
    expect(got[0]!.distance_m).toBe(10_050);
    expect(got[1]!.distance_m).toBe(10_100);
    expect(got.some((c) => c.execution_id === mixed)).toBe(false);
  });
});
