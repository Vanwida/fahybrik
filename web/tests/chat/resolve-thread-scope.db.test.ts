// resolveThread está clavado al club (obra 0 multi-coach).
//
// EL FALLO QUE ESTO CIERRA
// ------------------------
// La query del coach filtraba `a.coach_id` (el atleta es mío) pero NO
// `t.coach_id` (el hilo es mío): tras una transferencia, el club nuevo heredaba
// el hilo — y el HISTORIAL — del club anterior. Con el filtro, el club nuevo
// abre un hilo PROPIO (lazy-create) y el del club viejo queda invisible.
//
// DB real (Neon branch): lo que se prueba ES el SQL del scope. Se salta con
// aviso cuando no hay TEST_DATABASE_URL.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { resolveThread } from '@/lib/chat/resolve-thread';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('resolveThread — scope por club (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  let clubA: Fixture; // dueño original del atleta
  let clubB: Fixture; // club receptor tras la transferencia
  let oldThreadId = '';

  const principal = (fx: Fixture) =>
    ({
      role: 'coach',
      user_id: BigInt(fx.coachUserId),
      coach_id: BigInt(fx.coachId),
    }) as const;

  beforeAll(async () => {
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);

    // El hilo histórico del club A con SU atleta.
    const t = await sql<{ id: string }[]>`
      insert into chat_threads (coach_id, athlete_id)
      values (${clubA.coachId}, ${clubA.athleteId})
      returning id::text as id
    `;
    oldThreadId = t[0]!.id;
  });

  afterAll(async () => {
    // Los hilos cascadan con el atleta; limpiar fixtures en orden inverso.
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('caso propio: el coach resuelve SU hilo con SU atleta, byte a byte', async () => {
    const r = await resolveThread({
      sql,
      principal: principal(clubA),
      athleteIdParam: String(clubA.athleteId),
    });
    expect(r).not.toBeNull();
    expect(r!.thread_id).toBe(oldThreadId);
    expect(Number(r!.coach_id)).toBe(clubA.coachId);
    expect(Number(r!.athlete_id)).toBe(clubA.athleteId);
  });

  test('cross-club: el club B NUNCA resuelve el hilo de A — ni antes ni después de la transferencia', async () => {
    // Antes de la transferencia el atleta no es suyo → null (404 en la ruta).
    const before = await resolveThread({
      sql,
      principal: principal(clubB),
      athleteIdParam: String(clubA.athleteId),
    });
    expect(before).toBeNull();

    // Transferencia: el atleta pasa al club B. El hilo viejo sigue siendo de A.
    await sql`update athletes set coach_id = ${clubB.coachId} where id = ${clubA.athleteId}`;
    try {
      const after = await resolveThread({
        sql,
        principal: principal(clubB),
        athleteIdParam: String(clubA.athleteId),
      });
      // B obtiene un hilo — pero uno NUEVO y suyo, jamás el histórico de A.
      expect(after).not.toBeNull();
      expect(after!.thread_id).not.toBe(oldThreadId);
      expect(Number(after!.coach_id)).toBe(clubB.coachId);

      // Y el club A, que ya no tiene al atleta, deja de resolver nada.
      const oldOwner = await resolveThread({
        sql,
        principal: principal(clubA),
        athleteIdParam: String(clubA.athleteId),
      });
      expect(oldOwner).toBeNull();

      // El hilo histórico de A sigue intacto en la tabla (no se toca ni se borra).
      const still = await sql<{ coach_id: string }[]>`
        select coach_id::text as coach_id from chat_threads where id = ${oldThreadId}::bigint
      `;
      expect(still[0]?.coach_id).toBe(String(clubA.coachId));
    } finally {
      // Deshacer la transferencia para que el cleanup de fixtures sea el estándar.
      await sql`update athletes set coach_id = ${clubA.coachId} where id = ${clubA.athleteId}`;
    }
  });
});
