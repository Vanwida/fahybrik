/**
 * EL HUSO DEL TELÉFONO SOLO SE GUARDA SI LO CONOCEN LOS DOS MOTORES — por la ruta
 * de sincronización, contra la base real.
 *
 * `athletes.timezone` lo escribe cada lote de HealthKit (TimeZone.current.identifier)
 * y cada lectura en SQL lo pasa a `at time zone`: un nombre que este Postgres no
 * conoce la tumbaría. Un huso así no se escribe y se queda el anterior; y el lote
 * entra igual, porque sus entrenos y muestras son hechos y el huso puede esperar a
 * la próxima sincronización. Al leer, un huso que Intl no entiende cae al defecto.
 *
 * Qué nombres heredados faltan depende de cada servidor: se miran contra el
 * `pg_timezone_names` vivo.
 */
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { loadAthleteTimezone, loadAthleteTimezones } from '@fahybrid/shared/domain/db/athlete-timezone';
import { loadPostgresTimezoneNames } from '@/lib/time-zones';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
// Va sin esperar después de responder: fuera de la prueba, o escribiría tras la limpieza.
vi.mock('@/lib/coach/attention/recompute', () => ({ recomputeAthlete: vi.fn(async () => undefined) }));
// El canal de avisos del servidor: aquí se mira qué se dijo en voz alta.
vi.mock('@/lib/observability/capture', () => ({ captureRouteError: vi.fn() }));
const { captureRouteError } = await import('@/lib/observability/capture');
const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { POST } = await import('@/app/api/sync/healthkit/route');

describeWithDb('sincronización de HealthKit: el huso del teléfono (base real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  /** Nombres que Intl acepta y este Postgres no: los heredados que le falten y uno que tzdata ya borró. */
  let unknownToPostgres: string[];

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const pgNames = await loadPostgresTimezoneNames(sql);
    unknownToPostgres = ['Europe/Kiev', 'Asia/Calcutta', 'US/Pacific-New'].filter((tz) => !pgNames.has(tz));
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue({
      athlete_id: BigInt(fx.athleteId),
      user_id: BigInt(fx.athleteUserId),
      email: 'ath@test.local',
      full_name: 'Test Athlete',
      jti: 'test',
    });
  });

  afterAll(async () => {
    await fx.cleanup(); // healthkit_sync_state y lo demás del atleta caen en cascada
    await closeTestSql();
  });

  const sync = (timezone: string) =>
    POST(
      new Request('http://x/api/sync/healthkit', {
        method: 'POST',
        headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
        body: JSON.stringify({
          batch: { athlete_id: String(fx.athleteId), sent_at: new Date().toISOString(), timezone, workouts: [], samples: [] },
        }),
      }),
    );
  const stored = async () =>
    (await sql<Array<{ timezone: string | null }>>`select timezone from athletes where id = ${fx.athleteId}`)[0]!
      .timezone;

  test('uno que conocen los dos se escribe', async () => {
    expect((await sync('America/Mexico_City')).status).toBe(200);
    expect(await stored()).toBe('America/Mexico_City');
    expect((await sync('Asia/Tokyo')).status).toBe(200);
    expect(await stored()).toBe('Asia/Tokyo');
  });

  test('uno que este Postgres no conoce, o que ni Intl entiende, no se escribe: se queda el anterior y el lote entra', async () => {
    expect(unknownToPostgres.length).toBeGreaterThan(0);
    await sql`update athletes set timezone = 'America/Mexico_City' where id = ${fx.athleteId}`;
    for (const tz of [...unknownToPostgres, 'Mars/Olympus_Mons']) {
      const res = await sync(tz);
      expect(res.status, tz).toBe(200);
      expect(await stored(), tz).toBe('America/Mexico_City');
    }
  });

  test('un huso que no se escribe deja rastro en el servidor, con el porqué; uno que se escribe, no', async () => {
    await sql`update athletes set timezone = 'America/Mexico_City' where id = ${fx.athleteId}`;
    const logged = () =>
      vi.mocked(captureRouteError).mock.calls.map(([, ctx]) => ctx.meta as Record<string, unknown>);

    vi.mocked(captureRouteError).mockClear();
    expect((await sync('Mars/Olympus_Mons')).status).toBe(200);
    expect(logged()).toEqual([
      expect.objectContaining({ athlete_id: String(fx.athleteId), timezone: 'Mars/Olympus_Mons', reason: 'unreadable' }),
    ]);

    for (const tz of unknownToPostgres) {
      vi.mocked(captureRouteError).mockClear();
      expect((await sync(tz)).status, tz).toBe(200);
      expect(logged(), tz).toEqual([expect.objectContaining({ timezone: tz, reason: 'unknown_to_postgres' })]);
    }

    vi.mocked(captureRouteError).mockClear();
    expect((await sync('Asia/Tokyo')).status).toBe(200);
    expect(await stored()).toBe('Asia/Tokyo');
    expect(captureRouteError).not.toHaveBeenCalled();
  });

  test('al leer, un huso guardado que Intl no entiende cae al defecto (y vacío, también)', async () => {
    await sql`update athletes set timezone = 'Mars/Olympus_Mons' where id = ${fx.athleteId}`;
    expect(await loadAthleteTimezone(sql, fx.athleteId)).toBe(BOX_TIMEZONE);
    expect((await loadAthleteTimezones(sql, [fx.athleteId])).get(String(fx.athleteId))).toBe(BOX_TIMEZONE);

    await sql`update athletes set timezone = 'Asia/Tokyo' where id = ${fx.athleteId}`;
    expect(await loadAthleteTimezone(sql, fx.athleteId)).toBe('Asia/Tokyo');

    await sql`update athletes set timezone = null where id = ${fx.athleteId}`;
    expect(await loadAthleteTimezone(sql, fx.athleteId)).toBe(BOX_TIMEZONE);
  });
});
