// loadGarminPlanSessions — qué sesiones se llevan el plan y a cuáles se les abre el detalle.
//
// Se simulan la semana del atleta, el detalle de asignación y las zonas: lo que
// se fija es la VENTANA de fechas (la fecha local del reloj, sin «hoy» del
// servidor), que una sesión que no es de correr no abra el detalle y no lea zonas,
// y que las de correr salgan con su plan.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prescription } from '@fahybrid/shared/domain/prescription';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ sql: {} }));
vi.mock('@/lib/athlete/week-plan', () => ({ buildAthleteWeekPlan: vi.fn() }));
vi.mock('@/lib/athlete/assignment-detail', () => ({ loadAssignmentDetail: vi.fn() }));
vi.mock('@/lib/athlete/hr-zones', () => ({ loadAthleteHrZones: vi.fn() }));
vi.mock('@/lib/wearables/watch-workout-source', () => ({
  WATCHABLE_MODALITY: 'run',
  loadAthleteZoneInputs: vi.fn(),
}));

const { buildAthleteWeekPlan } = await import('@/lib/athlete/week-plan');
const { loadAssignmentDetail } = await import('@/lib/athlete/assignment-detail');
const { loadAthleteHrZones } = await import('@/lib/athlete/hr-zones');
const { loadAthleteZoneInputs } = await import('@/lib/wearables/watch-workout-source');
const { loadGarminPlanSessions, sumarDias } = await import('@/lib/wearables/garmin-plan-source');

const dia = (iso_date: string, ...sessions: Array<{ id: string; modality: string }>) => ({
  iso_date,
  sessions: sessions.map((s) => ({ assignment_id: s.id, modality: s.modality })),
});

const CORRER = {
  workout: {
    blocks: [
      {
        items: [
          {
            exercise_category: 'running',
            prescription_json: {
              modality: 'run',
              structure: [{ role: 'main', elements: [{ kind: 'work', measure: { type: 'duration', s: 1800 }, target: null }] }],
            } as unknown as Prescription,
          },
        ],
      },
    ],
  },
};

const PARAMS = { athlete_id: BigInt(7), user_id: BigInt(3) };

beforeEach(() => {
  vi.mocked(buildAthleteWeekPlan).mockReset();
  vi.mocked(loadAssignmentDetail).mockReset().mockResolvedValue(CORRER as never);
  vi.mocked(loadAthleteHrZones).mockReset().mockResolvedValue(null);
  vi.mocked(loadAthleteZoneInputs)
    .mockReset()
    .mockResolvedValue({ benchmarks: {}, coachZones: [], hrZoneFractions: undefined } as never);
  // Tres semanas: el reloj puede pedir hasta 14 días desde hoy.
  vi.mocked(buildAthleteWeekPlan).mockImplementation(async (_a, offset) => {
    const semanas = [
      { days: [dia('2026-09-30', { id: '400', modality: 'run' }), dia('2026-10-01', { id: '401', modality: 'run' }), dia('2026-10-02', { id: '402', modality: 'strength' })] },
      { days: [dia('2026-10-05', { id: '403', modality: 'run' }, { id: '404', modality: 'run' })] },
      { days: [dia('2026-10-14', { id: '405', modality: 'run' })] },
    ];
    return semanas[offset ?? 0] as never;
  });
});

describe('sumarDias', () => {
  it('suma en calendario, cruzando mes y año', () => {
    expect(sumarDias('2026-10-01', 0)).toBe('2026-10-01');
    expect(sumarDias('2026-10-30', 3)).toBe('2026-11-02');
    expect(sumarDias('2026-12-30', 6)).toBe('2027-01-05');
  });
});

describe('la ventana y el tipo de sesión', () => {
  it('solo entran los días de from a from + days − 1, en orden; el día de ayer del servidor no cuenta si el reloj empieza hoy', async () => {
    const r = await loadGarminPlanSessions({ ...PARAMS, from: '2026-10-01', days: 5 });
    expect(r.map((s) => [s.asignacion_id, s.fecha])).toEqual([
      [401, '2026-10-01'],
      [402, '2026-10-02'],
      [403, '2026-10-05'],
      [404, '2026-10-05'],
    ]);
  });

  it('cubre 14 días: la tercera semana entra', async () => {
    const r = await loadGarminPlanSessions({ ...PARAMS, from: '2026-10-01', days: 14 });
    expect(r.at(-1)).toMatchObject({ asignacion_id: 405, fecha: '2026-10-14' });
  });

  it('una sesión de correr sale con su plan y su huella; una de fuerza sale fase_2 SIN abrir su detalle', async () => {
    const r = await loadGarminPlanSessions({ ...PARAMS, from: '2026-10-01', days: 2 });
    expect(r[0]).toMatchObject({ asignacion_id: 401, soportada: true });
    expect(typeof r[0]!.plan).toBe('string');
    expect(typeof r[0]!.huella).toBe('number');
    expect(r[1]).toEqual({ asignacion_id: 402, fecha: '2026-10-02', huella: null, soportada: false, motivo: 'fase_2' });
    expect(loadAssignmentDetail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(loadAssignmentDetail).mock.calls[0]![0]).toMatchObject({ assignment_id: BigInt(401), athlete_id: BigInt(7), self_user_id: BigInt(3) });
  });

  it('una ventana sin nada de correr no lee ni las zonas del atleta', async () => {
    const r = await loadGarminPlanSessions({ ...PARAMS, from: '2026-10-02', days: 1 });
    expect(r).toHaveLength(1);
    expect(loadAthleteZoneInputs).not.toHaveBeenCalled();
    expect(loadAthleteHrZones).not.toHaveBeenCalled();
  });

  it('una asignación que ya no existe (detalle null) no tira la respuesta: sin_estructura', async () => {
    vi.mocked(loadAssignmentDetail).mockResolvedValue(null);
    const r = await loadGarminPlanSessions({ ...PARAMS, from: '2026-10-01', days: 1 });
    expect(r[0]).toMatchObject({ asignacion_id: 401, soportada: false, motivo: 'sin_estructura' });
  });

  it('una misma asignación que sale en dos semanas se manda una vez', async () => {
    vi.mocked(buildAthleteWeekPlan).mockImplementation(
      async () => ({ days: [dia('2026-10-01', { id: '401', modality: 'run' })] }) as never,
    );
    const r = await loadGarminPlanSessions({ ...PARAMS, from: '2026-10-01', days: 1 });
    expect(r).toHaveLength(1);
  });
});
