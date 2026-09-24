/**
 * EL UMBRAL DE PENDIENTE DEL COACH LLEGA A LA APP — contra base de datos REAL
 * (auditoría de la app del atleta, D-06).
 *
 * La app instalada lee `run_compliance.gradient_threshold_pct`
 * (`RunCompliance.gradientThresholdPct`, FAHYBRIKCore/Plan/RunCompliance.swift,
 * vía convertFromSnakeCase). El servidor mandaba solo `gradient_retires_pace_pct`:
 * el umbral del coach nunca llegaba y la app leía la carrera con su suelo del 3 %.
 * Aquí se fija que el detalle de una sesión sirve el número del coach con la
 * clave que decodifica la app, y la canónica sigue igual para el panel.
 */

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { patchCoachRunningThresholds } from '@/lib/coach/running-thresholds';
import { defaultCoachRunningThresholds } from '@fahybrid/shared/domain/coach/running-thresholds';

let session: { athlete_id: bigint; user_id: bigint; full_name: string } | null = null;
vi.mock('@/lib/auth/athlete-session', () => ({
  getAthleteSessionFromBearer: async () => session,
}));
const { GET } = await import('@/app/api/athlete/assignments/[id]/detail/route');

describeWithDb('run_compliance: el umbral del coach viaja con la clave que lee la app (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let assignmentId = 0;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    session = { athlete_id: BigInt(fx.athleteId), user_id: BigInt(fx.athleteUserId), full_name: 'Test' };
    const tpl = await makeTemplate({ fx, name: 'Rodaje con cuestas', format: 'steady' });
    assignmentId = await makeAssignment({ fx, templateId: tpl, scheduledForIso: '2026-09-22' });
  }, 60_000);

  afterAll(async () => {
    session = null;
    await sql`delete from coach_running_thresholds where coach_id = ${fx.coachId}`;
    await sql`delete from workout_assignments where athlete_id = ${fx.athleteId}`;
    await fx.cleanup();
    await closeTestSql();
  }, 60_000);

  async function runCompliance(): Promise<Record<string, unknown>> {
    const res = await GET(
      new Request(`http://localhost/api/athlete/assignments/${assignmentId}/detail`, {
        headers: { authorization: 'Bearer test' },
      }),
      { params: Promise.resolve({ id: String(assignmentId) }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    return body.run_compliance as Record<string, unknown>;
  }

  test('un coach que movió su umbral: la app recibe SU número en gradient_threshold_pct', async () => {
    await patchCoachRunningThresholds(fx.coachId, { gradient_retires_pace_pct: 8 }, sql);
    const rc = await runCompliance();
    expect(rc.gradient_threshold_pct).toBe(8);
    expect(rc.gradient_retires_pace_pct).toBe(8);
  });

  test('un coach que no lo tocó: viaja su defecto, con las dos claves', async () => {
    await patchCoachRunningThresholds(fx.coachId, { gradient_retires_pace_pct: null }, sql);
    const rc = await runCompliance();
    const def = defaultCoachRunningThresholds().gradient_retires_pace_pct;
    expect(rc.gradient_threshold_pct).toBe(def);
    expect(rc.gradient_retires_pace_pct).toBe(def);
  });
});
