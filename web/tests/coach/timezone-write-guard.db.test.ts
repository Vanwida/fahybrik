/**
 * UN HUSO SE GUARDA SOLO SI LO CONOCEN LOS DOS MOTORES (base real).
 *
 * TS resuelve el día con Intl; SQL, con `at time zone`. No comparten base de husos:
 * un nombre que Intl acepta y este Postgres no (los heredados de un tzdata
 * recortado, 'Europe/Kiev' o 'Asia/Calcutta'; un desfase como '+01:00', que
 * Postgres lee con el signo al revés) tumbaría cada consulta que lo usa. Se
 * comprueba AL ESCRIBIR: aquí la comprobación, la lista que ofrece Ajustes › Tu
 * club y el guardado del huso del club por su ruta.
 *
 * Qué nombres heredados faltan depende de cada servidor: se miran contra el
 * `pg_timezone_names` vivo, nunca contra una lista escrita aquí.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { isValidTimezone } from '@fahybrid/shared/domain/coach/coach-timezone';
import {
  isSafeTimezone,
  loadOfferableTimezones,
  loadPostgresTimezoneNames,
  offerableTimezones,
} from '@/lib/time-zones';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
const { getCoachSession } = await import('@/lib/auth/coach-session');
const { PATCH } = await import('@/app/api/coach/club/timezone/route');

const LEGACY = ['Europe/Kiev', 'Asia/Calcutta'];

/** La zona a la que Intl resuelve un nombre. */
const intlZoneOf = (tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;

describe('la lista del combo (puro)', () => {
  test('una zona va con su nombre si Postgres lo conoce; si no, con el que conoce para la misma zona; sin ninguno, no va', () => {
    // Premisa: Intl resuelve el nombre actual al de CLDR, que es el de su lista.
    expect(intlZoneOf('Asia/Kolkata')).toBe('Asia/Calcutta');
    expect(intlZoneOf('Europe/Kyiv')).toBe('Europe/Kiev');

    const known = new Set(['Europe/Madrid', 'Asia/Kolkata', 'Europe/Kyiv', 'America/Argentina/Buenos_Aires']);
    expect(
      offerableTimezones(['Europe/Madrid', 'Asia/Calcutta', 'Europe/Kiev', 'America/Buenos_Aires', 'Asia/Tokyo'], known),
    ).toEqual(['Europe/Madrid', 'Asia/Kolkata', 'Europe/Kyiv', 'America/Argentina/Buenos_Aires']);
  });

  test('si Postgres conoce el nombre heredado, se queda el heredado; y nunca va uno que Intl no entiende', () => {
    expect(offerableTimezones(['Asia/Calcutta'], new Set(['Asia/Calcutta', 'Asia/Kolkata']))).toEqual(['Asia/Calcutta']);
    expect(offerableTimezones(['Factory', 'Europe/Madrid'], new Set(['Factory', 'Europe/Madrid']))).toEqual([
      'Europe/Madrid',
    ]);
  });
});

describeWithDb('un huso se guarda solo si lo conocen Intl y Postgres (base real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];
  let pgNames: Set<string>;
  /** Los heredados que Intl acepta y ESTE Postgres no. */
  let legacyHere: string[];

  beforeAll(async () => {
    pgNames = await loadPostgresTimezoneNames(sql);
    legacyHere = LEGACY.filter((tz) => isValidTimezone(tz) && !pgNames.has(tz));
  });

  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  test('la comprobación: un huso canónico pasa; uno inventado y un desfase, no', async () => {
    expect(await isSafeTimezone('Europe/Madrid', sql)).toBe(true);
    expect(await isSafeTimezone('America/Mexico_City', sql)).toBe(true);
    expect(await isSafeTimezone('Mars/Olympus_Mons', sql)).toBe(false);

    // Premisa del desfase: Intl lo acepta y Postgres lo lee al revés (POSIX: UTC−1).
    expect(isValidTimezone('+01:00')).toBe(true);
    const [noon] = await sql<Array<{ h: number }>>`
      select extract(hour from '2026-01-01T12:00:00Z'::timestamptz at time zone '+01:00')::int as h
    `;
    expect(noon!.h).toBe(11);
    expect(await isSafeTimezone('+01:00', sql)).toBe(false);
  });

  test('la comprobación: un nombre heredado que este Postgres no conoce no pasa', async (ctx) => {
    if (legacyHere.length === 0) {
      ctx.skip();
      return;
    }
    for (const tz of legacyHere) {
      await expect(sql`select now() at time zone ${tz}`).rejects.toThrow();
      expect(await isSafeTimezone(tz, sql)).toBe(false);
    }
  });

  test('la lista del combo: todo lo que ofrece lo conocen los dos motores, y India y Ucrania siguen ahí', async () => {
    const zones = await loadOfferableTimezones(sql);
    expect(zones.length).toBeGreaterThan(300);
    expect(new Set(zones).size).toBe(zones.length);
    for (const tz of zones) {
      expect(pgNames.has(tz), tz).toBe(true);
      expect(isValidTimezone(tz), tz).toBe(true);
    }
    // Con el nombre heredado si esta base lo conoce; si no, con el actual.
    expect(zones).toContain(pgNames.has('Asia/Calcutta') ? 'Asia/Calcutta' : 'Asia/Kolkata');
    expect(zones).toContain(pgNames.has('Europe/Kiev') ? 'Europe/Kiev' : 'Europe/Kyiv');
    for (const tz of legacyHere) expect(zones).not.toContain(tz);
  });

  test('Ajustes › Tu club: uno bueno se guarda; uno que la base no conoce se rechaza con su porqué y no toca la columna', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(fx.coachId) } as never);
    const patch = (timezone: string | null) =>
      PATCH(new Request('http://x/api/coach/club/timezone', { method: 'PATCH', body: JSON.stringify({ timezone }) }));
    const messageOf = async (res: Response) => ((await res.json()) as { error: { message: string } }).error.message;
    const stored = async () =>
      (await sql<Array<{ tz: string | null }>>`select timezone as tz from coaches where id = ${fx.coachId}`)[0]!.tz;

    const ok = await patch('America/Mexico_City');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ timezone: 'America/Mexico_City', effective: 'America/Mexico_City' });
    expect(await stored()).toBe('America/Mexico_City');

    // Intl los entiende, esta base no: los heredados que le faltan y un desfase.
    for (const tz of [...legacyHere, '+01:00']) {
      const res = await patch(tz);
      expect(res.status, tz).toBe(422);
      expect(await messageOf(res)).toBe('Ese huso no se puede usar. Elige uno de la lista.');
      expect(await stored()).toBe('America/Mexico_City');
    }

    // Uno que ni Intl conoce: el mensaje de siempre.
    const unknown = await patch('Mars/Olympus_Mons');
    expect(unknown.status).toBe(422);
    expect(await messageOf(unknown)).toBe('Ese huso no existe. Elige uno de la lista.');
    expect(await stored()).toBe('America/Mexico_City');

    // Volver al defecto se guarda como NULL.
    expect((await patch(null)).status).toBe(200);
    expect(await stored()).toBeNull();
  });

  test('Ajustes › Tu club: uno que conocen los dos motores pero no cabe en la columna es un 422, no un 500', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(fx.coachId) } as never);
    const patch = (timezone: string) =>
      PATCH(new Request('http://x/api/coach/club/timezone', { method: 'PATCH', body: JSON.stringify({ timezone }) }));
    await sql`update coaches set timezone = 'America/Mexico_City' where id = ${fx.coachId}`;

    // Premisa: los husos POSIX con cifras en el primer tramo los conocen Intl y
    // Postgres, pero el CHECK de la columna (0241) no los admite.
    const posix = ['EST5EDT', 'PST8PDT'].filter((tz) => isValidTimezone(tz) && pgNames.has(tz));
    expect(posix.length).toBeGreaterThan(0);
    for (const tz of posix) {
      const res = await patch(tz);
      expect(res.status, tz).toBe(422);
      expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
        'Ese huso no se puede usar. Elige uno de la lista.',
      );
      const [row] = await sql<Array<{ tz: string | null }>>`select timezone as tz from coaches where id = ${fx.coachId}`;
      expect(row!.tz, tz).toBe('America/Mexico_City');
    }
  });
});
