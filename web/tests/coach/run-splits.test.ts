import { describe, expect, it } from 'vitest';
import { groupRunSplits, type RunLegRow } from '@/lib/execution/run-splits';
import { buildSegmentActuals, type SegmentActualRow } from '@/lib/dashboard/coach/session-actuals';

// El equivalente de erg-splits.test.ts para carrera (#66): un 6×800 graba SEIS
// filas en segment_executions (una por tramo, mig 0146) en vez de una fila con
// splits anidados. `run_splits` agrupa esas filas hermanas por item_uid y las
// cuelga de la fila leg_index===0 — la portadora — sin tocar ni ocultar las
// demás, que siguen siendo su propio SegmentActual de siempre.

const leg = (over: Partial<RunLegRow> & { position: number }): RunLegRow => ({
  item_uid: 'segment-20',
  leg_index: null,
  leg_role: null,
  leg_phase: null,
  duration_seconds: null,
  distance_meters: null,
  avg_pace_s_per_km: null,
  avg_hr: null,
  max_hr: null,
  incline_pct: null,
  run_cadence_spm: null,
  calories: null,
  ...over,
});

describe('groupRunSplits — agrupación pura', () => {
  it('agrupa los tramos que comparten item_uid, ordenados por leg_index, colgados de la fila leg_index===0', () => {
    const rows = [
      leg({ position: 5, leg_index: 0, leg_role: 'work', leg_phase: 'main', duration_seconds: 180, distance_meters: 800, avg_hr: 170 }),
      leg({ position: 6, leg_index: 1, leg_role: 'recovery', leg_phase: 'main', duration_seconds: 90, distance_meters: 200, avg_hr: 130 }),
      leg({ position: 7, leg_index: 2, leg_role: 'work', leg_phase: 'main', duration_seconds: 175, distance_meters: 800, avg_hr: 172 }),
    ];
    const grouped = groupRunSplits(rows);

    expect(grouped.size).toBe(1);
    const splits = grouped.get(5); // la fila portadora es la de leg_index 0 → position 5
    expect(splits).toHaveLength(3);
    expect(splits!.map((s) => s.leg_index)).toEqual([0, 1, 2]);
    expect(splits![0]).toMatchObject({ leg_role: 'work', leg_phase: 'main', duration_seconds: 180, distance_meters: 800, avg_hr: 170 });
    expect(splits![1]).toMatchObject({ leg_role: 'recovery', distance_meters: 200 });
  });

  it('no keyea nada para las filas que NO son leg_index===0 del grupo', () => {
    const rows = [
      leg({ position: 5, leg_index: 0, leg_role: 'work', leg_phase: 'main' }),
      leg({ position: 6, leg_index: 1, leg_role: 'recovery', leg_phase: 'main' }),
    ];
    const grouped = groupRunSplits(rows);
    expect(grouped.has(6)).toBe(false);
  });

  it('descarta el grupo entero si no hay ninguna fila leg_index===0 (dato incompleto)', () => {
    const rows = [
      leg({ position: 6, leg_index: 1, leg_role: 'recovery', leg_phase: 'main' }),
      leg({ position: 7, leg_index: 2, leg_role: 'work', leg_phase: 'main' }),
    ];
    expect(groupRunSplits(rows).size).toBe(0);
  });

  it('ignora filas sin item_uid, sin leg_index, o con atribución de tramo a medias', () => {
    const rows: RunLegRow[] = [
      leg({ position: 1, item_uid: null, leg_index: 0, leg_role: 'work', leg_phase: 'main' }),
      leg({ position: 2, leg_index: null }), // no es un bout de carrera estructurada
      leg({ position: 3, leg_index: 0, leg_role: 'work', leg_phase: null }), // atribución a medias
    ];
    expect(groupRunSplits(rows).size).toBe(0);
  });

  it('un grupo de un solo tramo (leg_index 0 sin hermanos) igual produce su array de un elemento', () => {
    const rows = [leg({ position: 9, item_uid: 'segment-30', leg_index: 0, leg_role: 'work', leg_phase: 'warmup', duration_seconds: 600 })];
    const grouped = groupRunSplits(rows);
    expect(grouped.get(9)).toHaveLength(1);
  });

  it('dos items distintos (dos carreras estructuradas en la misma sesión) se agrupan por separado', () => {
    const rows = [
      leg({ position: 1, item_uid: 'segment-20', leg_index: 0, leg_role: 'work', leg_phase: 'main' }),
      leg({ position: 2, item_uid: 'segment-25', leg_index: 0, leg_role: 'work', leg_phase: 'main' }),
    ];
    const grouped = groupRunSplits(rows);
    expect(grouped.size).toBe(2);
    expect(grouped.has(1)).toBe(true);
    expect(grouped.has(2)).toBe(true);
  });
});

describe('buildSegmentActuals — run_splits no filtra ni oculta filas', () => {
  const baseRow = (over: Partial<SegmentActualRow> = {}): SegmentActualRow => ({
    template_segment_id: null,
    position: 0,
    modality: 'run',
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
    run_cadence_spm: null,
    source: null,
    leg_index: null,
    leg_role: null,
    leg_phase: null,
    is_structural: false,
    raw_lap_data_json: null,
    ...over,
  });

  it('un 6×800 (aquí 3 tramos) sigue devolviendo TODAS sus filas — solo la portadora suma run_splits', () => {
    const rows = [
      baseRow({ position: 5, template_segment_id: '20', leg_index: 0, leg_role: 'work', leg_phase: 'main', distance_meters: 800, avg_hr: 170 }),
      baseRow({ position: 6, template_segment_id: '20', leg_index: 1, leg_role: 'recovery', leg_phase: 'main', distance_meters: 200, avg_hr: 130 }),
      baseRow({ position: 7, template_segment_id: '20', leg_index: 2, leg_role: 'work', leg_phase: 'main', distance_meters: 800, avg_hr: 172 }),
    ];
    const actuals = buildSegmentActuals(rows);

    // Nada se colapsa: siguen siendo tres filas, cada una con su propio dato.
    expect(actuals).toHaveLength(3);
    expect(actuals.map((a) => a.distance_meters)).toEqual([800, 200, 800]);
    expect(actuals.map((a) => a.item_uid)).toEqual(['segment-20', 'segment-20', 'segment-20']);

    const [carrier, mid, last] = actuals;
    expect(carrier!.run_splits).toHaveLength(3);
    expect(carrier!.run_splits!.map((s) => s.leg_role)).toEqual(['work', 'recovery', 'work']);
    // Las filas que NO son la portadora no llevan una copia redundante.
    expect(mid!.run_splits).toBeNull();
    expect(last!.run_splits).toBeNull();
    // Pero conservan sus propios campos, intactos — «no se filtra».
    expect(mid!.leg_role).toBe('recovery');
    expect(mid!.distance_meters).toBe(200);
  });

  it('una carrera continua (sin leg_index) nunca lleva run_splits', () => {
    const actuals = buildSegmentActuals([baseRow({ position: 0, template_segment_id: '9', distance_meters: 5000 })]);
    expect(actuals[0]!.run_splits).toBeNull();
  });

  it('un erg y una carrera estructurada en la misma sesión no se cruzan', () => {
    const rows = [
      baseRow({ position: 0, template_segment_id: '1', modality: 'row', raw_lap_data_json: { erg_splits: [{ index: 0, avg_power_w: 200 }] } }),
      baseRow({ position: 1, template_segment_id: '20', leg_index: 0, leg_role: 'work', leg_phase: 'main' }),
    ];
    const actuals = buildSegmentActuals(rows);
    expect(actuals[0]!.erg_splits).toHaveLength(1);
    expect(actuals[0]!.run_splits).toBeNull();
    expect(actuals[1]!.run_splits).toHaveLength(1);
    expect(actuals[1]!.erg_splits).toBeNull();
  });
});
