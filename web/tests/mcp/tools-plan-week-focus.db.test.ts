// `set_week_focus`, hablado por un cliente MCP de verdad contra la DB.
//
// Lo que importa probar y por qué no vale un mock:
//   · La fecha que da el coach se ajusta SOLA al lunes de esa semana — es la
//     clave real de `weekly_plans`, y equivocarla escribiría en la fila de
//     al lado.
//   · EL GOTCHA: `weekly_plans.status` nace 'draft' por default (0021). Si el
//     upsert de `set_week_focus` no fijara 'published' explícito en el INSERT,
//     poner un foco convertiría de golpe una semana VISIBLE en OCULTA. Se
//     prueba leyendo la columna `status` en crudo, no solo la respuesta de la
//     tool.
//   · Un `status='draft'` YA puesto por el coach (una semana que está
//     construyendo a mano) NO se toca al escribir el foco.
//   · Foco vacío/null borra el override.
//   · Cruzado: el club B no puede tocar la semana de un atleta de A.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { call, connectAs, errorText, payload, seedCoachLogin } from '../utils/mcp-client';

/** Un miércoles cualquiera — para probar que la tool ajusta sola al lunes. */
const WEDNESDAY = '2026-08-05';
const MONDAY = '2026-08-03';

type Json = Record<string, unknown>;

describeWithDb('MCP · set_week_focus (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const userIds: number[] = [];

  let clubA: Fixture;
  let clubB: Fixture;
  let coachAClerkId = '';
  let coachBClerkId = '';

  beforeAll(async () => {
    await sql`select 1 as ok`;
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);
    coachAClerkId = await seedCoachLogin({ sql, coachId: clubA.coachId, tag: 'focus-a', userIds });
    coachBClerkId = await seedCoachLogin({ sql, coachId: clubB.coachId, tag: 'focus-b', userIds });
  });

  afterAll(async () => {
    await sql`delete from weekly_plans where athlete_id in (${clubA.athleteId}, ${clubB.athleteId})`;
    if (userIds.length > 0) {
      await sql`delete from audit_log where actor_user_id = any(${userIds}::bigint[])`;
      await sql`delete from coach_members where user_id = any(${userIds}::bigint[])`;
      await sql`delete from user_roles where user_id = any(${userIds}::bigint[])`;
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('fija el foco de una fecha a mitad de semana: se ajusta sola al lunes, y NACE published (nunca draft)', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'set_week_focus', {
          athlete_id: clubA.athleteId,
          date: WEDNESDAY,
          focus: 'Series de umbral',
        }),
      );

      expect(body.week_start).toBe(MONDAY);
      expect(body.focus).toBe('Series de umbral');
      const visibility = body.visibility as Json;
      expect(visibility.athlete_sees_it).toBe(true);
      expect(body._resumen as string).toContain('foco «Series de umbral»');

      // La columna en crudo: el gotcha del default 'draft' del esquema (0021).
      const row = await sql<Array<{ status: string; focus: string | null }>>`
        select status::text as status, focus from weekly_plans
        where athlete_id = ${clubA.athleteId} and week_start = ${MONDAY}::date
      `;
      expect(row).toHaveLength(1);
      expect(row[0]!.status).toBe('published');
      expect(row[0]!.focus).toBe('Series de umbral');

      // Auditoría: canal del conector, firmada por la persona — encontrada por
      // la fila REAL de weekly_plans que acaba de tocarse (join por entity_id).
      const audit = await sql<Array<{ action: string; channel: string }>>`
        select al.action::text as action, al.channel
        from audit_log al
        join weekly_plans wp on wp.id = al.entity_id and al.entity_type = 'weekly_plans'
        where wp.athlete_id = ${clubA.athleteId} and wp.week_start = ${MONDAY}::date
      `;
      expect(audit.length).toBeGreaterThanOrEqual(1);
      expect(audit[0]).toMatchObject({ action: 'update', channel: 'mcp' });
    } finally {
      await close();
    }
  });

  test('un status draft YA puesto por el coach no se toca al escribir el foco', async () => {
    const otherMonday = '2026-08-17';
    await sql`
      insert into weekly_plans (athlete_id, week_start, status)
      values (${clubA.athleteId}, ${otherMonday}::date, 'draft')
    `;

    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'set_week_focus', {
          athlete_id: clubA.athleteId,
          date: otherMonday,
          focus: 'Descarga',
        }),
      );
      const visibility = body.visibility as Json;
      expect(visibility.athlete_sees_it).toBe(false);
      expect(visibility.state).toBe('draft');

      const row = await sql<Array<{ status: string; focus: string | null }>>`
        select status::text as status, focus from weekly_plans
        where athlete_id = ${clubA.athleteId} and week_start = ${otherMonday}::date
      `;
      expect(row[0]!.status).toBe('draft');
      expect(row[0]!.focus).toBe('Descarga');
    } finally {
      await close();
    }
  });

  test('foco vacío borra el override', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'set_week_focus', {
          athlete_id: clubA.athleteId,
          date: WEDNESDAY,
          focus: '   ',
        }),
      );
      expect(body.focus).toBeNull();
      expect(body._resumen as string).toContain('foco borrado');

      const row = await sql<Array<{ focus: string | null }>>`
        select focus from weekly_plans
        where athlete_id = ${clubA.athleteId} and week_start = ${MONDAY}::date
      `;
      expect(row[0]!.focus).toBeNull();
    } finally {
      await close();
    }
  });

  test('cruzado: el club B no puede tocar la semana de un atleta de A', async () => {
    const { client, close } = await connectAs(coachBClerkId);
    try {
      const res = await call(client, 'set_week_focus', {
        athlete_id: clubA.athleteId,
        date: '2026-09-07',
        focus: 'Intento ajeno',
      });
      const text = errorText(res);
      expect(text).toContain('No hay ningún atleta tuyo con ese identificador');

      const row = await sql<Array<{ focus: string | null }>>`
        select focus from weekly_plans
        where athlete_id = ${clubA.athleteId} and week_start = '2026-09-07'::date
      `;
      expect(row).toHaveLength(0);
    } finally {
      await close();
    }
  });
});
