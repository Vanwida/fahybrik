import { describe, expect, it } from 'vitest';
import {
  MIN_OVERLAP_FRACTION,
  measuredGapPatch,
  overlapSeconds,
  planSegmentFusion,
  SEGMENT_MEASURED_FIELDS,
  SEGMENT_STRUCTURAL_FIELDS,
  type DeviceLap,
  type StoredSegment,
} from '@fahybrid/shared/domain/execution-merge';

// La fusión de tramos: cuando un aparato manda sus vueltas de un entreno que la
// app ya midió, ¿qué fila es cuál y qué campo gana? Estos casos fijan las tres
// decisiones del modelo — la identidad no se destruye, el troceado lo manda quien
// midió los tramos, y las vueltas casan por TIEMPO y no por ordinal — sin tocar
// la base de datos (el módulo es puro).

const DEVICE = 'garmin';

function tramo(over: Partial<StoredSegment> & { id: number }): StoredSegment {
  return {
    source: 'gps',
    started_at: null,
    ended_at: null,
    measured: {},
    ...over,
  };
}

function vuelta(over: Partial<DeviceLap> & { index: number }): DeviceLap {
  return {
    started_at: '2026-08-01T07:00:00.000Z',
    ended_at: '2026-08-01T07:10:00.000Z',
    measured: {},
    ...over,
  };
}

describe('planSegmentFusion — quién manda en el troceado', () => {
  it('sin tramos de la app, las vueltas del aparato SON los tramos', () => {
    const plan = planSegmentFusion({
      existing: [],
      laps: [vuelta({ index: 0 }), vuelta({ index: 1 })],
      deviceSource: DEVICE,
      deviceOwnsExecution: true,
    });
    expect(plan.deviceOwnsSlicing).toBe(true);
    expect(plan.newLapIndexes).toEqual([0, 1]);
    expect(plan.merges).toEqual([]);
  });

  it('con un tramo medido por la app, el aparato NO crea filas', () => {
    const plan = planSegmentFusion({
      existing: [
        tramo({
          id: 10,
          started_at: '2026-08-01T07:00:00.000Z',
          ended_at: '2026-08-01T07:10:00.000Z',
        }),
      ],
      // Una vuelta que casa y otra que no toca nada: ninguna de las dos crea fila.
      laps: [
        vuelta({ index: 0 }),
        vuelta({
          index: 1,
          started_at: '2026-08-01T09:00:00.000Z',
          ended_at: '2026-08-01T09:20:00.000Z',
        }),
      ],
      deviceSource: DEVICE,
      deviceOwnsExecution: true,
    });
    expect(plan.deviceOwnsSlicing).toBe(false);
    expect(plan.newLapIndexes).toEqual([]);
    expect(plan.merges.map((m) => m.lapIndex)).toEqual([0]);
    expect(plan.droppedLapIndexes).toEqual([1]);
  });

  it('sus PROPIAS filas de un envío anterior no le quitan el troceado', () => {
    const plan = planSegmentFusion({
      existing: [tramo({ id: 5, source: DEVICE })],
      laps: [vuelta({ index: 0 })],
      deviceSource: DEVICE,
      deviceOwnsExecution: true,
    });
    expect(plan.deviceOwnsSlicing).toBe(true);
  });

  it('en una ejecución que no es suya nunca manda, aunque no haya tramos', () => {
    // El caso del registro a mano con el que el entreno del reloj solo se solapa
    // en el tiempo: rellenar huecos sí, inventar tramos en la sesión de otro no.
    const plan = planSegmentFusion({
      existing: [],
      laps: [vuelta({ index: 0 })],
      deviceSource: DEVICE,
      deviceOwnsExecution: false,
    });
    expect(plan.deviceOwnsSlicing).toBe(false);
    expect(plan.newLapIndexes).toEqual([]);
  });
});

describe('planSegmentFusion — casar por tiempo, no por ordinal', () => {
  // Tres tramos de la app y tres vueltas del reloj en ORDEN INVERSO: casar por
  // posición emparejaría 0↔0 (que es justo lo que hacía el código que borraba y
  // reescribía por orden); casar por tiempo empareja cada uno con el suyo.
  const existing = [
    tramo({ id: 1, started_at: '2026-08-01T07:00:00.000Z', ended_at: '2026-08-01T07:05:00.000Z' }),
    tramo({ id: 2, started_at: '2026-08-01T07:05:00.000Z', ended_at: '2026-08-01T07:10:00.000Z' }),
    tramo({ id: 3, started_at: '2026-08-01T07:10:00.000Z', ended_at: '2026-08-01T07:15:00.000Z' }),
  ];
  const laps = [
    vuelta({ index: 0, started_at: '2026-08-01T07:10:00.000Z', ended_at: '2026-08-01T07:15:00.000Z' }),
    vuelta({ index: 1, started_at: '2026-08-01T07:05:00.000Z', ended_at: '2026-08-01T07:10:00.000Z' }),
    vuelta({ index: 2, started_at: '2026-08-01T07:00:00.000Z', ended_at: '2026-08-01T07:05:00.000Z' }),
  ];

  it('empareja por solape, no por posición', () => {
    const plan = planSegmentFusion({ existing, laps, deviceSource: DEVICE, deviceOwnsExecution: true });
    expect(plan.merges.map((m) => [m.lapIndex, m.segmentId])).toEqual([
      [0, 3],
      [1, 2],
      [2, 1],
    ]);
  });

  it('es determinista: el mismo envío da el mismo plan', () => {
    const a = planSegmentFusion({ existing, laps, deviceSource: DEVICE, deviceOwnsExecution: true });
    const b = planSegmentFusion({ existing, laps, deviceSource: DEVICE, deviceOwnsExecution: true });
    expect(a).toEqual(b);
  });

  it('uno a uno: dos vueltas no casan con el mismo tramo', () => {
    const plan = planSegmentFusion({
      existing: [
        tramo({ id: 1, started_at: '2026-08-01T07:00:00.000Z', ended_at: '2026-08-01T07:20:00.000Z' }),
      ],
      laps: [
        vuelta({ index: 0, started_at: '2026-08-01T07:00:00.000Z', ended_at: '2026-08-01T07:10:00.000Z' }),
        vuelta({ index: 1, started_at: '2026-08-01T07:10:00.000Z', ended_at: '2026-08-01T07:20:00.000Z' }),
      ],
      deviceSource: DEVICE,
      deviceOwnsExecution: true,
    });
    expect(plan.merges).toHaveLength(1);
    expect(plan.droppedLapIndexes).toHaveLength(1);
  });

  it('un solape por debajo del umbral no es la misma unidad de trabajo', () => {
    // 2 min compartidos de una vuelta de 10 = 0.2 < MIN_OVERLAP_FRACTION.
    expect(MIN_OVERLAP_FRACTION).toBe(0.5);
    const plan = planSegmentFusion({
      existing: [
        tramo({ id: 1, started_at: '2026-08-01T07:00:00.000Z', ended_at: '2026-08-01T07:10:00.000Z' }),
      ],
      laps: [
        vuelta({ index: 0, started_at: '2026-08-01T07:08:00.000Z', ended_at: '2026-08-01T07:18:00.000Z' }),
      ],
      deviceSource: DEVICE,
      deviceOwnsExecution: true,
    });
    expect(plan.merges).toEqual([]);
    expect(plan.droppedLapIndexes).toEqual([0]);
  });

  it('una ventana de duración cero no casa con nada', () => {
    // Medido en producción (mig 0168): el tramo 574 tiene ended_at = started_at y
    // 565 s de zonas congeladas. La respuesta honesta ahí es «no se sabe».
    const plan = planSegmentFusion({
      existing: [
        tramo({ id: 1, started_at: '2026-08-01T07:00:00.000Z', ended_at: '2026-08-01T07:00:00.000Z' }),
      ],
      laps: [vuelta({ index: 0 })],
      deviceSource: DEVICE,
      deviceOwnsExecution: true,
    });
    expect(plan.merges).toEqual([]);
    expect(plan.droppedLapIndexes).toEqual([0]);
  });

  it('un tramo sin ventana tampoco casa', () => {
    const plan = planSegmentFusion({
      existing: [tramo({ id: 1 })],
      laps: [vuelta({ index: 0 })],
      deviceSource: DEVICE,
      deviceOwnsExecution: true,
    });
    expect(plan.merges).toEqual([]);
  });
});

describe('measuredGapPatch — el aparato solo rellena huecos', () => {
  const lap = vuelta({
    index: 0,
    measured: { avg_hr: 150, max_hr: 172, distance_meters: 1000, calories: 90 },
  });

  it('rellena lo que falta y no toca lo que hay', () => {
    const patch = measuredGapPatch(
      tramo({ id: 1, measured: { avg_hr: 138, distance_meters: null } }),
      lap,
    );
    expect(patch.avg_hr).toBeUndefined(); // ya medido por la app: intocable
    expect(patch.distance_meters).toBe(1000);
    expect(patch.max_hr).toBe(172);
    expect(patch.calories).toBe(90);
  });

  it('sin huecos, no aporta nada (y por eso el reenvío es inerte)', () => {
    const patch = measuredGapPatch(
      tramo({
        id: 1,
        measured: { avg_hr: 138, max_hr: 160, distance_meters: 950, calories: 80 },
      }),
      lap,
    );
    expect(patch).toEqual({});
  });

  it('un hueco que el aparato tampoco sabe sigue siendo un hueco', () => {
    const patch = measuredGapPatch(tramo({ id: 1 }), vuelta({ index: 0, measured: {} }));
    expect(patch).toEqual({});
  });
});

describe('clasificación de campos', () => {
  it('estructura y medida no se solapan', () => {
    const medida = new Set<string>(SEGMENT_MEASURED_FIELDS);
    const cruce = SEGMENT_STRUCTURAL_FIELDS.filter((f) => medida.has(f));
    expect(cruce).toEqual([]);
  });

  it('lo que solo sabe la app está en estructura, nunca en medida', () => {
    // Los tres que la mina se llevaba por delante y que un reloj no puede saber.
    for (const campo of ['leg_role', 'template_segment_id', 'hr_source'] as const) {
      expect(SEGMENT_STRUCTURAL_FIELDS).toContain(campo);
      expect(SEGMENT_MEASURED_FIELDS).not.toContain(campo as never);
    }
  });
});

describe('overlapSeconds', () => {
  it('cuenta solo lo compartido', () => {
    expect(
      overlapSeconds(
        { started_at: '2026-08-01T07:00:00.000Z', ended_at: '2026-08-01T07:10:00.000Z' },
        { started_at: '2026-08-01T07:08:00.000Z', ended_at: '2026-08-01T07:18:00.000Z' },
      ),
    ).toBe(120);
  });

  it('intervalos que solo se tocan no comparten nada', () => {
    expect(
      overlapSeconds(
        { started_at: '2026-08-01T07:00:00.000Z', ended_at: '2026-08-01T07:10:00.000Z' },
        { started_at: '2026-08-01T07:10:00.000Z', ended_at: '2026-08-01T07:20:00.000Z' },
      ),
    ).toBe(0);
  });
});
