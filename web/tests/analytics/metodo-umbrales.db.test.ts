/**
 * El método ampliado y los umbrales declarados contra una base REAL (0277):
 * la fila del coach con sus listas, el reset, los CHECK de la tabla, y la
 * escalera de evidencia sobre filas de verdad (un test gana a una declaración
 * aunque sea más antiguo; retirar la declaración cae al peldaño siguiente).
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  getCoachAnalyticsMethodSetting,
  resetCoachAnalyticsMethod,
  resolveEffectiveAnalyticsMethod,
  upsertCoachAnalyticsMethod,
} from '@/lib/coach/analytics-method';
import { declararUmbral, getUmbralesAtleta } from '@/lib/analytics/declaraciones';
import { desdeSesionDeAtleta, verificarAtletaDelCoach } from '@/lib/analytics/atleta-verificado';
import { loadAthleteHrZones } from '@/lib/athlete/hr-zones';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { closeTestSql, describeWithDb, getTestSql, settleCleanup } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('método ampliado y umbrales declarados (base real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update athletes set max_hr_bpm = 200 where id = ${fx.athleteId}`;
  });

  afterAll(async () => {
    await settleCleanup(async () => {
      await fx.cleanup();
    });
    await closeTestSql();
  });

  test('sin fila, los defectos; guardar el conjunto entero con listas; restaurar vuelve a los defectos', async () => {
    const antes = await getCoachAnalyticsMethodSetting(fx.coachId, sql);
    expect(antes.is_custom).toBe(false);
    expect(antes.method).toEqual(defaultCoachAnalyticsMethod());

    const propio = { ...defaultCoachAnalyticsMethod(), ctl_days: 28, fuentes_run: ['pulso', 'ritmo', 'esfuerzo'] as const, frescura_sobrecarga_hasta: -25, cumplimiento_base: 'carga' as const, cambio_sueno_horas: 0.5 };
    await upsertCoachAnalyticsMethod(fx.coachId, { ...propio, fuentes_run: [...propio.fuentes_run] }, sql);
    const vigente = await resolveEffectiveAnalyticsMethod(fx.coachId, sql);
    expect(vigente.ctl_days).toBe(28);
    expect(vigente.fuentes_run).toEqual(['pulso', 'ritmo', 'esfuerzo']);
    expect(vigente.fuentes_row).toEqual(['potencia', 'pulso', 'esfuerzo']);
    expect(vigente.frescura_sobrecarga_hasta).toBe(-25);
    expect(vigente.cumplimiento_base).toBe('carga');
    expect(vigente.cambio_sueno_horas).toBe(0.5);
    expect((await getCoachAnalyticsMethodSetting(fx.coachId, sql)).is_custom).toBe(true);

    await resetCoachAnalyticsMethod(fx.coachId, sql);
    expect(await resolveEffectiveAnalyticsMethod(fx.coachId, sql)).toEqual(defaultCoachAnalyticsMethod());
  });

  test('la tabla rechaza un peldaño fuera del vocabulario y una banda fuera de rango', async () => {
    await expect(
      upsertCoachAnalyticsMethod(fx.coachId, { ...defaultCoachAnalyticsMethod(), fuentes_run: ['vatios' as never] }, sql),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(upsertCoachAnalyticsMethod(fx.coachId, { ...defaultCoachAnalyticsMethod(), frescura_fresco_hasta: 99 }, sql)).rejects.toMatchObject({
      code: '23514',
    });
    await resetCoachAnalyticsMethod(fx.coachId, sql);
  });

  test('declarar de un toque, desde el coach, y la escalera sobre filas reales', async () => {
    const atleta = desdeSesionDeAtleta({ athlete_id: fx.athleteId });
    const coach = (await verificarAtletaDelCoach(fx.athleteId, fx.coachId, sql))!;

    // Solo la máxima: estimada, y las zonas de FC (el otro lector) ven lo mismo.
    expect((await getUmbralesAtleta(atleta, sql)).anclas.pulso).toMatchObject({ ancla: 'estimada' });
    expect((await loadAthleteHrZones(fx.athleteId, sql))?.source).toBe('from_max_hr');

    // El coach declara 172 → declarada, firmada por él; las zonas lo ven.
    const declarado = await declararUmbral(coach, { kind: 'lthr_bpm', value: 172, note: 'lo vi en la banda' }, sql);
    expect(declarado.anclas.pulso).toMatchObject({ valor: 172, ancla: 'declarada', fuente: 'declarada_coach' });
    expect((await loadAthleteHrZones(fx.athleteId, sql))?.lthr_bpm).toBe(172);

    // Un test ANTERIOR en fecha gana igualmente: el orden es de evidencia, no de fecha.
    await sql`
      insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, source, recorded_at)
      values (${fx.athleteId}, 'lthr_bpm', 168, 'bpm', 'coach_test', now() - interval '30 days')
    `;
    expect((await getUmbralesAtleta(atleta, sql)).anclas.pulso).toMatchObject({ valor: 168, ancla: 'medida' });
    await sql`delete from athlete_benchmarks where athlete_id = ${fx.athleteId}`;

    // Un umbral de remo declarado por split también vale en vatios, con el mismo peldaño.
    const remo = await declararUmbral(atleta, { kind: 'row_s_per_500m', value: 118 }, sql);
    expect(remo.anclas.ritmo.row).toMatchObject({ valor: 118, ancla: 'declarada', fuente: 'declarada_atleta' });
    expect(remo.anclas.potencia.row).toMatchObject({ ancla: 'declarada' });

    // Retirar la declaración de pulso cae al peldaño siguiente.
    const retirado = await declararUmbral(atleta, { kind: 'lthr_bpm', value: null }, sql);
    expect(retirado.anclas.pulso).toMatchObject({ ancla: 'estimada' });
    expect(retirado.declaraciones.map((d) => d.kind)).toEqual(['row_s_per_500m']);
  });
});
