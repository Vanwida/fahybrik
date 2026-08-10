// 0166 — el invariante: un atleta no puede tener dos athlete_month_assignments
// con fechas solapadas. Dos capas, dos pruebas:
//   1) la restricción EXCLUDE en sí (Postgres la rechaza, sin pasar por ninguna
//      capa de aplicación).
//   2) el bug real que la motivó: dos "Personalizar plan" para el MISMO atleta,
//      genuinamente CONCURRENTES (dos conexiones físicas distintas — la `sql` de
//      test-db.ts está fijada a `max: 1`, así que reusarla para ambas llamadas
//      las serializaría en la cola del pool y nunca ejercitaría la carrera de
//      verdad). Verifica el resultado, no el timing: gane quien gane, tiene que
//      quedar EXACTAMENTE un recibo — nunca dos.

import postgres from 'postgres';
import { afterAll, expect, test } from 'vitest';
import { isoDateString, mondayOfWeek } from '@fahybrid/shared/domain/dates';
import { personalizePlanForAthlete } from '@/lib/dashboard/coach/personalize-plan';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import type { Sql } from '@/lib/db';
import { closeTestSql, describeWithDb, getTestDbUrl, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeMonthTemplate, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('athlete_month_assignments — invariante de no-solape (0166)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  test('la restricción EXCLUDE rechaza dos ventanas solapadas para el mismo atleta, pero permite dos consecutivas', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { monthId } = await makeMonthTemplate({
      fx,
      weekCount: 1,
      workoutDays: [1],
      workoutTemplateId,
    });

    await sql`
      insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date, microcycle_ids, assignment_count)
      values (${fx.athleteId}, ${monthId}, '2026-08-10', '2026-08-16', '{}', 0)
    `;

    // Solapada (comparte el 16-ago) — RECHAZADA.
    await expect(
      sql`
        insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date, microcycle_ids, assignment_count)
        values (${fx.athleteId}, ${monthId}, '2026-08-16', '2026-08-23', '{}', 0)
      `,
    ).rejects.toMatchObject({ code: '23P01' });

    // Consecutiva (empieza el día DESPUÉS de que la primera termine) — PERMITIDA:
    // date es un tipo discreto, así que [.., 16-ago] y [17-ago, ..] no se solapan.
    const consecutive = await sql<Array<{ id: string }>>`
      insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date, microcycle_ids, assignment_count)
      values (${fx.athleteId}, ${monthId}, '2026-08-17', '2026-08-23', '{}', 0)
      returning id::text
    `;
    expect(consecutive).toHaveLength(1);

    await sql`delete from athlete_month_assignments where athlete_id = ${fx.athleteId}`;
  });

  test('dos "Personalizar plan" genuinamente concurrentes para el mismo atleta: uno gana, el otro ve already_personal/overlapping_plan, y sobrevive UN solo recibo — nunca dos', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { monthId: sourceMonthId } = await makeMonthTemplate({
      fx,
      weekCount: 2,
      workoutDays: [1, 3],
      workoutTemplateId,
    });
    const thisMonday = isoDateString(mondayOfWeek(new Date()));
    await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: sourceMonthId,
      start_date: thisMonday,
      client: sql,
    });

    // Una SEGUNDA conexión física real (no la `sql` compartida, fijada a
    // max:1 en test-db.ts) — así las dos llamadas compiten de verdad por el
    // advisory lock, en vez de quedar serializadas por el pool antes de que
    // ninguna lo tome.
    const url = getTestDbUrl();
    if (!url) throw new Error('unreachable — describeWithDb ya filtró esto');
    const secondConn = postgres(url, {
      ssl: 'require',
      max: 1,
      prepare: false,
      types: { bigint: postgres.BigInt },
    });

    try {
      const outcomes = await Promise.allSettled([
        personalizePlanForAthlete({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql }),
        personalizePlanForAthlete({
          coach_id: fx.coachId,
          athlete_id: fx.athleteId,
          client: secondConn as unknown as Sql,
        }),
      ]);

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejection = (rejected[0] as PromiseRejectedResult).reason as { code?: string };
      // Tres desenlaces limpios son posibles según en qué punto exacto quede
      // bloqueado el perdedor (nunca corrupción, en NINGUNO de los tres):
      //   · already_personal    — el caso típico: el ganador ya committeó su
      //     fork entero (incluida la materialización) cuando el perdedor
      //     re-lee bajo el lock.
      //   · no_active_plan      — el perdedor pasa el lock justo en la ventana
      //     (documentada en personalize-plan.ts) entre el commit de la
      //     transacción del fork y el commit —aparte— de la materialización:
      //     el recibo viejo ya se borró/recortó y el nuevo aún no existe.
      //   · overlapping_plan    — red de seguridad de 0166 si, por lo que sea,
      //     el lock no llegara a cubrir la ventana (instantiate-program.ts).
      // Los tres son intencionadamente aceptables: lo único que NUNCA puede
      // pasar es que sobreviva más de un recibo (comprobado abajo).
      expect(['already_personal', 'no_active_plan', 'overlapping_plan']).toContain(rejection.code);

      const winner = (fulfilled[0] as PromiseFulfilledResult<{ month_template_id: string }>).value;
      fx.monthTemplates.push({ monthId: Number(winner.month_template_id), weekIds: [] });

      // La verdad de la base de datos: UN solo recibo para este atleta — jamás
      // dos apuntando a la misma ventana (el bug real que esto reproduce:
      // producción, atleta 64, ids 44/45, mismo rango exacto).
      const receipts = await sql<Array<{ id: string; month_template_id: string }>>`
        select id::text, month_template_id::text from athlete_month_assignments
        where athlete_id = ${fx.athleteId}
      `;
      expect(receipts).toHaveLength(1);
      expect(receipts[0]!.month_template_id).toBe(winner.month_template_id);
    } finally {
      await secondConn.end({ timeout: 5 });
    }
  }, 30000);
});
