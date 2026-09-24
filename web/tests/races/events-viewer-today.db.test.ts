// Una carrera pasa a «pasada» en el calendario de quien la mira (DECISIONS «Qué
// día es en cada sitio»): el atleta en el suyo, el coach en el de su club, el
// curador y el anónimo en el defecto. Antes era el día UTC para todos.
//
// El instante: 10 mar 2026, 12:00 UTC → 13:00 del 10 en Madrid, 01:00 del 11 en
// Auckland. Una carrera del 10 no ha pasado en Madrid (ni en UTC) y ya ha pasado
// para quien vive en Auckland.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { listEvents } from '@/lib/coach/events';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2026-03-10T12:00:00Z');
const RACE_DAY = '2026-03-10';

describeWithDb('carreras — «pasada» en el calendario de quien mira (DB real)', () => {
  const sql = getTestSql();
  let club: Fixture;
  let eventId = 0;

  beforeAll(async () => {
    club = await makeCoachAndAthlete(sql);
    await sql`update coaches set timezone = 'Pacific/Auckland' where id = ${club.coachId}`;
    await sql`update athletes set timezone = 'Pacific/Auckland' where id = ${club.athleteId}`;
    const rows = await sql<{ id: string }[]>`
      insert into events (slug, name, type, is_visible_to_athletes, created_by_coach_id, start_date, end_date)
      values (${`ev-viewer-today-${Date.now()}`}, 'Carrera del 10', 'hyrox', true, null, ${RACE_DAY}, ${RACE_DAY})
      returning id::text as id
    `;
    eventId = Number(rows[0]!.id);
  });

  afterAll(async () => {
    if (eventId) await sql`delete from events where id = ${eventId}`;
    await club?.cleanup();
    await closeTestSql();
  });

  const isPastFor = async (opts: Parameters<typeof listEvents>[0]) => {
    const all = await listEvents({ ...opts, scope: 'all', now: NOW }, sql);
    return all.find((e) => Number(e.event_id) === eventId)?.is_past;
  };

  test('el atleta, en su día: ya pasó', async () => {
    expect(await isPastFor({ visibility: 'visible', athlete_id: club.athleteId })).toBe(true);
  });

  test('el coach, en el día de su club: ya pasó', async () => {
    expect(await isPastFor({ visibility: 'all', coach_id: club.coachId })).toBe(true);
  });

  test('el anónimo y el curador, en el defecto: aún no', async () => {
    expect(await isPastFor({ visibility: 'visible', catalog_only: true })).toBe(false);
    expect(await isPastFor({ visibility: 'all' })).toBe(false);
  });

  test('«próximas» y «pasadas» siguen al mismo día', async () => {
    const upcoming = await listEvents({ visibility: 'visible', athlete_id: club.athleteId, scope: 'upcoming', now: NOW }, sql);
    const past = await listEvents({ visibility: 'visible', athlete_id: club.athleteId, scope: 'past', now: NOW }, sql);
    expect(upcoming.some((e) => Number(e.event_id) === eventId)).toBe(false);
    expect(past.some((e) => Number(e.event_id) === eventId)).toBe(true);
  });
});
