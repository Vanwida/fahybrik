// Una carrera vive en el calendario del ATLETA que la corre (DECISIONS «Qué día es
// en cada sitio», 2026-09-23), no en el día UTC de la sesión de la base. Cuatro
// lectores que decidían con `current_date`: la carrera objetivo del alta
// pendiente, el cron que va a buscar resultados de lo ya corrido, el aviso de
// cuenta atrás y las carreras de los miembros de un grupo.
//
// El instante: 10 mar 2031, 12:00 UTC → 01:00 del 11 en Auckland, 13:00 del 10 en
// Madrid (el defecto, huso nulo). Una carrera del 10 ya pasó para quien vive en
// Auckland y aún no para el defecto; con el día UTC (el 10) no habría pasado
// para nadie. Con el reloj de la base (hoy real) nada de 2031 habría pasado.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { listPendingIntake } from '@/lib/coach/intake';
import { runAutoImportResults } from '@/lib/cron/auto-import-results';
import { checkRaceCountdown } from '@/lib/notifications/triggers';
import { loadGroupPlanExtras } from '@/lib/dashboard/programming/group-plan';
import type { importAllRaces } from '@/lib/hyrox/hyresult';

const NOW = new Date('2031-03-10T12:00:00Z');
const AUCKLAND = 'Pacific/Auckland';

describeWithDb('carreras en el día del atleta (DB real)', () => {
  const sql = getTestSql();
  let club: Fixture;
  /** Athlete of `club` in Auckland (the fixture's own athlete). */
  let auckland = 0;
  /** A second athlete of the same coach, timezone unset → the default zone. */
  let madrid = 0;
  let madridUserId = 0;

  beforeAll(async () => {
    club = await makeCoachAndAthlete(sql);
    auckland = club.athleteId;
    await sql`update athletes set timezone = ${AUCKLAND} where id = ${auckland}`;
    const user = await sql<{ id: string }[]>`
      insert into users (email, role)
      values (${`athlete-day-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`}, 'athlete')
      returning id::text as id
    `;
    madridUserId = Number(user[0]!.id);
    const athlete = await sql<{ id: string }[]>`
      insert into athletes (user_id, coach_id, full_name)
      values (${madridUserId}, ${club.coachId}, 'Default Zone Athlete')
      returning id::text as id
    `;
    madrid = Number(athlete[0]!.id);
  });

  afterAll(async () => {
    // The user cascades to the athlete, its races and its notifications.
    if (madridUserId) await sql`delete from users where id = ${madridUserId}`;
    await sql`delete from notifications where user_id = ${club.athleteUserId}`;
    await sql`delete from races where athlete_id = ${auckland}`;
    await club?.cleanup();
    await closeTestSql();
  });

  async function race(
    athleteId: number,
    date: string,
    over: { name?: string; priority?: 'target' | 'secondary' | 'tune_up' } = {},
  ): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority, status, race_date)
      values (
        ${athleteId}, ${over.name ?? 'HYROX Test'}, 'hyrox', 'singles', 'open', 'men',
        ${over.priority ?? 'target'}::race_priority, 'planned', ${date}::date
      )
      returning id::text as id
    `;
    return Number(rows[0]!.id);
  }

  async function clearRaces(): Promise<void> {
    await sql`delete from races where athlete_id in (${auckland}, ${madrid})`;
  }

  it('alta pendiente: la carrera objetivo es la próxima en SU día', async () => {
    await clearRaces();
    await sql`update athletes set onboarded_at = ${'2031-03-01T10:00:00Z'}::timestamptz where id in (${auckland}, ${madrid})`;
    await race(auckland, '2031-03-10', { name: 'Ayer en Auckland' });
    await race(auckland, '2031-03-11', { name: 'Hoy en Auckland' });
    await race(madrid, '2031-03-10', { name: 'Hoy en Madrid' });

    const pending = await listPendingIntake({ coach_id: club.coachId, now: NOW, client: sql });
    const byId = new Map(pending.map((p) => [Number(p.athlete_id), p]));

    // Auckland: the 10th is his yesterday — his target is the 11th, his today.
    expect(byId.get(auckland)?.a_event_iso).toBe('2031-03-11');
    expect(byId.get(auckland)?.a_event_name).toBe('Hoy en Auckland');
    // The default zone: the 10th is still today, so it is still ahead.
    expect(byId.get(madrid)?.a_event_iso).toBe('2031-03-10');
    // The hours since onboarding run on the same injected clock (9 days + 2 h).
    expect(byId.get(auckland)?.hours_since_onboarded).toBe(9 * 24 + 2);
  });

  it('cron de resultados: una carrera pasa en el día de quien la corre', async () => {
    await clearRaces();
    await sql`update athletes set hyresult_slug = ${`slug-akl-${auckland}`} where id = ${auckland}`;
    await sql`update athletes set hyresult_slug = ${`slug-mad-${madrid}`} where id = ${madrid}`;
    try {
      const aklRace = await race(auckland, '2031-03-10');
      const madRace = await race(madrid, '2031-03-10');

      const called: number[] = [];
      const fakeImport = (async (p: { athlete_id: number; slug: string }) => {
        called.push(p.athlete_id);
        return { imported: 0, updated: 0, races: [] };
      }) as unknown as typeof importAllRaces;

      await runAutoImportResults({ client: sql, importRaces: fakeImport, now: NOW });

      // Auckland ran it yesterday (his day): chase the result.
      expect(called).toContain(auckland);
      // In the default zone it is still race day: nothing to chase yet.
      expect(called).not.toContain(madrid);

      const attempts = await sql<{ id: string; n: number; at: Date | null }[]>`
        select id::text as id, auto_import_attempts as n, last_auto_import_at as at
        from races where id in (${aklRace}, ${madRace})
      `;
      const byRace = new Map(attempts.map((a) => [Number(a.id), a]));
      // The try is counted on his passed race, stamped with the run's clock.
      expect(byRace.get(aklRace)?.n).toBe(1);
      expect(byRace.get(aklRace)?.at?.toISOString()).toBe(NOW.toISOString());
      expect(byRace.get(madRace)?.n).toBe(0);
    } finally {
      await sql`update athletes set hyresult_slug = null where id in (${auckland}, ${madrid})`;
    }
  });

  it('cuenta atrás: «mañana» es SU mañana', async () => {
    await clearRaces();
    const tomorrow = await race(auckland, '2031-03-12', { name: 'Mañana en Auckland' });
    const today = await race(auckland, '2031-03-11', { name: 'Hoy en Auckland' });

    await checkRaceCountdown({ sql, now: NOW });

    const sent = await sql<{ event_id: string; checkpoint: string }[]>`
      select payload_json->>'event_id' as event_id, payload_json->>'checkpoint' as checkpoint
      from notifications
      where user_id = ${club.athleteUserId} and type = 'event_reminder'
      order by id
    `;
    // The 12th is his tomorrow (UTC would say two days); the 11th is his today
    // (UTC would say «mañana», a day late).
    expect(sent).toEqual([{ event_id: String(tomorrow), checkpoint: '1' }]);
    expect(sent.some((n) => n.event_id === String(today))).toBe(false);

    // Once per checkpoint: a second run does not repeat it.
    await checkRaceCountdown({ sql, now: NOW });
    const again = await sql<{ n: number }[]>`
      select count(*)::int as n from notifications
      where user_id = ${club.athleteUserId} and type = 'event_reminder'
    `;
    expect(again[0]!.n).toBe(1);
  });

  it('grupo: cada miembro, con su propio día (fila a fila)', async () => {
    await clearRaces();
    // The same race for both members: gone for the one in Auckland, still ahead
    // for the one in the default zone — so it counts ONE athlete, not two.
    await race(auckland, '2031-03-10', { name: 'HYROX Compartida' });
    await race(madrid, '2031-03-10', { name: 'HYROX Compartida' });
    await race(auckland, '2031-03-11', { name: 'Solo Auckland' });

    const { races } = await loadGroupPlanExtras({
      coach_id: club.coachId,
      program_ids: [],
      member_ids: [String(auckland), String(madrid)],
      now: NOW,
      client: sql,
    });

    expect(races).toEqual([
      { name: 'HYROX Compartida', date: '2031-03-10', athletes: 1 },
      { name: 'Solo Auckland', date: '2031-03-11', athletes: 1 },
    ]);
  });
});
