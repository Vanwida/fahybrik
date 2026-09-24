// El día del coach es el de SU huso y el del atleta el suyo (DB real): a las
// 23:30 de un coach en Ciudad de México, en Madrid ya es mañana. Lo que decide el
// coach (pausas, bajas, el lunes de un plan, su roster) va en su calendario; la
// cuenta atrás de una carrera, en el del atleta.

import { afterAll, expect, test } from 'vitest';
import {
  loadCoachTimezoneOfAthlete,
  loadCoachToday,
  loadCoachTodayOfAthlete,
} from '@/lib/coach/coach-timezone';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
import { suggestFrom } from '@/lib/coach/week-adjust-copy';
import { mondayOfWeekInTz } from '@fahybrid/shared/domain/coach/coach-timezone';
import { isoDateString } from '@fahybrid/shared/domain/dates';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

// Martes 22-sept-2026, 23:30 en Ciudad de México (UTC−6) = miércoles 23, 07:30 en Madrid.
const NOW = new Date('2026-09-23T05:30:00Z');

test('el lunes de la semana en el huso del coach, no en el del defecto', () => {
  // Domingo 27, 23:30 en México = lunes 28 en Madrid: la semana del coach aún es la del 21.
  const sundayNight = new Date('2026-09-28T05:30:00Z');
  expect(isoDateString(mondayOfWeekInTz(sundayNight, 'America/Mexico_City'))).toBe('2026-09-21');
  expect(isoDateString(mondayOfWeekInTz(sundayNight, 'Europe/Madrid'))).toBe('2026-09-28');
});

test('suavizar desde hoy usa el día que le pasan (el del atleta)', () => {
  expect(suggestFrom('2026-09-21', '2026-09-27', '2026-09-22')).toBe('2026-09-22');
  expect(suggestFrom('2026-09-28', '2026-10-04', '2026-09-22')).toBe('2026-09-28');
});

describeWithDb('el día del coach en su huso (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    for (const fx of fixtures) await sql`delete from races where athlete_id = ${fx.athleteId}`;
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  async function mexicoCoach(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await sql`update coaches set timezone = 'America/Mexico_City' where id = ${fx.coachId}`;
    return fx;
  }

  test('«hoy» del coach y del coach de un atleta: el 22 en México aunque en Madrid sea el 23', async () => {
    const fx = await mexicoCoach();
    expect(await loadCoachToday(fx.coachId, { now: NOW, client: sql })).toBe('2026-09-22');
    expect(await loadCoachTodayOfAthlete(fx.athleteId, { now: NOW, client: sql })).toBe('2026-09-22');
    expect(await loadCoachTimezoneOfAthlete(fx.athleteId, sql)).toBe('America/Mexico_City');

    // Un huso que no es IANA cae al defecto sin romper.
    await sql`update coaches set timezone = 'Marte/Olympus' where id = ${fx.coachId}`;
    expect(await loadCoachToday(fx.coachId, { now: NOW, client: sql })).toBe('2026-09-23');
  });

  test('roster: la cuenta atrás de una carrera va con el día del ATLETA', async () => {
    const fx = await mexicoCoach();
    await sql`update athletes set timezone = 'America/Mexico_City' where id = ${fx.athleteId}`;
    // Su carrera es HOY para él (22), aunque en Madrid ya sea el 23.
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority, race_date, status)
      values (${fx.athleteId}, 'HYROX CDMX', 'hyrox', 'singles', 'open', 'men', 'target', '2026-09-22'::date, 'registered')
    `;
    const rows = await fetchAthletesForCoach({ coach_id: fx.coachId, client: sql, now: NOW });
    const me = rows.find((r) => r.athlete_id === String(fx.athleteId));
    expect(me?.target_race).toMatchObject({ name: 'HYROX CDMX', days_until: 0 });

    // El mismo instante para un atleta en Madrid: esa carrera ya pasó.
    await sql`update athletes set timezone = 'Europe/Madrid' where id = ${fx.athleteId}`;
    const later = await fetchAthletesForCoach({ coach_id: fx.coachId, client: sql, now: NOW });
    expect(later.find((r) => r.athlete_id === String(fx.athleteId))?.target_race).toBeNull();
  });
});
