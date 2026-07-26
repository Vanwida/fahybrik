// GET /api/wearables/garmin-ciq/today — el contrato que la app Connect IQ lleva
// esperando desde que se escribió.
//
// Se simula la frontera de resolución (auth + la fuente) para fijar lo único que
// decide la ruta: qué forma exacta sale por el cable. La app del reloj no tiene
// margen para interpretar — lee campos por nombre y pinta una pantalla por cada
// combinación, así que aquí se clavan los tres estados y el nombre.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WatchWorkout } from '@fahybrid/shared/domain/wearables/watch-workout';

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/wearables/watch-workout-source', () => ({
  findWatchSessionForDate: vi.fn(),
  loadRunWatchWorkout: vi.fn(),
}));

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { findWatchSessionForDate, loadRunWatchWorkout } = await import(
  '@/lib/wearables/watch-workout-source'
);
const { GET } = await import('@/app/api/wearables/garmin-ciq/today/route');

const SESSION = { athlete_id: BigInt(7), user_id: BigInt(3) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

const SERIES: WatchWorkout = {
  name: '26 jul · 8×400',
  sport: 'running',
  blocks: [
    {
      iterations: 8,
      steps: [
        { kind: 'work', measure: { type: 'distance', m: 400 }, target: null, name: '400 m fuerte' },
        { kind: 'recovery', measure: { type: 'distance', m: 200 }, target: null, name: 'trote' },
      ],
    },
  ],
};

function req(date: string | null): Request {
  const q = date === null ? '' : `?date=${date}`;
  return new Request(`https://fahybrid.com/api/wearables/garmin-ciq/today${q}`, {
    headers: { authorization: 'Bearer t' },
  });
}

beforeEach(() => {
  vi.mocked(getAthleteSessionFromBearer).mockReset().mockResolvedValue(SESSION);
  vi.mocked(findWatchSessionForDate).mockReset();
  vi.mocked(loadRunWatchWorkout).mockReset();
});

describe('autenticación y entrada', () => {
  it('sin bearer válido, 401', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    expect((await GET(req('2026-07-26'))).status).toBe(401);
  });

  it('sin fecha, 400 — el reloj SIEMPRE manda la suya', async () => {
    expect((await GET(req(null))).status).toBe(400);
  });

  it('con una fecha que no es YYYY-MM-DD, 400', async () => {
    expect((await GET(req('26-07-2026'))).status).toBe(400);
  });
});

describe('los tres estados que pinta el reloj', () => {
  it('día sin sesión → "Hoy no toca", y con 200: no hay nada es un estado, no un error', async () => {
    vi.mocked(findWatchSessionForDate).mockResolvedValue({ kind: 'none' });
    const res = await GET(req('2026-07-26'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ has_session: false, exportable: false });
  });

  it('día con fuerza → hay sesión pero no viaja, y se dice ANTES de descargar', async () => {
    vi.mocked(findWatchSessionForDate).mockResolvedValue({
      kind: 'not_watchable',
      title: 'Fuerza tren inferior',
    });
    const res = await GET(req('2026-07-26'));
    const body = await res.json();
    expect(body.has_session).toBe(true);
    expect(body.exportable).toBe(false);
    expect(body.reason).toBe('not_a_run_session');
    // No se resuelve el entreno: no hay nada que codificar.
    expect(loadRunWatchWorkout).not.toHaveBeenCalled();
  });

  it('día de carrera → nombre, resumen y la URL del fichero', async () => {
    vi.mocked(findWatchSessionForDate).mockResolvedValue({
      kind: 'watchable',
      assignment_id: '42',
      title: '8×400',
    });
    vi.mocked(loadRunWatchWorkout).mockResolvedValue({
      ok: true,
      workout: SERIES,
      assignment_id: '42',
      iso_date: '2026-07-26',
      title: '8×400',
    } as Awaited<ReturnType<typeof loadRunWatchWorkout>>);

    const body = await (await GET(req('2026-07-26'))).json();
    expect(body).toMatchObject({ has_session: true, exportable: true, reason: null });
    expect(body.fit_url).toBe(
      'https://fahybrid.com/api/athlete/wearables/garmin/workout?assignment_id=42',
    );
  });
});

describe('el nombre, que es lo que rompe en silencio', () => {
  it('devuelve el del modelo neutro, no el título de la sesión', async () => {
    vi.mocked(findWatchSessionForDate).mockResolvedValue({
      kind: 'watchable',
      assignment_id: '42',
      title: 'Series de velocidad — bloque 3',
    });
    vi.mocked(loadRunWatchWorkout).mockResolvedValue({
      ok: true,
      workout: SERIES,
      assignment_id: '42',
      iso_date: '2026-07-26',
      title: 'Series de velocidad — bloque 3',
    } as Awaited<ReturnType<typeof loadRunWatchWorkout>>);

    const body = await (await GET(req('2026-07-26'))).json();
    // El .FIT se guarda en el reloj con `workout.name`, y `getName()` es lo único
    // que la app puede leer de vuelta. Si aquí saliera el título, la app buscaría
    // un entreno que no existe con ese nombre y no encontraría nada.
    expect(body.workout_name).toBe('26 jul · 8×400');
    expect(body.workout_name).not.toBe('Series de velocidad — bloque 3');
  });
});

describe('el resumen de una línea', () => {
  it('cuenta los tramos de trabajo por repetición y suma los kilómetros', async () => {
    vi.mocked(findWatchSessionForDate).mockResolvedValue({
      kind: 'watchable',
      assignment_id: '42',
      title: '8×400',
    });
    vi.mocked(loadRunWatchWorkout).mockResolvedValue({
      ok: true,
      workout: SERIES,
      assignment_id: '42',
      iso_date: '2026-07-26',
      title: '8×400',
    } as Awaited<ReturnType<typeof loadRunWatchWorkout>>);

    const body = await (await GET(req('2026-07-26'))).json();
    // 8 tramos de trabajo · (400+200) × 8 = 4800 m
    expect(body.summary).toBe('8 tramos · 4,8 km');
  });

  it('si el trabajo va por tiempo, no inventa kilómetros', async () => {
    vi.mocked(findWatchSessionForDate).mockResolvedValue({
      kind: 'watchable',
      assignment_id: '9',
      title: 'Rodaje',
    });
    vi.mocked(loadRunWatchWorkout).mockResolvedValue({
      ok: true,
      workout: {
        name: 'Rodaje 45',
        sport: 'running',
        blocks: [
          {
            iterations: 1,
            steps: [
              { kind: 'work', measure: { type: 'duration', s: 2700 }, target: null, name: "45'" },
            ],
          },
        ],
      },
      assignment_id: '9',
      iso_date: '2026-07-26',
      title: 'Rodaje',
    } as Awaited<ReturnType<typeof loadRunWatchWorkout>>);

    const body = await (await GET(req('2026-07-26'))).json();
    expect(body.summary).toBe('1 tramo · 45 min');
  });
});
