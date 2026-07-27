// Eventos por club (obra 0 multi-coach): listEvents con coach_id devuelve el
// catálogo compartido + los eventos PROPIOS del club, nunca los de otro; y
// updateEvent exige owner DENTRO del WHERE (cross-club = 404, cero filas).
//
// DB real (Neon branch): lo que se prueba ES el SQL del scope. Se salta con
// aviso cuando no hay TEST_DATABASE_URL.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { EventsError, listEvents, updateEvent } from '@/lib/coach/events';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('eventos — scope por club (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const eventIds: number[] = [];
  let clubA: Fixture;
  let clubB: Fixture;
  let catalogId = 0; // curado por admin: created_by_coach_id null
  let ownAId = 0; // manual del club A
  let ownBId = 0; // manual del club B

  const uniq = (tag: string) => `ev-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function seedEvent(opts: {
    name: string;
    createdByCoachId: number | null;
    visible?: boolean;
  }): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into events (slug, name, type, is_visible_to_athletes, created_by_coach_id)
      values (${uniq(opts.name)}, ${opts.name}, 'hyrox', ${opts.visible ?? false}, ${opts.createdByCoachId})
      returning id::text as id
    `;
    const id = Number(rows[0]!.id);
    eventIds.push(id);
    return id;
  }

  beforeAll(async () => {
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);

    catalogId = await seedEvent({ name: 'Catalogo HYROX', createdByCoachId: null, visible: true });
    ownAId = await seedEvent({ name: 'Privado club A', createdByCoachId: clubA.coachId });
    ownBId = await seedEvent({ name: 'Privado club B', createdByCoachId: clubB.coachId });
  });

  afterAll(async () => {
    if (eventIds.length) await sql`delete from events where id in ${sql(eventIds)}`;
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('coach: catálogo + los suyos, nunca los del otro club', async () => {
    const seen = (await listEvents({ scope: 'all', visibility: 'all', coach_id: clubA.coachId }, sql))
      .map((e) => Number(e.event_id))
      .filter((id) => eventIds.includes(id));
    expect(seen).toContain(catalogId);
    expect(seen).toContain(ownAId);
    expect(seen).not.toContain(ownBId);
  });

  test('admin (sin coach_id): sigue viendo TODO el catálogo, byte a byte', async () => {
    const seen = (await listEvents({ scope: 'all', visibility: 'all' }, sql))
      .map((e) => Number(e.event_id))
      .filter((id) => eventIds.includes(id));
    expect(seen).toEqual(expect.arrayContaining([catalogId, ownAId, ownBId]));
  });

  test('atleta (visible-only): la vista visible no cambia', async () => {
    const seen = (await listEvents({ scope: 'all', visibility: 'visible' }, sql))
      .map((e) => Number(e.event_id))
      .filter((id) => eventIds.includes(id));
    expect(seen).toEqual([catalogId]); // solo el visible; los privados jamás
  });

  test('updateEvent cross-club: 404 y CERO filas tocadas', async () => {
    await expect(
      updateEvent({
        event_id: BigInt(ownBId),
        owner: { kind: 'coach', coach_id: clubA.coachId },
        input: { name: 'pisado por A' },
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
    // Confirmar que EventsError y que la fila de B quedó intacta.
    await updateEvent({
      event_id: BigInt(ownBId),
      owner: { kind: 'coach', coach_id: clubA.coachId },
      input: { name: 'pisado por A' },
      client: sql,
    }).catch((err) => expect(err).toBeInstanceOf(EventsError));
    const row = await sql<{ name: string }[]>`select name from events where id = ${ownBId}`;
    expect(row[0]!.name).toBe('Privado club B');
  });

  test('updateEvent propio y de catálogo: el coach sigue editando igual que siempre', async () => {
    const own = await updateEvent({
      event_id: BigInt(ownAId),
      owner: { kind: 'coach', coach_id: clubA.coachId },
      input: { name: 'Privado club A v2' },
      client: sql,
    });
    expect(own.name).toBe('Privado club A v2');

    // El catálogo compartido sigue siendo curable por el coach (toggle visibilidad).
    const cat = await updateEvent({
      event_id: BigInt(catalogId),
      owner: { kind: 'coach', coach_id: clubA.coachId },
      input: { is_visible_to_athletes: false },
      client: sql,
    });
    expect(cat.is_visible_to_athletes).toBe(false);
  });

  test('updateEvent admin: el curador edita cualquier fila, incluida la de un club', async () => {
    const r = await updateEvent({
      event_id: BigInt(ownBId),
      owner: { kind: 'admin' },
      input: { location: 'Berlin' },
      client: sql,
    });
    expect(r.location).toBe('Berlin');
  });
});
