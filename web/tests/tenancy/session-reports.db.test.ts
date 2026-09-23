/**
 * Partes de sesión 1:1 entre clubs (hallazgo P0 nº2 de la revisión de aislamiento).
 *
 * El coach A podía escribir un parte sobre el atleta o el lead de B (los ids iban
 * del body al insert sin mirar), B lo veía en su ficha y A podía mandarle el
 * resumen por correo al lead de B. Dos coaches reales; fallan con el código de
 * antes.
 */
import { afterAll, expect, test } from 'vitest';

import {
  createSessionReport,
  getSessionReportForSummary,
  listSessionReportsForAthlete,
  listSessionReportsForLead,
} from '@/lib/coach/session-reports';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('tenancy — partes de sesión', () => {
  const sql = getTestSql();
  afterAll(async () => {
    await closeTestSql();
  });

  async function lead(fx: Fixture): Promise<number> {
    const r = await sql<Array<{ id: string }>>`
      insert into leads (email, coach_id) values (${`lead-${fx.coachId}-${Date.now()}@test.local`}, ${fx.coachId})
      returning id::text
    `;
    return Number(r[0]!.id);
  }
  async function appt(field: 'lead_id' | 'athlete_id', id: number): Promise<number> {
    const r = field === 'lead_id'
      ? await sql<Array<{ id: string }>>`insert into appointments (lead_id, requested_start) values (${id}, now()) returning id::text`
      : await sql<Array<{ id: string }>>`insert into appointments (athlete_id, requested_start) values (${id}, now()) returning id::text`;
    return Number(r[0]!.id);
  }
  async function cleanup(A: Fixture, B: Fixture) {
    await sql`delete from session_reports where coach_id in (${A.coachId}, ${B.coachId})`;
    await sql`delete from appointments where athlete_id in (${A.athleteId}, ${B.athleteId})
               or lead_id in (select id from leads where coach_id in (${A.coachId}, ${B.coachId}))`;
    await sql`delete from leads where coach_id in (${A.coachId}, ${B.coachId})`;
    await A.cleanup();
    await B.cleanup();
  }

  test('crear un parte sobre el atleta, el lead o la cita de otro club → 404', async () => {
    const A = await makeCoachAndAthlete(sql);
    const B = await makeCoachAndAthlete(sql);
    try {
      const leadB = await lead(B);
      const apptB = await appt('athlete_id', B.athleteId);

      await expect(
        createSessionReport({ coach_id: A.coachId, input: { athlete_id: B.athleteId, notes: 'x' } }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        createSessionReport({ coach_id: A.coachId, input: { lead_id: leadB, notes: 'x' } }),
      ).rejects.toMatchObject({ status: 404 });
      // Su propio atleta, pero la cita (con su hora y duración) es de otro club.
      await expect(
        createSessionReport({ coach_id: A.coachId, input: { athlete_id: A.athleteId, appointment_id: apptB } }),
      ).rejects.toMatchObject({ status: 404 });

      const n = await sql`select 1 from session_reports where coach_id = ${A.coachId}`;
      expect(n).toHaveLength(0);

      // Control: lo propio se guarda, con la cita propia.
      const apptA = await appt('athlete_id', A.athleteId);
      const ok = await createSessionReport({
        coach_id: A.coachId,
        input: { athlete_id: A.athleteId, appointment_id: apptA, notes: 'mío' },
      });
      expect(ok.notes).toBe('mío');
      expect((await listSessionReportsForAthlete(BigInt(A.athleteId))).map((r) => r.notes)).toEqual(['mío']);
    } finally {
      await cleanup(A, B);
    }
  });

  test('un parte colado antes del arreglo no sale en la ficha de B ni deja mandar el correo', async () => {
    const A = await makeCoachAndAthlete(sql);
    const B = await makeCoachAndAthlete(sql);
    try {
      const leadB = await lead(B);
      // Filas como las que el agujero dejaba escribir: coach A, sujeto de B.
      await sql`insert into session_reports (athlete_id, coach_id, occurred_at, duration_minutes, notes)
                values (${B.athleteId}, ${A.coachId}, now(), 30, 'INJECTED')`;
      const r = await sql<Array<{ id: string }>>`
        insert into session_reports (lead_id, coach_id, occurred_at, duration_minutes, notes)
        values (${leadB}, ${A.coachId}, now(), 30, 'INJECTED') returning id::text`;

      expect((await listSessionReportsForAthlete(BigInt(B.athleteId))).map((x) => x.notes)).not.toContain('INJECTED');
      expect((await listSessionReportsForLead(BigInt(leadB))).map((x) => x.notes)).not.toContain('INJECTED');
      expect(await getSessionReportForSummary({ id: BigInt(r[0]!.id), coach_id: A.coachId })).toBeNull();
    } finally {
      await cleanup(A, B);
    }
  });
});
