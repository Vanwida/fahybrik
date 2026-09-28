import { describe, expect, it } from 'vitest';
import {
  buildSegmentActuals,
  type SegmentActualRow,
  type SetActualRow,
} from '@/lib/dashboard/coach/session-actuals';

// Serie a serie (set_executions, mig 0088). La ejecución 138 de producción guardó
// 5×100 · 5×110 · 3×115 · 3×120 y el lector servía reps=null, kg=120 y volumen 0:
// ni el atleta ni el coach veían qué series hizo ni su RPE/RIR.

const baseRow = (over: Partial<SegmentActualRow> = {}): SegmentActualRow => ({
  id: '477',
  template_segment_id: '10',
  position: 0,
  modality: 'strength',
  started_at: null,
  ended_at: null,
  reps_completed: null,
  weight_used_kg: null,
  distance_meters: null,
  avg_pace_s_per_500m: null,
  avg_pace_s_per_km: null,
  avg_power_w: null,
  stroke_rate_spm: null,
  avg_hr: null,
  max_hr: null,
  calories: null,
  emom_rounds_completed: null,
  emom_rounds_prescribed: null,
  incline_pct: null,
  avg_gradient_pct: null,
  run_cadence_spm: null,
  source: null,
  leg_index: null,
  leg_role: null,
  leg_phase: null,
  is_structural: false,
  raw_lap_data_json: null,
  ...over,
});

const set = (i: number, reps: number | null, kg: string | null, over: Partial<SetActualRow> = {}): SetActualRow => ({
  segment_execution_id: '477',
  set_index: i,
  status: 'done',
  reps_actual: reps,
  load_actual_kg: kg,
  reps_prescribed: reps,
  load_prescribed_kg: kg,
  rpe: null,
  rir: null,
  tempo: null,
  rest_s: null,
  ...over,
});

describe('session-actuals · buildSegmentActuals · series (set_executions)', () => {
  it('sirve las series en orden, con RPE/RIR, y el volumen = Σ reps × kg', () => {
    const [a] = buildSegmentActuals(
      [baseRow({ weight_used_kg: '120.00' })],
      [
        set(4, 3, '120.00', { rpe: '8.5', rir: '1.0' }),
        set(1, 5, '100.00', { rpe: '7.0', rir: '3.0', tempo: '3-1-1-0', rest_s: 120 }),
        set(3, 3, '115.00', { rpe: '8.0', rir: '2.0' }),
        set(2, 5, '110.00', { rpe: '7.5', rir: '2.0' }),
      ],
    );
    expect(a!.sets.map((s) => [s.set_index, s.reps, s.kg])).toEqual([
      [1, 5, 100],
      [2, 5, 110],
      [3, 3, 115],
      [4, 3, 120],
    ]);
    expect(a!.sets[0]).toMatchObject({ rpe: 7, rir: 3, tempo: '3-1-1-0', rest_s: 120, status: 'done' });
    expect(a!.sets[3]).toMatchObject({ rpe: 8.5, rir: 1 });
    expect(a!.volume_kg).toBe(500 + 550 + 345 + 360);
  });

  it('una serie saltada se ve pero no suma; una escalada sí suma', () => {
    const [a] = buildSegmentActuals(
      [baseRow({ id: '9' })],
      [
        set(1, 5, '100', { segment_execution_id: '9' }),
        set(2, null, null, { segment_execution_id: '9', status: 'skipped' }),
        set(3, 5, '90', { segment_execution_id: '9', status: 'scaled' }),
      ],
    );
    expect(a!.sets.map((s) => s.status)).toEqual(['done', 'skipped', 'scaled']);
    expect(a!.volume_kg).toBe(950);
  });

  it('las series van a SU tramo; sin series, el volumen es la línea única o null', () => {
    const rows = buildSegmentActuals(
      [
        baseRow({ id: '1', position: 0, reps_completed: 10, weight_used_kg: '60' }),
        baseRow({ id: '2', position: 1 }),
        baseRow({ id: '3', position: 2, modality: 'run', distance_meters: '1000' }),
      ],
      [set(1, 8, '70', { segment_execution_id: '2' })],
    );
    expect(rows[0]!.sets).toEqual([]);
    expect(rows[0]!.volume_kg).toBe(600);
    expect(rows[1]!.sets).toHaveLength(1);
    expect(rows[1]!.volume_kg).toBe(560);
    expect(rows[2]!.sets).toEqual([]);
    expect(rows[2]!.volume_kg).toBeNull();
  });

  it('peso corporal: reps sin carga no inventan kilos', () => {
    const [a] = buildSegmentActuals(
      [baseRow({ id: '5' })],
      [set(1, 12, null, { segment_execution_id: '5' }), set(2, 10, null, { segment_execution_id: '5' })],
    );
    expect(a!.sets).toHaveLength(2);
    expect(a!.volume_kg).toBeNull();
  });

  it('sin id de tramo (fixtures viejos) no se cuelga ninguna serie', () => {
    const [a] = buildSegmentActuals([baseRow({ id: undefined })], [set(1, 5, '100')]);
    expect(a!.sets).toEqual([]);
  });
});
