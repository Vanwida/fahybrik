// GET /api/athlete/wearables/garmin/workout — orquestación de la ruta.
//
// Se simula la frontera de resolución (auth + `loadRunWatchWorkout`) para fijar lo
// que solo la ruta decide: los códigos de estado, las cabeceras del fichero y que
// el .FIT que sale del cuerpo es de verdad un .FIT. El codificador tiene su propia
// batería contra bytes reales.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decoder, Stream } from '@garmin/fitsdk';
import type { WatchWorkout } from '@fahybrid/shared/domain/wearables/watch-workout';

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/wearables/watch-workout-source', () => ({
  loadRunWatchWorkout: vi.fn(),
  listUpcomingRunSessions: vi.fn(),
}));

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { loadRunWatchWorkout, listUpcomingRunSessions } = await import(
  '@/lib/wearables/watch-workout-source'
);
const { GET } = await import('@/app/api/athlete/wearables/garmin/workout/route');
const { GET: GET_LIST } = await import('@/app/api/athlete/wearables/garmin/workouts/route');

const SESSION = { athlete_id: BigInt(7), user_id: BigInt(3) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

const WORKOUT: WatchWorkout = {
  name: 'Rodaje suave',
  sport: 'running',
  blocks: [
    {
      iterations: 1,
      steps: [
        {
          kind: 'work',
          measure: { type: 'duration', s: 1800 },
          target: null,
          name: "30' suave",
        },
      ],
    },
  ],
};

function req(url = 'http://localhost/api/athlete/wearables/garmin/workout', withAuth = true): Request {
  return new Request(url, { headers: withAuth ? { authorization: 'Bearer t' } : {} });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/athlete/wearables/garmin/workout', () => {
  it('401 sin bearer, y sin llegar a tocar el plan', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await GET(req(undefined, false));
    expect(res.status).toBe(401);
    expect(loadRunWatchWorkout).not.toHaveBeenCalled();
  });

  it('400 cuando assignment_id no es un identificador válido', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    const res = await GET(req('http://localhost/x?assignment_id=abc'));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_request');
    expect(loadRunWatchWorkout).not.toHaveBeenCalled();
  });

  it('404 cuando hoy no hay sesión', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    vi.mocked(loadRunWatchWorkout).mockResolvedValue({ ok: false, reason: 'no_session_today' });
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('no_session_today');
  });

  it('409 cuando la sesión de hoy no es de carrera', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    vi.mocked(loadRunWatchWorkout).mockResolvedValue({
      ok: false,
      reason: 'not_a_run_session',
      assignment_id: '99',
      title: 'Fuerza · sentadilla',
    });
    const res = await GET(req());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('not_a_run_session');
    expect(body.error.message).toContain('Fuerza · sentadilla');
  });

  it('200 devuelve un .FIT válido con las cabeceras de descarga', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    vi.mocked(loadRunWatchWorkout).mockResolvedValue({
      ok: true,
      workout: WORKOUT,
      assignment_id: '3457',
      iso_date: '2026-07-25',
      title: 'Rodaje suave',
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/vnd.ant.fit');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="entreno-2026-07-25-3457.fit"',
    );
    expect(res.headers.get('cache-control')).toBe('no-store');

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(res.headers.get('content-length')).toBe(String(bytes.length));

    const decoder = new Decoder(Stream.fromByteArray(bytes));
    expect(decoder.isFIT()).toBe(true);
    expect(decoder.checkIntegrity()).toBe(true);
    const { messages } = decoder.read();
    expect(messages.fileIdMesgs?.[0]?.type).toBe('workout');
    expect(messages.workoutMesgs?.[0]?.wktName).toBe('Rodaje suave');
    // El serial se ata a la asignación: re-descargar reemplaza en vez de duplicar.
    expect(messages.fileIdMesgs?.[0]?.serialNumber).toBe(3458);
  });

  it('pasa el assignment_id pedido al resolutor', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    vi.mocked(loadRunWatchWorkout).mockResolvedValue({ ok: false, reason: 'not_found' });
    const res = await GET(req('http://localhost/x?assignment_id=42'));
    expect(res.status).toBe(404);
    expect(loadRunWatchWorkout).toHaveBeenCalledWith({
      athlete_id: BigInt(7),
      user_id: BigInt(3),
      assignment_id: BigInt(42),
    });
  });
});

describe('GET /api/athlete/wearables/garmin/workouts', () => {
  it('401 sin bearer', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await GET_LIST(req());
    expect(res.status).toBe(401);
    expect(listUpcomingRunSessions).not.toHaveBeenCalled();
  });

  it('200 devuelve las sesiones de carrera por delante', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    const workouts = [
      { assignment_id: '1', iso_date: '2026-07-25', title: 'Series 6×400', is_today: true },
    ];
    vi.mocked(listUpcomingRunSessions).mockResolvedValue(workouts);
    const res = await GET_LIST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workouts });
    expect(listUpcomingRunSessions).toHaveBeenCalledWith(BigInt(7));
  });
});
