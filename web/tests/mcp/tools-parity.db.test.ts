// Paridad FH-81: las tools que ya existían en el panel y faltaban en el conector.
// Cada una llama a la MISMA lib que la ruta HTTP. Lo que se afirma aquí es que
// el acto llega al atleta (o se le oculta) por el mismo camino.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { createCommunication } from '@/lib/coach/communications';
import { publishCommunication } from '@/lib/coach/communications-publish';
import { createCommunicationSchema } from '@fahybrid/shared/domain/coach-communications';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeMonthTemplate,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';
import { call, connectAs, errorText, payload, seedCoachLogin } from '../utils/mcp-client';

type Json = Record<string, unknown>;

const START = '2026-09-07';

describeWithDb('MCP · paridad de escrituras (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const userIds: number[] = [];
  const eventIds: number[] = [];
  const levelIds: number[] = [];
  const communicationIds: string[] = [];

  let clubA: Fixture;
  let clubB: Fixture;
  let coachAClerkId = '';
  let coachBClerkId = '';
  let monthId = 0;
  let eventId = 0;
  let levelId = 0;

  beforeAll(async () => {
    await sql`select 1 as ok`;
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);

    coachAClerkId = await seedCoachLogin({ sql, coachId: clubA.coachId, tag: 'par-a', userIds });
    coachBClerkId = await seedCoachLogin({ sql, coachId: clubB.coachId, tag: 'par-b', userIds });

    const templateId = await makeTemplate({ fx: clubA, name: 'Fuerza de biblioteca' });
    const month = await makeMonthTemplate({
      fx: clubA,
      weekCount: 2,
      workoutDays: [1, 3],
      workoutTemplateId: templateId,
    });
    monthId = month.monthId;

    const events = await sql<Array<{ id: string }>>`
      insert into events (slug, name, type, start_date, is_visible_to_athletes)
      values (
        ${`mcp-parity-${Date.now()}`},
        'HYROX Valencia',
        'hyrox',
        '2026-11-14'::date,
        true
      )
      returning id::text as id
    `;
    eventId = Number(events[0]!.id);
    eventIds.push(eventId);

    const levels = await sql<Array<{ id: string }>>`
      insert into athlete_levels (coach_id, name, label, sort_order)
      values (${clubA.coachId}, 'N2', 'Desarrollo', 2)
      returning id::text as id
    `;
    levelId = Number(levels[0]!.id);
    levelIds.push(levelId);
  });

  afterAll(async () => {
    if (communicationIds.length > 0) {
      await sql`delete from coach_communications where id = any(${communicationIds}::bigint[])`;
    }
    if (eventIds.length > 0) {
      await sql`delete from races where event_id = any(${eventIds}::bigint[])`;
      await sql`delete from events where id = any(${eventIds}::bigint[])`;
    }
    if (levelIds.length > 0) {
      await sql`update athletes set level_id = null where level_id = any(${levelIds}::bigint[])`;
      await sql`delete from athlete_levels where id = any(${levelIds}::bigint[])`;
    }
    if (userIds.length > 0) {
      await sql`delete from notifications where user_id = any(${userIds}::bigint[])`;
      await sql`delete from coach_members where user_id = any(${userIds}::bigint[])`;
      await sql`delete from user_roles where user_id = any(${userIds}::bigint[])`;
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    const notified = [clubA?.athleteUserId, clubB?.athleteUserId].filter(
      (n): n is number => !!n,
    );
    if (notified.length > 0) {
      await sql`delete from notifications where user_id = any(${notified}::bigint[])`;
    }
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('assign_microcycle: materializa el mes y el club B no puede asignar al atleta de A', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'assign_microcycle', {
          athlete_id: clubA.athleteId,
          microcycle_id: monthId,
          start: START,
        }),
      );
      expect(body.start_date).toBe(START);
      expect(Number(body.assignment_count)).toBeGreaterThan(0);
      expect(Number(body.week_count)).toBe(2);

      const assigned = await sql<Array<{ n: number }>>`
        select count(*)::int as n from workout_assignments
        where athlete_id = ${clubA.athleteId}
          and scheduled_for >= ${START}::date
      `;
      expect(assigned[0]!.n).toBe(Number(body.assignment_count));
    } finally {
      await close();
    }

    const { client: other, close: closeB } = await connectAs(coachBClerkId);
    try {
      const text = errorText(
        await call(other, 'assign_microcycle', {
          athlete_id: clubA.athleteId,
          microcycle_id: monthId,
          start: '2026-10-05',
        }),
      );
      expect(text).toContain('No hay ningún atleta tuyo con ese identificador');
    } finally {
      await closeB();
    }
  });

  test('unpublish_week: marca draft y no borra el contenido', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const before = await sql<Array<{ n: number }>>`
        select count(*)::int as n from workout_assignments
        where athlete_id = ${clubA.athleteId}
          and scheduled_for >= ${START}::date
          and scheduled_for < (${START}::date + interval '7 days')
      `;
      expect(before[0]!.n).toBeGreaterThan(0);

      const body = payload(
        await call(client, 'unpublish_week', {
          athlete_id: clubA.athleteId,
          week_start: '2026-09-09',
        }),
      );
      expect(body.week_start).toBe(START);
      expect(body.status).toBe('draft');
      expect(body.athlete_sees_it).toBe(false);

      const row = await sql<Array<{ status: string; delivery_mode: string }>>`
        select status::text as status, delivery_mode
        from weekly_plans
        where athlete_id = ${clubA.athleteId} and week_start = ${START}::date
      `;
      expect(row[0]).toMatchObject({ status: 'draft', delivery_mode: 'manual' });

      const after = await sql<Array<{ n: number }>>`
        select count(*)::int as n from workout_assignments
        where athlete_id = ${clubA.athleteId}
          and scheduled_for >= ${START}::date
          and scheduled_for < (${START}::date + interval '7 days')
      `;
      expect(after[0]!.n).toBe(before[0]!.n);
    } finally {
      await close();
    }
  });

  test('archive_communication: un publicado se archiva; el de otro club no existe', async () => {
    const created = await createCommunication({
      coach_id: clubA.coachId,
      input: createCommunicationSchema.parse({
        kind: 'focus',
        title: 'Cadencia',
        anchor_kind: 'week',
        body: 'Pasos cortos.',
      }),
      sql,
    });
    communicationIds.push(created.id);
    await publishCommunication({
      coach_id: clubA.coachId,
      id: created.id,
      athlete_ids: [clubA.athleteId],
      sql,
    });

    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'archive_communication', { communication_id: Number(created.id) }),
      );
      expect(body.outcome).toBe('archived');

      const row = await sql<Array<{ status: string }>>`
        select status from coach_communications where id = ${created.id}::bigint
      `;
      expect(row[0]!.status).toBe('archived');
    } finally {
      await close();
    }

    const { client: other, close: closeB } = await connectAs(coachBClerkId);
    try {
      const text = errorText(
        await call(other, 'archive_communication', { communication_id: Number(created.id) }),
      );
      expect(text).toContain('comunicado tuyo');
    } finally {
      await closeB();
    }
  });

  test('set_target_race: fija el objetivo; el club B no toca al atleta de A', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'set_target_race', {
          athlete_id: clubA.athleteId,
          event_id: eventId,
          format: 'singles',
          division: 'open',
          gender_category: 'men',
          goal_time_seconds: 3600,
        }),
      );
      expect(body.race_id).toBeTruthy();
      const target = body.target_race as Json | null;
      expect(target?.name).toBe('HYROX Valencia');
    } finally {
      await close();
    }

    const { client: other, close: closeB } = await connectAs(coachBClerkId);
    try {
      const text = errorText(
        await call(other, 'set_target_race', {
          athlete_id: clubA.athleteId,
          event_id: eventId,
          format: 'singles',
          division: 'open',
          gender_category: 'men',
        }),
      );
      expect(text).toContain('No hay ningún atleta tuyo con ese identificador');
    } finally {
      await closeB();
    }
  });

  test('set_athlete_level: escribe el level_id del club; un nivel ajeno no entra', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'set_athlete_level', {
          athlete_id: clubA.athleteId,
          level_id: levelId,
        }),
      );
      expect(body.level_id).toBe(String(levelId));
      expect(body.level_name).toBe('N2');

      const row = await sql<Array<{ level_id: string; source: string }>>`
        select level_id::text as level_id, level_source as source
        from athletes where id = ${clubA.athleteId}
      `;
      expect(row[0]).toMatchObject({ level_id: String(levelId), source: 'coach' });
    } finally {
      await close();
    }

    const { client: other, close: closeB } = await connectAs(coachBClerkId);
    try {
      const text = errorText(
        await call(other, 'set_athlete_level', {
          athlete_id: clubA.athleteId,
          level_id: levelId,
        }),
      );
      expect(text).toContain('No hay ningún atleta tuyo con ese identificador');
    } finally {
      await closeB();
    }
  });
});
